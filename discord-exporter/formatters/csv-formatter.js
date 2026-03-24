// csv-formatter.js — Export Discord messages as CSV
// Declarative content script (no ES modules)

(function () {
  'use strict';

  window.__discordExporter = window.__discordExporter || {};
  window.__discordExporter.formatters = window.__discordExporter.formatters || {};

  function escapeCSV(value) {
    if (value == null) return '';
    var str = String(value);
    // Escape if contains comma, quote, or newline
    if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1 || str.indexOf('\r') !== -1) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function formatTimestamp(isoString) {
    var d = new Date(isoString);
    return d.toISOString();
  }

  function getAuthorName(author) {
    return author.global_name || author.username || 'Unknown';
  }

  function formatCSV(messages, metadata) {
    var rows = [];

    // Header row
    rows.push([
      'Timestamp',
      'Author',
      'Author ID',
      'Content',
      'Attachments',
      'Reply To',
      'Reactions',
      'Message ID',
      'Edited'
    ].join(','));

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];

      var attachments = '';
      if (msg.attachments && msg.attachments.length > 0) {
        attachments = msg.attachments.map(function (a) {
          return a.filename + ' (' + a.url + ')';
        }).join('; ');
      }

      var replyTo = '';
      if (msg.referenced_message) {
        replyTo = getAuthorName(msg.referenced_message.author) + ': ' +
          (msg.referenced_message.content || '').substring(0, 100);
      }

      var reactions = '';
      if (msg.reactions && msg.reactions.length > 0) {
        reactions = msg.reactions.map(function (r) {
          return (r.emoji.name || '?') + ' x' + r.count;
        }).join('; ');
      }

      rows.push([
        escapeCSV(formatTimestamp(msg.timestamp)),
        escapeCSV(getAuthorName(msg.author)),
        escapeCSV(msg.author.id),
        escapeCSV(msg.content || ''),
        escapeCSV(attachments),
        escapeCSV(replyTo),
        escapeCSV(reactions),
        escapeCSV(msg.id),
        escapeCSV(msg.edited_timestamp ? 'Yes' : 'No')
      ].join(','));
    }

    // BOM for Excel compatibility
    return '\uFEFF' + rows.join('\n');
  }

  window.__discordExporter.formatters.csv = {
    format: formatCSV,
    mimeType: 'text/csv',
    extension: 'csv'
  };
})();
