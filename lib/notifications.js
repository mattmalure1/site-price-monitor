// notifications.js — Central notification dispatcher

import { getSettings } from './storage.js';
import { sendDiscordNotification } from './discord-notify.js';
import { sendGmailNotification } from './gmail-notify.js';

export async function dispatchNotifications(item, newPrice, oldPrice) {
  const settings = await getSettings();

  const promises = [];

  // Chrome desktop notification
  if (settings.chromeNotificationsEnabled !== false) {
    promises.push(sendChromeNotification(item, newPrice, oldPrice));
  }

  // Discord webhook
  if (settings.discordWebhookUrl) {
    promises.push(sendDiscordNotification(settings.discordWebhookUrl, item, newPrice, oldPrice));
  }

  // Gmail
  if (settings.emailEnabled) {
    promises.push(sendGmailNotification(item, newPrice, oldPrice));
  }

  await Promise.allSettled(promises);
}

async function sendChromeNotification(item, newPrice, oldPrice) {
  const priceText = `$${newPrice.toFixed(2)}`;
  const changeText = oldPrice !== null
    ? ` (was $${oldPrice.toFixed(2)})`
    : '';

  const isTargetHit = item.targetPrice !== null && newPrice <= item.targetPrice;

  const notifId = `spm-${item.id}-${Date.now()}`;

  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: isTargetHit ? `Target Price Hit: ${item.name}` : `Price Alert: ${item.name}`,
    message: `${priceText}${changeText}${isTargetHit ? ' - Target reached! Time to buy!' : ''}`,
    priority: isTargetHit ? 2 : 1,
    requireInteraction: isTargetHit
  });

  // Store URL so clicking notification opens the product page
  chrome.storage.local.get('notificationUrls', (result) => {
    const urls = result.notificationUrls || {};
    urls[notifId] = item.url;
    chrome.storage.local.set({ notificationUrls: urls });
  });
}
