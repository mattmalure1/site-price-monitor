// service-worker.js — Background service worker for Discord Chat Exporter
// Handles cross-origin attachment fetching from Discord CDN

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type === 'FETCH_ATTACHMENT') {
    fetch(msg.url)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.arrayBuffer();
      })
      .then(function (buf) {
        var bytes = new Uint8Array(buf);
        var chunks = [];
        var chunkSize = 32768;
        for (var i = 0; i < bytes.length; i += chunkSize) {
          chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
        }
        sendResponse({ ok: true, data: btoa(chunks.join('')) });
      })
      .catch(function (err) {
        sendResponse({ ok: false, error: err.message });
      });
    return true; // async response
  }
});
