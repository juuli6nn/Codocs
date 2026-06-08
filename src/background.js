import { tokenize } from './lib/tokenize.js';
import { isCodeParagraph } from './lib/detector.js';
import { buildDocsRequests } from './lib/render-docs.js';

/*
 * Codocs service worker.
 *
 * Coordinates the two formatting modes:
 *   - Selection: delegates to the content script, which reads the selection and
 *     writes styled HTML back to the clipboard.
 *   - Whole document: calls the Google Docs API directly to recolor every code
 *     paragraph in place.
 *
 * The popup and the service worker communicate through chrome.storage rather than
 * message replies, because the popup can close before an async job finishes. Jobs
 * are written to storage; results are written back and the popup polls for them.
 */

const DOCS_API = 'https://docs.googleapis.com/v1/documents';

// Surface unexpected failures back to the popup instead of failing silently.
self.addEventListener('error', (e) => {
  chrome.storage.local.set({ codocs_result: { ok: false, error: 'Worker error: ' + e.message } });
});
self.addEventListener('unhandledrejection', (e) => {
  chrome.storage.local.set({ codocs_result: { ok: false, error: 'Worker error: ' + (e.reason?.message || String(e.reason)) } });
});

// Pick up a pending job from storage and run it, writing the outcome back.
async function checkAndRunJob() {
  const { codocs_job } = await chrome.storage.local.get('codocs_job');
  if (!codocs_job) return;
  await chrome.storage.local.remove('codocs_job');
  try {
    let result;
    if (codocs_job.type === 'format-selection') {
      result = await runFormatSelection(codocs_job.tabId, codocs_job.language || 'auto');
    } else if (codocs_job.type === 'format-whole-doc') {
      result = await formatWholeDoc(codocs_job.language || 'auto');
    }
    await chrome.storage.local.set({ codocs_result: { ok: true, ...result } });
  } catch (err) {
    await chrome.storage.local.set({ codocs_result: { ok: false, error: err.message } });
  }
}

// Any message simply wakes the worker so it checks for queued jobs.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  sendResponse({ alive: true });
  checkAndRunJob();
  return false;
});

// Keyboard shortcut handler. Uses the toolbar badge to give quick feedback, since
// the popup isn't open when the shortcut is used.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'format-selection') return;

  // Show a pending badge so the user can confirm the shortcut fired.
  chrome.action.setBadgeText({ text: '...' });
  chrome.action.setBadgeBackgroundColor({ color: '#61aeee' });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('docs.google.com/document')) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#e06c75' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
    return;
  }
  const { language = 'auto' } = await chrome.storage.local.get('language');
  await chrome.storage.local.remove('codocs_result');
  await chrome.storage.local.set({ codocs_job: { type: 'format-selection', tabId: tab.id, language } });
  await checkAndRunJob();

  // Reflect the result on the badge.
  chrome.storage.local.get('codocs_result', ({ codocs_result }) => {
    const ok = codocs_result?.ok;
    chrome.action.setBadgeText({ text: ok ? '✓' : '✗' });
    chrome.action.setBadgeBackgroundColor({ color: ok ? '#98c379' : '#e06c75' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
  });
});

// Also check for queued jobs when the worker first starts.
chrome.runtime.onInstalled.addListener(checkAndRunJob);
chrome.runtime.onStartup.addListener(checkAndRunJob);

// ─── Selection formatting ─────────────────────────────────────────────────────

async function runFormatSelection(tabId, language) {
  // Make sure the content script is present — it may be missing if the tab was
  // open before the extension loaded, or if the worker restarted after a reload.
  await ensureContentScript(tabId);

  const result = await chrome.tabs.sendMessage(tabId, { type: 'format-selection', language })
    .catch(e => ({ ok: false, error: e.message }));

  if (!result?.ok) {
    throw new Error(result?.error || 'The page didn\'t respond. Refresh the Google Doc and try again.');
  }

  return { detectedLanguage: result.detectedLanguage };
}

// ─── Content script injection ──────────────────────────────────────────────────

async function ensureContentScript(tabId) {
  // A ping confirms whether the script is already running.
  const alive = await chrome.tabs.sendMessage(tabId, { type: 'ping' })
    .then(() => true)
    .catch(() => false);
  if (alive) return;

  // Otherwise inject every content script declared in the manifest.
  const manifest = chrome.runtime.getManifest();
  for (const cs of manifest.content_scripts || []) {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: cs.all_frames ?? false },
      files: cs.js,
    }).catch(() => {});
  }
  // Give the freshly injected script a moment to register its listener.
  await new Promise(r => setTimeout(r, 200));
}

// ─── Whole-document formatting ──────────────────────────────────────────────────

async function formatWholeDoc(language) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) throw new Error('No active tab.');
  const docIdMatch = tab.url.match(/\/document\/d\/([A-Za-z0-9_-]+)\//);
  if (!docIdMatch) throw new Error('Not a Google Doc URL.');
  const docId = docIdMatch[1];

  const token = await getAuthToken();
  const docRes = await fetch(`${DOCS_API}/${docId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!docRes.ok) throw new Error(`Docs API ${docRes.status}: ${await docRes.text()}`);
  const doc = await docRes.json();

  const codeParagraphs = findCodeParagraphs(doc, language);
  if (codeParagraphs.length === 0) return { formatted: 0, message: 'No code detected.' };

  // Apply edits from the end of the document backwards so that inserting styling
  // into one paragraph doesn't shift the indices of paragraphs above it.
  codeParagraphs.sort((a, b) => b.startIndex - a.startIndex);

  const allRequests = [];
  for (const para of codeParagraphs) {
    const lang = para.detectedLanguage !== 'auto' ? para.detectedLanguage : null;
    const { tokens } = tokenize(para.text, lang);
    allRequests.push(...buildDocsRequests(para.startIndex, para.text, tokens));
  }

  const updateRes = await fetch(`${DOCS_API}/${docId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: allRequests }),
  });
  if (!updateRes.ok) throw new Error(`batchUpdate ${updateRes.status}: ${await updateRes.text()}`);
  return { formatted: codeParagraphs.length };
}

// Walk the document and return the paragraphs that look like source code.
function findCodeParagraphs(doc, userLanguage) {
  const results = [];
  for (const element of doc.body?.content || []) {
    if (!element.paragraph || element.paragraph.bullet) continue;
    const text = (element.paragraph.elements || [])
      .map(el => el.textRun?.content || '').join('').replace(/\n$/, '');
    if (!text.trim()) continue;
    const detection = isCodeParagraph(text);
    if (!detection.isCode) continue;
    results.push({
      startIndex: element.startIndex ?? 0,
      text,
      detectedLanguage: userLanguage !== 'auto' ? userLanguage : (detection.language || 'auto'),
    });
  }
  return results;
}

// Request an OAuth token for the Google Docs API. Prompts the user to sign in the
// first time. Requires a valid oauth2 client_id in the manifest (see README).
function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(token);
    });
  });
}
