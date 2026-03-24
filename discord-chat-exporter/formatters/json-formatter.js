// json-formatter.js — Export Discord messages as JSON
// Declarative content script (no ES modules)

(function () {
  'use strict';

  window.__discordExporter = window.__discordExporter || {};
  window.__discordExporter.formatters = window.__discordExporter.formatters || {};

  function formatJSON(messages, metadata) {
    var output = {
      metadata: {
        exportedAt: new Date().toISOString(),
        channelId: metadata.channelId || null,
        channelName: metadata.channelName || null,
        guildId: metadata.guildId || null,
        guildName: metadata.guildName || null,
        messageCount: messages.length,
        dateRange: {
          first: messages.length > 0 ? messages[0].timestamp : null,
          last: messages.length > 0 ? messages[messages.length - 1].timestamp : null
        }
      },
      messages: messages
    };

    return JSON.stringify(output, null, 2);
  }

  window.__discordExporter.formatters.json = {
    format: formatJSON,
    mimeType: 'application/json',
    extension: 'json'
  };
})();
