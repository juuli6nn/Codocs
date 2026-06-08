chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'offscreen-read-clipboard') {
    navigator.clipboard.readText()
      .then(text => sendResponse({ ok: true, text }))
      .catch(e => sendResponse({ ok: false, error: e.name + ': ' + e.message }));
    return true;
  }

  if (msg.type === 'offscreen-write-clipboard') {
    const htmlBlob = new Blob([msg.html], { type: 'text/html' });
    const plainBlob = new Blob([msg.plain], { type: 'text/plain' });
    navigator.clipboard.write([
      new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': plainBlob }),
    ])
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e.name + ': ' + e.message }));
    return true;
  }
});
