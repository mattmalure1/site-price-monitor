// txt-formatter.js — Export Discord messages as plain text
// Declarative content script (no ES modules)

(function () {
  'use strict';

  window.__discordExporter = window.__discordExporter || {};
  window.__discordExporter.formatters = window.__discordExporter.formatters || {};

  function formatTimestamp(isoString) {
    var d = new Date(isoString);
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hours = String(d.getHours()).padStart(2, '0');
    var minutes = String(d.getMinutes()).padStart(2, '0');
    var seconds = String(d.getSeconds()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
  }

  function getAuthorName(author) {
    return author.global_name || author.username || 'Unknown';
  }

  function formatTXT(messages, metadata) {
    var lines = [];

    // Header
    lines.push('='.repeat(60));
    lines.push('Discord Chat Export');
    lines.push('='.repeat(60));
    if (metadata.guildName) lines.push('Server: ' + metadata.guildName);
    lines.push('Channel: ' + (metadata.channelName || metadata.channelId));
    lines.push('Messages: ' + messages.length);
    lines.push('Exported: ' + new Date().toISOString());
    if (messages.length > 0) {
      lines.push('From: ' + formatTimestamp(messages[0].timestamp));
      lines.push('To: ' + formatTimestamp(messages[messages.length - 1].timestamp));
    }
    lines.push('='.repeat(60));
    lines.push('');

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var author = getAuthorName(msg.author);
      var ts = formatTimestamp(msg.timestamp);

      // Reply reference
      if (msg.referenced_message) {
        var refAuthor = getAuthorName(msg.referenced_message.author);
        var refContent = (msg.referenced_message.content || '').substring(0, 80);
        if (msg.referenced_message.content && msg.referenced_message.content.length > 80) {
          refContent += '...';
        }
        lines.push('  [Reply to ' + refAuthor + ': "' + refContent + '"]');
      }

      // Main message line
      var content = msg.content || '';
      lines.push('[' + ts + '] ' + author + ': ' + content);

      // Attachments
      if (msg.attachments && msg.attachments.length > 0) {
        for (var a = 0; a < msg.attachments.length; a++) {
          var att = msg.attachments[a];
          lines.push('  [Attachment: ' + att.filename + ' (' + att.url + ')]');
        }
      }

      // Embeds
      if (msg.embeds && msg.embeds.length > 0) {
        for (var e = 0; e < msg.embeds.length; e++) {
          var embed = msg.embeds[e];
          if (embed.title) lines.push('  [Embed: ' + embed.title + ']');
          if (embed.description) lines.push('  ' + embed.description.substring(0, 200));
          if (embed.url) lines.push('  ' + embed.url);
        }
      }

      // Reactions
      if (msg.reactions && msg.reactions.length > 0) {
        var reactionStr = msg.reactions.map(function (r) {
          return (r.emoji.name || '?') + ' x' + r.count;
        }).join(', ');
        lines.push('  [Reactions: ' + reactionStr + ']');
      }
    }

    return lines.join('\n');
  }

  window.__discordExporter.formatters.txt = {
    format: formatTXT,
    mimeType: 'text/plain',
    extension: 'txt'
  };
})();
