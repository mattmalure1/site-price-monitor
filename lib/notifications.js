// notifications.js — Central notification dispatcher with digest and cooldown support

import { getSettings } from './storage.js';
import { sendDiscordNotification, sendDiscordDigest } from './discord-notify.js';
import { sendGmailNotification } from './gmail-notify.js';

/**
 * Dispatch notifications for a single alert or a digest batch.
 *
 * For single alerts: pass item, newPrice, oldPrice.
 * For digest mode: pass null for first 3 args, and options.digest=true with options.alerts array.
 */
export async function dispatchNotifications(item, newPrice, oldPrice, options = {}) {
  const settings = await getSettings();

  if (options.digest && options.alerts?.length > 0) {
    await dispatchDigest(settings, options.alerts);
    return;
  }

  if (!item) return;

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

async function dispatchDigest(settings, alerts) {
  const promises = [];

  // Chrome: one notification summarizing all alerts
  if (settings.chromeNotificationsEnabled !== false) {
    promises.push(sendChromeDigestNotification(alerts));
  }

  // Discord: one embed with all alerts
  if (settings.discordWebhookUrl) {
    promises.push(sendDiscordDigest(settings.discordWebhookUrl, alerts));
  }

  // Gmail: one email with all alerts
  if (settings.emailEnabled) {
    // Send individual emails for now (could be batched later)
    for (const alert of alerts) {
      promises.push(sendGmailNotification(alert.item, alert.newPrice, alert.oldPrice));
    }
  }

  await Promise.allSettled(promises);
}

async function sendChromeNotification(item, newPrice, oldPrice) {
  const priceText = `$${newPrice.toFixed(2)}`;
  const changeText = oldPrice !== null ? ` (was $${oldPrice.toFixed(2)})` : '';
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

async function sendChromeDigestNotification(alerts) {
  const notifId = `spm-digest-${Date.now()}`;
  const count = alerts.length;
  const names = alerts.slice(0, 3).map(a => a.item.name).join(', ');
  const extra = count > 3 ? ` and ${count - 3} more` : '';

  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: `Price Alerts: ${count} item${count > 1 ? 's' : ''}`,
    message: `${names}${extra}`,
    priority: 2
  });
}
