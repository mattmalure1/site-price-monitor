import { getSettings, saveSettings, getAllItems, getAllPriceHistory, STORAGE_KEYS } from '../lib/storage.js';
import { connectGoogleAccount, disconnectGoogleAccount, getSpreadsheetUrl } from '../lib/sheets-api.js';

// DOM refs
const defaultInterval = document.getElementById('default-interval');
const chromeNotifications = document.getElementById('chrome-notifications');
const discordWebhook = document.getElementById('discord-webhook');
const btnTestDiscord = document.getElementById('btn-test-discord');
const discordStatus = document.getElementById('discord-status');
const sheetsDisconnected = document.getElementById('sheets-disconnected');
const sheetsConnected = document.getElementById('sheets-connected');
const btnConnectGoogle = document.getElementById('btn-connect-google');
const btnDisconnectGoogle = document.getElementById('btn-disconnect-google');
const sheetsLink = document.getElementById('sheets-link');
const emailEnabled = document.getElementById('email-enabled');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const importFile = document.getElementById('import-file');
const btnClear = document.getElementById('btn-clear');

// --- Init ---
document.addEventListener('DOMContentLoaded', loadSettings);

async function loadSettings() {
  const settings = await getSettings();

  defaultInterval.value = settings.defaultCheckIntervalMinutes;
  chromeNotifications.checked = settings.chromeNotificationsEnabled !== false;
  discordWebhook.value = settings.discordWebhookUrl || '';
  emailEnabled.checked = settings.emailEnabled || false;

  // Google Sheets state
  if (settings.sheetsEnabled && settings.spreadsheetId) {
    sheetsDisconnected.classList.add('hidden');
    sheetsConnected.classList.remove('hidden');
    sheetsLink.href = getSpreadsheetUrl(settings.spreadsheetId);
  } else {
    sheetsDisconnected.classList.remove('hidden');
    sheetsConnected.classList.add('hidden');
  }

  // Event listeners
  defaultInterval.addEventListener('change', saveCurrentSettings);
  chromeNotifications.addEventListener('change', saveCurrentSettings);
  discordWebhook.addEventListener('change', saveCurrentSettings);
  emailEnabled.addEventListener('change', saveCurrentSettings);

  btnTestDiscord.addEventListener('click', testDiscord);
  btnConnectGoogle.addEventListener('click', connectGoogle);
  btnDisconnectGoogle.addEventListener('click', disconnectGoogle);
  btnExport.addEventListener('click', exportData);
  btnImport.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', importData);
  btnClear.addEventListener('click', clearAllData);
}

async function saveCurrentSettings() {
  await saveSettings({
    defaultCheckIntervalMinutes: parseInt(defaultInterval.value),
    chromeNotificationsEnabled: chromeNotifications.checked,
    discordWebhookUrl: discordWebhook.value.trim(),
    emailEnabled: emailEnabled.checked
  });

  // Notify background to update alarm
  chrome.runtime.sendMessage({ type: 'SETUP_ALARM' });
}

// --- Discord ---
async function testDiscord() {
  const url = discordWebhook.value.trim();
  if (!url) {
    showStatus(discordStatus, 'Please enter a webhook URL', 'error');
    return;
  }

  btnTestDiscord.disabled = true;
  btnTestDiscord.textContent = 'Testing...';

  chrome.runtime.sendMessage({ type: 'TEST_DISCORD', webhookUrl: url }, (response) => {
    btnTestDiscord.disabled = false;
    btnTestDiscord.textContent = 'Test';

    if (response && response.ok) {
      showStatus(discordStatus, 'Test message sent successfully!', 'success');
    } else {
      showStatus(discordStatus, 'Failed to send test message. Check the webhook URL.', 'error');
    }
  });
}

// --- Google Sheets ---
async function connectGoogle() {
  btnConnectGoogle.disabled = true;
  btnConnectGoogle.textContent = 'Connecting...';

  try {
    const spreadsheetId = await connectGoogleAccount();
    sheetsDisconnected.classList.add('hidden');
    sheetsConnected.classList.remove('hidden');
    sheetsLink.href = getSpreadsheetUrl(spreadsheetId);
  } catch (err) {
    alert('Failed to connect Google account: ' + err.message);
  } finally {
    btnConnectGoogle.disabled = false;
    btnConnectGoogle.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
      </svg>
      Connect Google Account
    `;
  }
}

async function disconnectGoogle() {
  if (!confirm('Disconnect Google account? Your spreadsheet data will be preserved.')) return;

  await disconnectGoogleAccount();
  sheetsDisconnected.classList.remove('hidden');
  sheetsConnected.classList.add('hidden');
}

// --- Data Management ---
async function exportData() {
  const items = await getAllItems();
  const history = await getAllPriceHistory();
  const settings = await getSettings();

  const data = { items, priceHistory: history, settings, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `site-price-monitor-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.items || !data.priceHistory) {
      alert('Invalid export file format.');
      return;
    }

    if (!confirm('This will merge imported data with your existing data. Continue?')) return;

    // Merge items
    const currentItems = await getAllItems();
    const mergedItems = { ...currentItems, ...data.items };
    await chrome.storage.local.set({ [STORAGE_KEYS.ITEMS]: mergedItems });

    // Merge history
    const currentHistory = await getAllPriceHistory();
    const mergedHistory = { ...currentHistory };
    for (const [itemId, records] of Object.entries(data.priceHistory)) {
      if (mergedHistory[itemId]) {
        // Combine and deduplicate by timestamp
        const existing = new Set(mergedHistory[itemId].map(r => r.timestamp));
        for (const record of records) {
          if (!existing.has(record.timestamp)) {
            mergedHistory[itemId].push(record);
          }
        }
        mergedHistory[itemId].sort((a, b) => a.timestamp - b.timestamp);
      } else {
        mergedHistory[itemId] = records;
      }
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.PRICE_HISTORY]: mergedHistory });

    alert(`Imported ${Object.keys(data.items).length} items successfully!`);
    chrome.runtime.sendMessage({ type: 'SETUP_ALARM' });
  } catch (err) {
    alert('Failed to import: ' + err.message);
  }

  importFile.value = '';
}

async function clearAllData() {
  if (!confirm('Are you sure? This will delete ALL tracked items, price history, and settings. This cannot be undone.')) return;
  if (!confirm('Really delete everything?')) return;

  await chrome.storage.local.clear();
  alert('All data cleared.');
  location.reload();
}

// --- Utilities ---
function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = `status-msg ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}
