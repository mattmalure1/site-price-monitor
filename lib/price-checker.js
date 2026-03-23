// price-checker.js — Orchestrates fetching pages and extracting prices
// Supports fetch-based (default) and tab-based (for JS-rendered SPAs) checking

import { getAllItems, getItem, updateItem, addPriceRecord, getSettings, shouldAlert } from './storage.js';
import { dispatchNotifications } from './notifications.js';
import { syncPriceToSheets } from './sheets-api.js';

const FETCH_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000];
const RATE_LIMIT_MS = 1500; // base delay between requests
const SAME_DOMAIN_EXTRA_MS = 1000; // extra delay for same-domain requests
const JITTER_MAX_MS = 500;

let offscreenCreated = false;

async function ensureOffscreenDocument() {
  if (offscreenCreated) return;

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

// --- Fetch with timeout ---
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Retry with exponential backoff ---
async function fetchWithRetry(url, options = {}) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);

      // Don't retry client errors (4xx) — they're permanent
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry server errors (5xx)
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt] || 8000);
        continue;
      }

      return response;
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') {
        lastError = new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
      }
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt] || 8000);
      }
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter() {
  return Math.random() * JITTER_MAX_MS;
}

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

// --- Main check loop ---
export async function checkAllPrices() {
  const items = await getAllItems();
  const settings = await getSettings();
  const activeItems = Object.values(items).filter(i => i.isActive);

  if (activeItems.length === 0) return;

  await ensureOffscreenDocument();

  // Group by domain for rate limiting
  let lastDomain = '';
  const alerts = []; // collect for digest mode

  for (const item of activeItems) {
    const interval = (item.checkIntervalMinutes || settings.defaultCheckIntervalMinutes) * 60 * 1000;
    if (item.lastChecked && (Date.now() - item.lastChecked) < interval * 0.9) {
      continue;
    }

    // Rate limiting: delay between requests
    const domain = getDomain(item.url);
    const delay = RATE_LIMIT_MS + jitter() + (domain === lastDomain ? SAME_DOMAIN_EXTRA_MS : 0);
    await sleep(delay);
    lastDomain = domain;

    const alertResult = await checkSingleItem(item, settings);
    if (alertResult) {
      alerts.push(alertResult);
    }
  }

  // Dispatch digest if enabled
  if (alerts.length > 0 && settings.digestMode) {
    await dispatchNotifications(null, null, null, { digest: true, alerts });
  }

  return alerts;
}

export async function checkSingleItem(item, settings) {
  if (!settings) settings = await getSettings();
  if (typeof item === 'string') item = await getItem(item);
  if (!item) return null;

  try {
    await ensureOffscreenDocument();

    let newPrice = null;
    let extractionError = null;

    // Try tab-based checking first if enabled for this item
    if (item.useBrowserRendering) {
      try {
        newPrice = await checkViaTab(item);
      } catch (err) {
        extractionError = `Tab check failed: ${err.message}`;
      }
    }

    // Fall back to fetch-based checking
    if (newPrice === null && !extractionError) {
      try {
        const result = await checkViaFetch(item);
        newPrice = result.price;
        extractionError = result.error;
      } catch (err) {
        extractionError = err.message;
      }
    }

    if (extractionError || newPrice === null) {
      const errorCount = (item.errorCount || 0) + 1;
      await updateItem(item.id, {
        lastChecked: Date.now(),
        lastError: extractionError || 'Price not found',
        errorCount
      });
      return null;
    }

    const oldPrice = item.currentPrice;

    // Update the item — clear errors on success
    await updateItem(item.id, {
      currentPrice: newPrice,
      lastChecked: Date.now(),
      lastError: null,
      errorCount: 0
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
      // Check cooldown
      if (!isOnCooldown(item, settings)) {
        if (settings.digestMode) {
          // Return alert info for digest batching
          return { item: { ...item, currentPrice: newPrice }, newPrice, oldPrice };
        }
        await dispatchNotifications(item, newPrice, oldPrice);
        // Set cooldown timestamp
        await updateItem(item.id, { lastAlertAt: Date.now() });
      }
    }

  } catch (err) {
    console.error(`Error checking price for ${item.name}:`, err);
    const errorCount = (item.errorCount || 0) + 1;
    await updateItem(item.id, {
      lastChecked: Date.now(),
      lastError: err.message,
      errorCount
    });
  }

  return null;
}

// --- Fetch-based price checking (default) ---
async function checkViaFetch(item) {
  const response = await fetchWithRetry(item.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!response.ok) {
    return { price: null, error: `HTTP ${response.status}` };
  }

  const html = await response.text();

  // Try primary selector, then fallbacks
  const selectors = [item.selector, ...(item.fallbackSelectors || [])];

  for (const selector of selectors) {
    const result = await chrome.runtime.sendMessage({
      type: 'PARSE_PRICE',
      html,
      selector,
      itemId: item.id
    });

    if (result && result.price !== null && !result.error) {
      return { price: result.price, error: null };
    }
  }

  return { price: null, error: 'Element not found with any selector' };
}

// --- Tab-based price checking (for JS-rendered SPAs) ---
async function checkViaTab(item) {
  return new Promise((resolve, reject) => {
    let tabId = null;
    const timeout = setTimeout(() => {
      if (tabId) chrome.tabs.remove(tabId).catch(() => {});
      reject(new Error('Tab check timed out after 30s'));
    }, 30000);

    chrome.tabs.create({ url: item.url, active: false }, (tab) => {
      tabId = tab.id;

      // Wait for page to fully load
      chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
        if (updatedTabId !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener);

        // Give JS a moment to render
        setTimeout(async () => {
          try {
            const selectors = [item.selector, ...(item.fallbackSelectors || [])];

            const results = await chrome.scripting.executeScript({
              target: { tabId },
              func: (selectorList) => {
                for (const sel of selectorList) {
                  try {
                    const el = document.querySelector(sel);
                    if (el && el.textContent.trim()) {
                      return { text: el.textContent.trim(), selector: sel };
                    }
                  } catch { /* invalid selector */ }
                }
                return null;
              },
              args: [selectors]
            });

            chrome.tabs.remove(tabId).catch(() => {});
            clearTimeout(timeout);

            const result = results?.[0]?.result;
            if (!result) {
              reject(new Error('Element not found via tab'));
              return;
            }

            // Parse the price text
            const { parsePrice } = await import('./price-parser.js');
            const price = parsePrice(result.text);
            if (price === null) {
              reject(new Error(`Could not parse price: "${result.text.slice(0, 50)}"`));
              return;
            }

            resolve(price);
          } catch (err) {
            chrome.tabs.remove(tabId).catch(() => {});
            clearTimeout(timeout);
            reject(err);
          }
        }, 2000); // 2s delay for JS to render
      });
    });
  });
}

// --- Cooldown check ---
function isOnCooldown(item, settings) {
  if (!item.lastAlertAt) return false;
  // If item is snoozed
  if (item.snoozedUntil && Date.now() < item.snoozedUntil) return true;
  // Default cooldown: 1 hour (configurable)
  const cooldownMs = (settings.alertCooldownMinutes || 60) * 60 * 1000;
  return (Date.now() - item.lastAlertAt) < cooldownMs;
}
