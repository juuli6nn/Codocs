import { tokenize } from './lib/tokenize.js';
import { buildClipboardHtml } from './lib/render-html.js';
import { reindentCode } from './lib/reindent.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

/*
 * Codocs content script.
 *
 * Runs inside every Google Docs frame. Google Docs renders text on a canvas
 * rather than in the DOM, so the selection can only be read through the
 * clipboard. This script captures copied text, builds a styled HTML version of
 * it, and writes that back to the clipboard for the user to paste.
 */

/*
 * Cache the most recent clipboard text whenever a copy occurs — whether the user
 * pressed Ctrl+C or we triggered the copy programmatically. Google Docs writes to
 * the clipboard asynchronously, so we read a few times and keep the latest result;
 * the final read reflects what Docs actually finished writing. Listening in every
 * frame ensures we catch copies from the editing surface, which lives in an iframe.
 */
document.addEventListener('copy', () => {
  const stamp = Date.now();
  for (const delay of [120, 280, 480]) {
    setTimeout(async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text?.trim()) {
          // Keep only the most recent read from this copy.
          const { codocs_last_copy } = await chrome.storage.local.get('codocs_last_copy');
          if (!codocs_last_copy || codocs_last_copy.gesture !== stamp || codocs_last_copy.read < delay) {
            chrome.storage.local.set({ codocs_last_copy: { text, time: Date.now(), gesture: stamp, read: delay } });
          }
        }
      } catch {}
    }, delay);
  }
}, true);

/*
 * Lightweight on-screen toast. The keyboard shortcut runs while the popup is
 * closed, so this is how the user gets feedback in that case.
 */
function showToast(message, kind = 'success') {
  if (window.self !== window.top) return;
  const existing = document.getElementById('codocs-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'codocs-toast';
  const bg = kind === 'error' ? '#e06c75' : '#2f343f';
  const accent = kind === 'error' ? '#ffffff' : '#98c379';
  toast.style.cssText = [
    'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:2147483647', `background:${bg}`, 'color:#fff',
    'font:600 13px/1.4 "Google Sans",Roboto,Arial,sans-serif',
    'padding:12px 18px', 'border-radius:8px',
    'box-shadow:0 4px 16px rgba(0,0,0,0.35)', 'display:flex', 'align-items:center',
    'gap:10px', 'pointer-events:none', 'opacity:0', 'transition:opacity .15s ease',
  ].join(';');
  toast.innerHTML =
    `<span style="color:${accent};font-size:15px;">${kind === 'error' ? '✕' : '✓'}</span>` +
    `<span>${message}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, kind === 'error' ? 4000 : 3500);
}

/*
 * Handle format requests. Only the top frame listens, so the work runs once even
 * though the script is injected into every frame.
 */
if (window.self === window.top) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'ping') {
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === 'format-selection') {
      (async () => {
        const iframe = document.querySelector('iframe.docs-texteventtarget-iframe');

        // Record what's on the clipboard before we copy. Because Docs copies
        // asynchronously, the clipboard changing away from this value is our
        // signal that the current selection has actually been captured.
        let before = null;
        try { before = await navigator.clipboard.readText(); } catch {}

        const tStart = Date.now();
        await chrome.storage.local.remove('codocs_last_copy');

        // Copy the current selection on the user's behalf, so they don't need a
        // separate Ctrl+C before invoking the shortcut.
        try { (iframe?.contentDocument || document).execCommand('copy'); } catch {}

        // Poll until the clipboard differs from the snapshot, which means the new
        // selection has landed. We accept changed content from either the copy
        // listener above or a direct read.
        let text = null;
        for (let i = 0; i < 14; i++) {
          await wait(120);

          const { codocs_last_copy } = await chrome.storage.local.get('codocs_last_copy');
          if (codocs_last_copy && codocs_last_copy.time >= tStart &&
              codocs_last_copy.text?.trim() && codocs_last_copy.text !== before) {
            text = codocs_last_copy.text;
            break;
          }

          // A direct read works on the keyboard-shortcut path, where the page
          // still has focus. Only accept it if it differs from the snapshot.
          if (before !== null) {
            try {
              const now = await navigator.clipboard.readText();
              if (now?.trim() && now !== before) { text = now; break; }
            } catch {}
          }
        }

        // If nothing changed, the user most likely re-formatted the same text, so
        // the snapshot is the correct content. If instead the copy silently failed,
        // they can fall back to pressing Ctrl+C first, which always captures the
        // live selection.
        if (!text?.trim() && before?.trim()) {
          text = before;
        }

        if (!text?.trim()) {
          showToast('Couldn\'t read the selection — press Ctrl+C first, then Ctrl+Shift+Y', 'error');
          sendResponse({ ok: false, error: 'No selection captured.' });
          return;
        }

        const lang = (!msg.language || msg.language === 'auto') ? null : msg.language;

        // Normalize line endings, collapse runs of blank lines, then re-indent.
        let code = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd();
        code = reindentCode(code, lang);

        const { tokens, detectedLanguage } = tokenize(code, lang);
        const html = buildClipboardHtml(tokens);

        // Place the styled HTML on the clipboard. We do this through a temporary
        // editable element rather than the async Clipboard API so it works
        // regardless of which frame currently holds focus.
        const ok = writeHtmlToClipboard(html);
        if (!ok) {
          showToast('Could not format — click inside the doc and try again', 'error');
          sendResponse({ ok: false, error: 'Clipboard write failed.' });
          return;
        }

        // The user pastes with their own Ctrl+V. Browsers block a programmatic
        // paste here because our earlier clipboard read consumed the user-gesture
        // permission, so a manual paste is the reliable path.
        const langNote = detectedLanguage && detectedLanguage !== 'plaintext' ? ` (${detectedLanguage})` : '';
        showToast(`Formatted${langNote} — press Ctrl+V to paste`);
        sendResponse({ ok: true, detectedLanguage, needsManualPaste: true });
      })();
      return true;
    }
  });
}

/*
 * Copy an HTML string to the clipboard. Selecting the contents of a hidden
 * editable element and running the copy command preserves the rich formatting,
 * which the async Clipboard API can't reliably do across frames.
 */
function writeHtmlToClipboard(html) {
  const div = document.createElement('div');
  div.contentEditable = 'true';
  div.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;';
  div.innerHTML = html;
  document.body.appendChild(div);
  const range = document.createRange();
  range.selectNodeContents(div);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch {}
  sel.removeAllRanges();
  div.remove();
  return copied;
}
