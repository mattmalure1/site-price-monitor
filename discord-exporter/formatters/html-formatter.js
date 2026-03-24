// html-formatter.js — Export Discord messages as standalone HTML
// Produces a self-contained file with Discord-like message rendering
// Declarative content script (no ES modules)

(function () {
  'use strict';

  window.__discordExporter = window.__discordExporter || {};
  window.__discordExporter.formatters = window.__discordExporter.formatters || {};

  var DISCORD_CDN = 'https://cdn.discordapp.com';

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTimestamp(isoString) {
    var d = new Date(isoString);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }

  function shortTimestamp(isoString) {
    var d = new Date(isoString);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function getAuthorName(author) {
    return author.global_name || author.username || 'Unknown';
  }

  function getAvatarUrl(author) {
    if (author.avatar) {
      return DISCORD_CDN + '/avatars/' + author.id + '/' + author.avatar + '.png?size=40';
    }
    // Default avatar based on discriminator or user id
    var index = author.discriminator && author.discriminator !== '0'
      ? parseInt(author.discriminator, 10) % 5
      : (BigInt(author.id) >> 22n) % 6n;
    return DISCORD_CDN + '/embed/avatars/' + index + '.png';
  }

  function isImageFile(filename) {
    return /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(filename || '');
  }

  function isVideoFile(filename) {
    return /\.(mp4|webm|mov)$/i.test(filename || '');
  }

  // Check if two messages should be grouped (same author within 7 minutes)
  function shouldGroup(prevMsg, currMsg) {
    if (!prevMsg) return false;
    if (prevMsg.author.id !== currMsg.author.id) return false;
    var prevTime = new Date(prevMsg.timestamp).getTime();
    var currTime = new Date(currMsg.timestamp).getTime();
    return (currTime - prevTime) < 7 * 60 * 1000;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    var html = escapeHTML(text);

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Code blocks
    html = html.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // URLs
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    // Newlines
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  function renderAttachment(att) {
    if (isImageFile(att.filename)) {
      return '<div class="attachment"><img src="' + escapeHTML(att.url) + '" alt="' +
        escapeHTML(att.filename) + '" loading="lazy" style="max-width:400px;max-height:300px;border-radius:4px;"></div>';
    }
    if (isVideoFile(att.filename)) {
      return '<div class="attachment"><video src="' + escapeHTML(att.url) +
        '" controls style="max-width:400px;border-radius:4px;"></video></div>';
    }
    var sizeStr = att.size ? ' (' + formatFileSize(att.size) + ')' : '';
    return '<div class="attachment file-attachment"><a href="' + escapeHTML(att.url) +
      '" target="_blank" rel="noopener">' + escapeHTML(att.filename) + sizeStr + '</a></div>';
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderEmbed(embed) {
    var parts = [];
    var borderColor = embed.color ? '#' + embed.color.toString(16).padStart(6, '0') : '#202225';
    parts.push('<div class="embed" style="border-left-color:' + borderColor + '">');

    if (embed.author) {
      parts.push('<div class="embed-author">');
      if (embed.author.icon_url) {
        parts.push('<img src="' + escapeHTML(embed.author.icon_url) + '" class="embed-author-icon">');
      }
      parts.push('<span>' + escapeHTML(embed.author.name || '') + '</span></div>');
    }
    if (embed.title) {
      if (embed.url) {
        parts.push('<div class="embed-title"><a href="' + escapeHTML(embed.url) + '" target="_blank" rel="noopener">' + escapeHTML(embed.title) + '</a></div>');
      } else {
        parts.push('<div class="embed-title">' + escapeHTML(embed.title) + '</div>');
      }
    }
    if (embed.description) {
      parts.push('<div class="embed-description">' + renderMarkdown(embed.description) + '</div>');
    }
    if (embed.fields && embed.fields.length > 0) {
      parts.push('<div class="embed-fields">');
      for (var f = 0; f < embed.fields.length; f++) {
        var field = embed.fields[f];
        var inlineClass = field.inline ? ' inline' : '';
        parts.push('<div class="embed-field' + inlineClass + '"><div class="embed-field-name">' +
          escapeHTML(field.name) + '</div><div class="embed-field-value">' +
          renderMarkdown(field.value) + '</div></div>');
      }
      parts.push('</div>');
    }
    if (embed.image) {
      parts.push('<img src="' + escapeHTML(embed.image.url) + '" class="embed-image" loading="lazy">');
    }
    if (embed.thumbnail) {
      parts.push('<img src="' + escapeHTML(embed.thumbnail.url) + '" class="embed-thumbnail" loading="lazy">');
    }
    if (embed.footer) {
      parts.push('<div class="embed-footer">' + escapeHTML(embed.footer.text || '') + '</div>');
    }

    parts.push('</div>');
    return parts.join('');
  }

  function renderReactions(reactions) {
    if (!reactions || reactions.length === 0) return '';
    var parts = ['<div class="reactions">'];
    for (var r = 0; r < reactions.length; r++) {
      var reaction = reactions[r];
      var emojiStr = reaction.emoji.id
        ? '<img src="https://cdn.discordapp.com/emojis/' + reaction.emoji.id + '.png?size=16" class="reaction-emoji">'
        : escapeHTML(reaction.emoji.name || '?');
      parts.push('<span class="reaction">' + emojiStr + ' ' + reaction.count + '</span>');
    }
    parts.push('</div>');
    return parts.join('');
  }

  function getCSS(theme) {
    var isDark = theme !== 'light';
    var bg = isDark ? '#313338' : '#ffffff';
    var bgHover = isDark ? '#2e3035' : '#f2f3f5';
    var text = isDark ? '#dbdee1' : '#2e3338';
    var textMuted = isDark ? '#949ba4' : '#5c6470';
    var textLink = isDark ? '#00aff4' : '#0068e0';
    var embedBg = isDark ? '#2b2d31' : '#f2f3f5';
    var codeBg = isDark ? '#2b2d31' : '#e3e5e8';
    var borderColor = isDark ? '#3f4147' : '#e3e5e8';
    var reactionBg = isDark ? '#3a3c41' : '#e9eaec';

    return [
      '* { margin: 0; padding: 0; box-sizing: border-box; }',
      'body { background: ' + bg + '; color: ' + text + '; font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.375; }',
      '.export-header { padding: 24px; border-bottom: 1px solid ' + borderColor + '; }',
      '.export-header h1 { font-size: 20px; margin-bottom: 8px; }',
      '.export-header .meta { color: ' + textMuted + '; font-size: 14px; }',
      '.messages { padding: 0 16px; }',
      '.message-group { padding: 2px 0 2px 72px; position: relative; margin-top: -1px; }',
      '.message-group:hover { background: ' + bgHover + '; }',
      '.message-group.has-header { margin-top: 17px; }',
      '.avatar { position: absolute; left: 16px; top: 2px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; overflow: hidden; }',
      '.avatar img { width: 100%; height: 100%; }',
      '.msg-header { display: flex; align-items: baseline; gap: 8px; }',
      '.author-name { font-weight: 500; cursor: pointer; font-size: 16px; }',
      '.timestamp { color: ' + textMuted + '; font-size: 12px; font-weight: 400; }',
      '.grouped-timestamp { position: absolute; left: 0; width: 72px; text-align: center; color: ' + textMuted + '; font-size: 11px; opacity: 0; }',
      '.message-group:hover .grouped-timestamp { opacity: 1; }',
      '.msg-content { white-space: pre-wrap; word-wrap: break-word; }',
      '.msg-content a { color: ' + textLink + '; text-decoration: none; }',
      '.msg-content a:hover { text-decoration: underline; }',
      '.msg-content code { background: ' + codeBg + '; padding: 0.2em 0.4em; border-radius: 3px; font-size: 85%; }',
      '.msg-content pre { background: ' + codeBg + '; padding: 8px; border-radius: 4px; margin: 4px 0; overflow-x: auto; }',
      '.msg-content pre code { background: none; padding: 0; }',
      '.reply-ref { display: flex; align-items: center; gap: 4px; font-size: 14px; color: ' + textMuted + '; margin-bottom: 2px; padding-left: 0; }',
      '.reply-ref::before { content: ""; display: inline-block; width: 33px; height: 12px; border-left: 2px solid ' + textMuted + '; border-top: 2px solid ' + textMuted + '; border-radius: 6px 0 0 0; margin-right: 4px; flex-shrink: 0; }',
      '.reply-ref .reply-author { font-weight: 500; color: ' + text + '; }',
      '.reply-ref .reply-content { cursor: pointer; }',
      '.reply-ref .reply-content:hover { color: ' + text + '; }',
      '.attachment { margin: 4px 0; }',
      '.file-attachment { background: ' + embedBg + '; border: 1px solid ' + borderColor + '; border-radius: 8px; padding: 10px; display: inline-block; }',
      '.file-attachment a { color: ' + textLink + '; text-decoration: none; }',
      '.file-attachment a:hover { text-decoration: underline; }',
      '.embed { background: ' + embedBg + '; border-left: 4px solid #202225; border-radius: 4px; padding: 8px 16px 16px 12px; margin: 4px 0; max-width: 520px; }',
      '.embed-author { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 14px; font-weight: 600; }',
      '.embed-author-icon { width: 20px; height: 20px; border-radius: 50%; }',
      '.embed-title { font-weight: 600; margin-bottom: 4px; }',
      '.embed-title a { color: ' + textLink + '; text-decoration: none; }',
      '.embed-title a:hover { text-decoration: underline; }',
      '.embed-description { font-size: 14px; margin-bottom: 8px; }',
      '.embed-fields { display: flex; flex-wrap: wrap; gap: 8px; }',
      '.embed-field { min-width: 100%; }',
      '.embed-field.inline { min-width: auto; flex: 1; min-width: 150px; }',
      '.embed-field-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }',
      '.embed-field-value { font-size: 14px; }',
      '.embed-image { max-width: 100%; border-radius: 4px; margin-top: 8px; }',
      '.embed-thumbnail { width: 80px; height: 80px; border-radius: 4px; float: right; margin-left: 16px; object-fit: cover; }',
      '.embed-footer { font-size: 12px; color: ' + textMuted + '; margin-top: 8px; }',
      '.reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }',
      '.reaction { background: ' + reactionBg + '; border: 1px solid ' + borderColor + '; border-radius: 8px; padding: 2px 8px; font-size: 14px; display: flex; align-items: center; gap: 4px; }',
      '.reaction-emoji { width: 16px; height: 16px; vertical-align: middle; }',
      '.date-separator { text-align: center; margin: 24px 0 8px; position: relative; }',
      '.date-separator::before { content: ""; position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: ' + borderColor + '; }',
      '.date-separator span { position: relative; background: ' + bg + '; padding: 0 8px; font-size: 12px; font-weight: 600; color: ' + textMuted + '; }',
      '.system-msg { color: ' + textMuted + '; font-size: 14px; padding: 4px 16px 4px 72px; }'
    ].join('\n');
  }

  function formatHTML(messages, metadata, options) {
    options = options || {};
    var theme = options.theme || 'dark';
    var parts = [];

    // Build header
    var channelDisplay = metadata.channelName || ('#' + metadata.channelId);
    var guildDisplay = metadata.guildName || '';

    parts.push('<!DOCTYPE html>');
    parts.push('<html lang="en">');
    parts.push('<head>');
    parts.push('<meta charset="UTF-8">');
    parts.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
    parts.push('<title>Discord Export - ' + escapeHTML(channelDisplay) + '</title>');
    parts.push('<style>' + getCSS(theme) + '</style>');
    parts.push('</head>');
    parts.push('<body>');

    // Export header
    parts.push('<div class="export-header">');
    parts.push('<h1>' + escapeHTML(channelDisplay) + '</h1>');
    parts.push('<div class="meta">');
    if (guildDisplay) parts.push('Server: ' + escapeHTML(guildDisplay) + ' &bull; ');
    parts.push(messages.length + ' messages');
    if (messages.length > 0) {
      parts.push(' &bull; ' + formatTimestamp(messages[0].timestamp) + ' to ' + formatTimestamp(messages[messages.length - 1].timestamp));
    }
    parts.push(' &bull; Exported ' + new Date().toLocaleString());
    parts.push('</div></div>');

    // Messages
    parts.push('<div class="messages">');

    var lastDateStr = '';
    var prevMsg = null;

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];

      // System messages (joins, pins, etc.)
      if (msg.type && msg.type !== 0 && msg.type !== 19) {
        parts.push('<div class="system-msg">' + escapeHTML(msg.content || '[System message]') + '</div>');
        prevMsg = null;
        continue;
      }

      // Date separator
      var dateStr = new Date(msg.timestamp).toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      if (dateStr !== lastDateStr) {
        parts.push('<div class="date-separator"><span>' + escapeHTML(dateStr) + '</span></div>');
        lastDateStr = dateStr;
        prevMsg = null; // Reset grouping on date change
      }

      var grouped = shouldGroup(prevMsg, msg);

      if (grouped) {
        // Grouped message (no avatar, no full header)
        parts.push('<div class="message-group">');
        parts.push('<span class="grouped-timestamp">' + shortTimestamp(msg.timestamp) + '</span>');
      } else {
        // New message group with avatar and header
        parts.push('<div class="message-group has-header">');
        parts.push('<div class="avatar"><img src="' + escapeHTML(getAvatarUrl(msg.author)) + '" alt=""></div>');
        parts.push('<div class="msg-header">');
        parts.push('<span class="author-name">' + escapeHTML(getAuthorName(msg.author)) + '</span>');
        parts.push('<span class="timestamp">' + formatTimestamp(msg.timestamp) + '</span>');
        parts.push('</div>');
      }

      // Reply reference
      if (msg.referenced_message) {
        var ref = msg.referenced_message;
        parts.push('<div class="reply-ref">');
        parts.push('<img src="' + escapeHTML(getAvatarUrl(ref.author)) + '" style="width:16px;height:16px;border-radius:50%;">');
        parts.push('<span class="reply-author">' + escapeHTML(getAuthorName(ref.author)) + '</span>');
        var refText = (ref.content || '').substring(0, 80);
        if (ref.content && ref.content.length > 80) refText += '...';
        parts.push('<span class="reply-content">' + escapeHTML(refText) + '</span>');
        parts.push('</div>');
      }

      // Message content
      if (msg.content) {
        parts.push('<div class="msg-content">' + renderMarkdown(msg.content) + '</div>');
      }

      // Attachments
      if (msg.attachments) {
        for (var a = 0; a < msg.attachments.length; a++) {
          parts.push(renderAttachment(msg.attachments[a]));
        }
      }

      // Embeds
      if (msg.embeds) {
        for (var e = 0; e < msg.embeds.length; e++) {
          parts.push(renderEmbed(msg.embeds[e]));
        }
      }

      // Reactions
      if (msg.reactions) {
        parts.push(renderReactions(msg.reactions));
      }

      parts.push('</div>'); // close message-group

      prevMsg = msg;
    }

    parts.push('</div>'); // close messages
    parts.push('</body></html>');

    return parts.join('\n');
  }

  window.__discordExporter.formatters.html = {
    format: formatHTML,
    mimeType: 'text/html',
    extension: 'html'
  };
})();
