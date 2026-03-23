// service-worker.js — Background service worker for Site Price Monitor
// Handles alarms, price checking, notification clicks, badge, and message routing

import { getSettings, getAllItems, updateItem } from '../lib/storage.js';
import { checkAllPrices, checkSingleItem } from '../lib/price-checker.js';
import { syncTrackedItems } from '../lib/sheets-api.js';

const ALARM_NAME = 'spm-price-check';
const MIN_ALARM_INTERVAL = 1; // Chrome minimum is 1 minute

// --- Installation & Startup ---

chrome.runtime.onInstalled.addListener(async () => {
  console.log('Site Price Monitor installed');
  await setupAlarm();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupAlarm();
  await updateBadge();
});

// --- Alarm Setup ---

async function setupAlarm() {
  await chrome.alarms.clear(ALARM_NAME);

  const settings = await getSettings();
  const items = await getAllItems();
  const activeItems = Object.values(items).filter(i => i.isActive);

  if (activeItems.length === 0) return;

  let minInterval = settings.defaultCheckIntervalMinutes;
  for (const item of activeItems) {
    if (item.checkIntervalMinutes && item.checkIntervalMinutes < minInterval) {
      minInterval = item.checkIntervalMinutes;
    }
  }

  minInterval = Math.max(minInterval, MIN_ALARM_INTERVAL);

  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: minInterval,
    periodInMinutes: minInterval
  });

  console.log(`Alarm set: checking every ${minInterval} minute(s)`);
}

// --- Badge Icon ---

async function updateBadge() {
  try {
    const items = await getAllItems();
    const itemArray = Object.values(items);
    const belowTarget = itemArray.filter(i =>
      i.isActive && i.targetPrice !== null && i.currentPrice !== null && i.currentPrice <= i.targetPrice
    ).length;
    const hasErrors = itemArray.some(i => i.isActive && i.lastError);

    if (belowTarget > 0) {
      chrome.action.setBadgeText({ text: String(belowTarget) });
      chrome.action.setBadgeBackgroundColor({ color: '#16a34a' }); // green
    } else if (hasErrors) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' }); // red
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.error('Badge update error:', err);
  }
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

      await updateBadge();
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
      updateBadge();
      sendResponse({ ok: true });
      break;

    case 'CHECK_ITEM':
      checkSingleItem(msg.itemId).then(() => {
        updateBadge();
        sendResponse({ ok: true });
      }).catch(err => {
        sendResponse({ ok: false, error: err.message });
      });
      return true; // async response

    case 'CHECK_ALL':
      checkAllPrices().then(() => {
        updateBadge();
        sendResponse({ ok: true });
      }).catch(err => {
        sendResponse({ ok: false, error: err.message });
      });
      return true;

    case 'SETUP_ALARM':
      setupAlarm();
      sendResponse({ ok: true });
      break;

    case 'UPDATE_BADGE':
      updateBadge();
      sendResponse({ ok: true });
      break;

    case 'SNOOZE_ITEM':
      handleSnooze(msg.itemId, msg.duration).then(() => {
        sendResponse({ ok: true });
      });
      return true;

    case 'TEST_DISCORD':
      import('../lib/discord-notify.js').then(({ testDiscordWebhook }) => {
        testDiscordWebhook(msg.webhookUrl).then(ok => sendResponse({ ok }));
      });
      return true;

    case 'ELEMENT_PICKED':
    case 'PICKER_CANCELLED':
      chrome.runtime.sendMessage(msg).catch(() => {
        if (msg.type === 'ELEMENT_PICKED') {
          chrome.storage.local.set({ pendingPick: msg });
        }
      });
      break;
  }
});

async function handleSnooze(itemId, durationMinutes) {
  const snoozedUntil = Date.now() + durationMinutes * 60 * 1000;
  await updateItem(itemId, { snoozedUntil });
}

// --- Notification Click Handler ---

chrome.notifications.onClicked.addListener(async (notifId) => {
  const result = await chrome.storage.local.get('notificationUrls');
  const urls = result.notificationUrls || {};
  const url = urls[notifId];

  if (url) {
    chrome.tabs.create({ url });
    delete urls[notifId];
    await chrome.storage.local.set({ notificationUrls: urls });
  }

  chrome.notifications.clear(notifId);
});

// --- Keyboard Shortcut Handler ---

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'start-picker') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/element-picker.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content/element-picker.css']
      });
    } catch (err) {
      console.error('Failed to inject picker via shortcut:', err);
    }
  }
});

// --- Storage Change Listener ---

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.items || changes.settings) {
      setupAlarm();
      updateBadge();
    }
  }
});
