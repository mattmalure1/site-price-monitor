// channel-detector.js — Detect current Discord channel from URL
// Discord SPA navigation changes URL without page reload
// Declarative content script (no ES modules)

(function () {
  'use strict';

  window.__discordExporter = window.__discordExporter || {};

  // Parse channel info from a Discord URL path
  function parseChannelFromPath(pathname) {
    // Patterns:
    //   /channels/{guildId}/{channelId}   — server channel
    //   /channels/@me/{channelId}         — DM
    //   /channels/@me                     — DM list (no specific channel)
    const match = pathname.match(/^\/channels\/([^/]+)\/(\d+)/);
    if (!match) return null;

    const guildOrMe = match[1];
    const channelId = match[2];

    return {
      guildId: guildOrMe === '@me' ? null : guildOrMe,
      channelId: channelId,
      isDM: guildOrMe === '@me'
    };
  }

  // Get current channel info
  function getCurrentChannel() {
    return parseChannelFromPath(window.location.pathname);
  }

  // Watch for SPA navigation changes
  let lastPath = window.location.pathname;
  const listeners = [];

  function checkForNavigation() {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      const channel = parseChannelFromPath(currentPath);
      for (const cb of listeners) {
        try { cb(channel); } catch (e) { console.error('Channel change listener error:', e); }
      }
    }
  }

  // Poll for URL changes (MutationObserver on title is unreliable for SPA nav)
  setInterval(checkForNavigation, 500);

  // Also listen for popstate (back/forward navigation)
  window.addEventListener('popstate', function () {
    setTimeout(checkForNavigation, 50);
  });

  // Public API
  window.__discordExporter.getCurrentChannel = getCurrentChannel;

  window.__discordExporter.onChannelChange = function (callback) {
    listeners.push(callback);
    return function unsubscribe() {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  };
})();
