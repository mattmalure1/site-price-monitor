// storage.js — Data model & CRUD for tracked items using chrome.storage.local

const STORAGE_KEYS = {
  ITEMS: 'items',
  PRICE_HISTORY: 'priceHistory',
  SETTINGS: 'settings'
};

const DEFAULT_SETTINGS = {
  defaultCheckIntervalMinutes: 30,
  discordWebhookUrl: '',
  sheetsEnabled: false,
  spreadsheetId: '',
  emailEnabled: false,
  notifyEmail: '',
  chromeNotificationsEnabled: true
};

const ALERT_CONDITIONS = {
  BELOW_TARGET: 'below_target',
  ANY_CHANGE: 'any_change',
  PERCENT_DROP: 'percent_drop'
};

const CHECK_INTERVALS = [
  { value: 1, label: '1 minute' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 360, label: '6 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '24 hours' }
];

function generateId() {
  return 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// --- Settings ---

async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
}

async function saveSettings(settings) {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
  return updated;
}

// --- Tracked Items ---

async function getAllItems() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ITEMS);
  return result[STORAGE_KEYS.ITEMS] || {};
}

async function getItem(id) {
  const items = await getAllItems();
  return items[id] || null;
}

async function addItem({ url, name, selector, currentPrice, targetPrice, alertCondition, percentThreshold, checkIntervalMinutes }) {
  const items = await getAllItems();
  const id = generateId();
  const item = {
    id,
    url,
    name: name || 'Untitled Product',
    selector,
    currentPrice: currentPrice || null,
    targetPrice: targetPrice || null,
    alertCondition: alertCondition || ALERT_CONDITIONS.BELOW_TARGET,
    percentThreshold: percentThreshold || null,
    checkIntervalMinutes: checkIntervalMinutes || null,
    lastChecked: null,
    isActive: true,
    createdAt: Date.now()
  };
  items[id] = item;
  await chrome.storage.local.set({ [STORAGE_KEYS.ITEMS]: items });
  return item;
}

async function updateItem(id, updates) {
  const items = await getAllItems();
  if (!items[id]) return null;
  items[id] = { ...items[id], ...updates };
  await chrome.storage.local.set({ [STORAGE_KEYS.ITEMS]: items });
  return items[id];
}

async function deleteItem(id) {
  const items = await getAllItems();
  delete items[id];
  await chrome.storage.local.set({ [STORAGE_KEYS.ITEMS]: items });
  // Also clean up price history
  const history = await getAllPriceHistory();
  delete history[id];
  await chrome.storage.local.set({ [STORAGE_KEYS.PRICE_HISTORY]: history });
}

async function toggleItem(id) {
  const item = await getItem(id);
  if (!item) return null;
  return updateItem(id, { isActive: !item.isActive });
}

// --- Price History ---

async function getAllPriceHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PRICE_HISTORY);
  return result[STORAGE_KEYS.PRICE_HISTORY] || {};
}

async function getPriceHistory(itemId) {
  const history = await getAllPriceHistory();
  return history[itemId] || [];
}

async function addPriceRecord(itemId, price) {
  const history = await getAllPriceHistory();
  if (!history[itemId]) history[itemId] = [];
  history[itemId].push({ price, timestamp: Date.now() });
  // Keep last 500 records per item
  if (history[itemId].length > 500) {
    history[itemId] = history[itemId].slice(-500);
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.PRICE_HISTORY]: history });
}

// --- Utilities ---

function parsePrice(text) {
  if (!text) return null;
  // Remove currency symbols, spaces, and keep numbers/decimals/commas
  const cleaned = text.replace(/[^0-9.,]/g, '');
  // Handle comma as thousands separator (1,299.99) or decimal (12,99)
  let normalized;
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // Both present: assume comma is thousands separator
    normalized = cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    // Only comma: could be decimal or thousands
    const parts = cleaned.split(',');
    if (parts[parts.length - 1].length === 2) {
      // Likely decimal comma (European format)
      normalized = cleaned.replace(',', '.');
    } else {
      // Likely thousands separator
      normalized = cleaned.replace(/,/g, '');
    }
  } else {
    normalized = cleaned;
  }
  const price = parseFloat(normalized);
  return isNaN(price) ? null : price;
}

function shouldAlert(item, newPrice, oldPrice) {
  if (newPrice === null) return false;
  switch (item.alertCondition) {
    case ALERT_CONDITIONS.BELOW_TARGET:
      return item.targetPrice !== null && newPrice <= item.targetPrice;
    case ALERT_CONDITIONS.ANY_CHANGE:
      return oldPrice !== null && newPrice !== oldPrice;
    case ALERT_CONDITIONS.PERCENT_DROP:
      if (oldPrice === null || oldPrice === 0 || !item.percentThreshold) return false;
      const dropPercent = ((oldPrice - newPrice) / oldPrice) * 100;
      return dropPercent >= item.percentThreshold;
    default:
      return false;
  }
}

export {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  ALERT_CONDITIONS,
  CHECK_INTERVALS,
  generateId,
  getSettings,
  saveSettings,
  getAllItems,
  getItem,
  addItem,
  updateItem,
  deleteItem,
  toggleItem,
  getAllPriceHistory,
  getPriceHistory,
  addPriceRecord,
  parsePrice,
  shouldAlert
};
