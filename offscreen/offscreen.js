// offscreen.js — Parses HTML and extracts price using CSS selector
// This runs in an offscreen document because DOMParser is not available in service workers

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PARSE_PRICE') {
    const { html, selector, itemId } = msg;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const element = doc.querySelector(selector);

      if (!element) {
        sendResponse({ itemId, error: 'Element not found', price: null });
        return;
      }

      const text = element.textContent.trim();
      sendResponse({ itemId, text, price: parsePriceText(text), error: null });
    } catch (err) {
      sendResponse({ itemId, error: err.message, price: null });
    }
  }
  return true; // keep channel open for async response
});

function parsePriceText(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.,]/g, '');
  let normalized;
  if (cleaned.includes('.') && cleaned.includes(',')) {
    normalized = cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts[parts.length - 1].length === 2) {
      normalized = cleaned.replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else {
    normalized = cleaned;
  }
  const price = parseFloat(normalized);
  return isNaN(price) ? null : price;
}
