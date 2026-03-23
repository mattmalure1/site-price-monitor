// price-checker.js — Orchestrates fetching pages and extracting prices

import { getAllItems, getItem, updateItem, addPriceRecord, getSettings, shouldAlert } from './storage.js';
import { dispatchNotifications } from './notifications.js';
import { syncPriceToSheets } from './sheets-api.js';

let offscreenCreated = false;

async function ensureOffscreenDocument() {
  if (offscreenCreated) return;

  // Check if offscreen document already exists
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Parse HTML to extract price elements'
    });
  }
  offscreenCreated = true;
}

export async function checkAllPrices() {
  const items = await getAllItems();
  const settings = await getSettings();
  const activeItems = Object.values(items).filter(i => i.isActive);

  if (activeItems.length === 0) return;

  await ensureOffscreenDocument();

  for (const item of activeItems) {
    // Check if this item is due for a check based on its interval
    const interval = (item.checkIntervalMinutes || settings.defaultCheckIntervalMinutes) * 60 * 1000;
    if (item.lastChecked && (Date.now() - item.lastChecked) < interval * 0.9) {
      continue; // Not due yet (with 10% tolerance)
    }

    await checkSingleItem(item, settings);
  }
}

export async function checkSingleItem(item, settings) {
  if (!settings) settings = await getSettings();
  if (typeof item === 'string') item = await getItem(item);
  if (!item) return;

  try {
    await ensureOffscreenDocument();

    // Fetch the page HTML
    const response = await fetch(item.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch ${item.url}: ${response.status}`);
      await updateItem(item.id, { lastChecked: Date.now(), lastError: `HTTP ${response.status}` });
      return;
    }

    const html = await response.text();

    // Send to offscreen document for parsing
    const result = await chrome.runtime.sendMessage({
      type: 'PARSE_PRICE',
      html: html,
      selector: item.selector,
      itemId: item.id
    });

    if (result.error || result.price === null) {
      console.warn(`Price extraction failed for ${item.name}:`, result.error);
      await updateItem(item.id, { lastChecked: Date.now(), lastError: result.error || 'Price not found' });
      return;
    }

    const newPrice = result.price;
    const oldPrice = item.currentPrice;

    // Update the item
    await updateItem(item.id, {
      currentPrice: newPrice,
      lastChecked: Date.now(),
      lastError: null
    });

    // Record price history
    await addPriceRecord(item.id, newPrice);

    // Sync to Google Sheets if enabled
    if (settings.sheetsEnabled && settings.spreadsheetId) {
      syncPriceToSheets(item, newPrice).catch(err => {
        console.error('Sheets sync error:', err);
      });
    }

    // Check if we should alert
    if (shouldAlert(item, newPrice, oldPrice)) {
      await dispatchNotifications(item, newPrice, oldPrice);
    }

  } catch (err) {
    console.error(`Error checking price for ${item.name}:`, err);
    await updateItem(item.id, { lastChecked: Date.now(), lastError: err.message });
  }
}
