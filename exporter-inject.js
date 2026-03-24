// exporter-inject.js — Page-level script injected into Discord's context
// Captures the Authorization token by intercepting fetch/XHR requests
// Communicates with the content script via window.postMessage

(function () {
  'use strict';

  if (window.__discordExporterInjected) return;
  window.__discordExporterInjected = true;

  let capturedToken = null;

  function sendToken(token) {
    if (!token || token === capturedToken) return;
    capturedToken = token;
    window.postMessage({ type: 'DISCORD_EXPORTER_TOKEN', token: token }, '*');
  }

  // --- Intercept fetch() ---
  const originalFetch = window.fetch;
  window.fetch = function () {
    const args = arguments;
    let headers = null;

    if (args[1] && args[1].headers) {
      headers = args[1].headers;
    }

    if (headers) {
      // Headers can be a Headers object, plain object, or array of arrays
      if (headers instanceof Headers) {
        const auth = headers.get('Authorization');
        if (auth) sendToken(auth);
      } else if (Array.isArray(headers)) {
        for (const pair of headers) {
          if (pair[0] && pair[0].toLowerCase() === 'authorization') {
            sendToken(pair[1]);
            break;
          }
        }
      } else if (typeof headers === 'object') {
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'authorization') {
            sendToken(headers[key]);
            break;
          }
        }
      }
    }

    return originalFetch.apply(this, args);
  };

  // --- Intercept XMLHttpRequest ---
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (name && name.toLowerCase() === 'authorization') {
      sendToken(value);
    }
    return originalSetRequestHeader.apply(this, arguments);
  };
})();
