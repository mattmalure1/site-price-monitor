// offscreen.js — Parses HTML and extracts price using CSS selector
// This runs in an offscreen document because DOMParser is not available in service workers

import { parsePrice } from '../lib/price-parser.js';

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
      sendResponse({ itemId, text, price: parsePrice(text), error: null });
    } catch (err) {
      sendResponse({ itemId, error: err.message, price: null });
    }
  }
  return true; // keep channel open for async response
});
