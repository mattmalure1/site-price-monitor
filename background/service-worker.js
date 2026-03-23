// service-worker.js — Background service worker for Site Price Monitor
// Handles alarms, price checking, notification clicks, and message routing

import { getSettings, getAllItems } from '../lib/storage.js';
import { checkAllPrices, checkSingleItem } from '../lib/price-checker.js';
import { syncTrackedItems } from '../lib/sheets-api.js';

const ALARM_NAME = 'spm-price-check';
const MIN_ALARM_INTERVAL = 1; // Chrome minimum is 1 minute

// --- Installation & Startup ---

chrome.runtime.onInstalled.addListener(async () => {
  console.log('Site Price Monitor installed');
  await setupAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupAlarm();
});

// --- Alarm Setup ---

async function setupAlarm() {
  // Clear existing alarm
  await chrome.alarms.clear(ALARM_NAME);

  const settings = await getSettings();
  const items = await getAllItems();
  const activeItems = Object.values(items).filter(i => i.isActive);

  if (activeItems.length === 0) return;

  // Find the shortest interval among all active items
  let minInterval = settings.defaultCheckIntervalMinutes;
  for (const item of activeItems) {
    if (item.checkIntervalMinutes && item.checkIntervalMinutes < minInterval) {
      minInterval = item.checkIntervalMinutes;
    }
  }

  // Chrome requires minimum 1 minute for alarms
  minInterval = Math.max(minInterval, MIN_ALARM_INTERVAL);

  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: minInterval,
    periodInMinutes: minInterval
  });

  console.log(`Alarm set: checking every ${minInterval} minute(s)`);
}

// --- Alarm Handler ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('Running price check...');
    try {
      await checkAllPrices();

      // Sync tracked items to Sheets
      const settings = await getSettings();
      if (settings.sheetsEnabled && settings.spreadsheetId) {
        const items = await getAllItems();
        await syncTrackedItems(items).catch(err => console.error('Sheets sync error:', err));
      }
    } catch (err) {
      console.error('Price check failed:', err);
    }
  }
});

// --- Message Handler ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'ITEM_ADDED':
      setupAlarm();
      sendResponse({ ok: true });
      break;

    case 'CHECK_ITEM':
      checkSingleItem(msg.itemId).then(() => {
        sendResponse({ ok: true });
      }).catch(err => {
        sendResponse({ ok: false, error: err.message });
      });
      return true; // async response

    case 'CHECK_ALL':
      checkAllPrices().then(() => {
        sendResponse({ ok: true });
      }).catch(err => {
        sendResponse({ ok: false, error: err.message });
      });
      return true;

    case 'SETUP_ALARM':
      setupAlarm();
      sendResponse({ ok: true });
      break;

    case 'TEST_DISCORD':
      import('../lib/discord-notify.js').then(({ testDiscordWebhook }) => {
        testDiscordWebhook(msg.webhookUrl).then(ok => sendResponse({ ok }));
      });
      return true;

    case 'ELEMENT_PICKED':
    case 'PICKER_CANCELLED':
      // Forward to popup if it's open
      chrome.runtime.sendMessage(msg).catch(() => {
        // Popup not open, store for later
        if (msg.type === 'ELEMENT_PICKED') {
          chrome.storage.local.set({ pendingPick: msg });
        }
      });
      break;
  }
});

// --- Notification Click Handler ---

chrome.notifications.onClicked.addListener(async (notifId) => {
  const result = await chrome.storage.local.get('notificationUrls');
  const urls = result.notificationUrls || {};
  const url = urls[notifId];

  if (url) {
    chrome.tabs.create({ url });
    // Clean up
    delete urls[notifId];
    await chrome.storage.local.set({ notificationUrls: urls });
  }

  chrome.notifications.clear(notifId);
});

// --- Storage Change Listener ---
// Re-setup alarm when items or settings change

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.items || changes.settings) {
      setupAlarm();
    }
  }
});
