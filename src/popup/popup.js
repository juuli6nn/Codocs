import { SUPPORTED_LANGUAGES } from '../lib/languages.js';

/*
 * Popup UI. Lets the user choose a language and trigger formatting. Work is
 * handed to the service worker through chrome.storage and the result is polled
 * back, since the popup may close before the job completes.
 */

const langSelect   = document.getElementById('lang-select');
const btnSelection = document.getElementById('btn-selection');
const btnWholeDoc  = document.getElementById('btn-whole-doc');
const statusEl     = document.getElementById('status');

// Build the language dropdown from the shared language list.
for (const { value, label } of SUPPORTED_LANGUAGES) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  langSelect.appendChild(opt);
}

// Restore and persist the chosen language.
chrome.storage.local.get('language', ({ language }) => {
  if (language) langSelect.value = language;
});

langSelect.addEventListener('change', () => {
  chrome.storage.local.set({ language: langSelect.value });
});

btnSelection.addEventListener('click', async () => {
  const language = langSelect.value;
  setStatus('loading', 'Formatting selection…');
  setButtons(true, btnSelection);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { setStatus('error', 'No active tab found.'); return; }
    if (!tab.url?.includes('docs.google.com/document')) {
      setStatus('error', 'Open a Google Doc first.'); return;
    }

    // Queue the job in storage, then nudge the worker to pick it up. If the nudge
    // is dropped, the worker still finds the job on its next wake.
    await chrome.storage.local.remove('codocs_result');
    await chrome.storage.local.set({ codocs_job: { type: 'format-selection', tabId: tab.id, language } });
    chrome.runtime.sendMessage({ type: 'run-job' }).catch(() => {});

    const res = await pollResult(20000);
    if (res?.ok) {
      const lang = res.detectedLanguage && res.detectedLanguage !== 'plaintext' ? ` (${res.detectedLanguage})` : '';
      setStatus('success', `Formatted${lang} — press Ctrl+V in the doc to paste.`);
    } else {
      setStatus('error', res?.error || 'Unknown error.');
    }
  } catch (err) {
    setStatus('error', err.message);
  } finally {
    setButtons(false);
  }
});

btnWholeDoc.addEventListener('click', async () => {
  const language = langSelect.value;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('docs.google.com/document')) {
    setStatus('error', 'Open a Google Doc first.'); return;
  }

  setStatus('loading', 'Scanning for code…');
  setButtons(true, btnWholeDoc);

  try {
    await chrome.storage.local.remove('codocs_result');
    await chrome.storage.local.set({ codocs_job: { type: 'format-whole-doc', language } });
    chrome.runtime.sendMessage({ type: 'run-job' }).catch(() => {});

    const res = await pollResult(30000);
    if (res?.ok) {
      const n = res.formatted ?? 0;
      setStatus('success', n === 0 ? (res.message || 'No code detected.') : `Formatted ${n} block${n === 1 ? '' : 's'}.`);
    } else {
      setStatus('error', res?.error || 'Unknown error.');
    }
  } catch (err) {
    setStatus('error', err.message);
  } finally {
    setButtons(false);
  }
});

// Poll storage for the worker's result until it arrives or we time out.
async function pollResult(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(500);
    const { codocs_result } = await chrome.storage.local.get('codocs_result');
    if (codocs_result) {
      await chrome.storage.local.remove('codocs_result');
      return codocs_result;
    }
  }
  throw new Error('Timed out — no response from background after ' + (timeoutMs / 1000) + 's.');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function setStatus(type, text) {
  statusEl.className = `status ${type}`;
  statusEl.textContent = text;
}

function setButtons(disabled, loadingBtn) {
  // The whole-document button is "coming soon", so it stays disabled and is not
  // toggled here.
  btnSelection.disabled = disabled;
  if (disabled && btnSelection === loadingBtn) btnSelection.dataset.state = 'loading';
  else delete btnSelection.dataset.state;
}
