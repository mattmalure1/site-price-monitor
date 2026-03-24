// exporter-content.js — Main Discord exporter content script
// Injects token capture script, builds UI panel, orchestrates export
// Declarative content script (IIFE, no ES modules)

(function () {
  'use strict';

  if (window.__discord_exporter_active) return;
  window.__discord_exporter_active = true;

  var ns = window.__discordExporter;
  var token = null;
  var apiClient = null;
  var currentExport = null; // track in-progress export
  var channelMeta = {}; // cached channel/guild info

  // --- State ---
  var STATE = { IDLE: 'idle', EXPORTING: 'exporting', COMPLETE: 'complete', ERROR: 'error' };
  var state = STATE.IDLE;

  // --- Token Capture ---
  function injectPageScript() {
    try {
      var scriptUrl = chrome.runtime.getURL('discord-exporter/exporter-inject.js');
      var script = document.createElement('script');
      script.src = scriptUrl;
      (document.head || document.documentElement).appendChild(script);
      script.onload = function () { script.remove(); };
    } catch (e) {
      console.error('[Discord Exporter] Failed to inject page script:', e);
    }
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (event.data && event.data.type === 'DISCORD_EXPORTER_TOKEN') {
      if (!token && event.data.token) {
        token = event.data.token;
        apiClient = new ns.DiscordApiClient(token);
        updateTokenStatus(true);
      }
    }
  });

  // --- Shadow DOM Setup ---
  var host = document.createElement('div');
  host.id = 'discord-exporter-host';
  var shadow = host.attachShadow({ mode: 'closed' });

  // Load CSS into shadow DOM
  var style = document.createElement('style');
  // We'll fetch the CSS from the extension
  fetch(chrome.runtime.getURL('discord-exporter/exporter-panel.css'))
    .then(function (r) { return r.text(); })
    .then(function (css) {
      style.textContent = css;
    });
  shadow.appendChild(style);

  // --- Build UI ---
  var container = document.createElement('div');
  container.innerHTML = getTriggerHTML() + getPanelHTML();
  shadow.appendChild(container);

  // Append to page
  document.body.appendChild(host);

  // --- Element References ---
  var triggerBtn = shadow.querySelector('.dce-trigger');
  var panel = shadow.querySelector('.dce-panel');
  var closeBtn = shadow.querySelector('.dce-close');
  var channelNameEl = shadow.querySelector('.dce-channel-name');
  var guildNameEl = shadow.querySelector('.dce-guild-name');
  var noChannelEl = shadow.querySelector('.dce-no-channel');
  var channelInfoEl = shadow.querySelector('.dce-channel-info');
  var formatSelect = shadow.querySelector('#dce-format');
  var themeRow = shadow.querySelector('.dce-theme-row');
  var themeSelect = shadow.querySelector('#dce-theme');
  var startDateInput = shadow.querySelector('#dce-start-date');
  var endDateInput = shadow.querySelector('#dce-end-date');
  var actionBtn = shadow.querySelector('#dce-action-btn');
  var progressEl = shadow.querySelector('.dce-progress');
  var progressBar = shadow.querySelector('.dce-progress-bar');
  var progressText = shadow.querySelector('.dce-progress-text');
  var statusEl = shadow.querySelector('.dce-status');
  var statsEl = shadow.querySelector('.dce-stats');
  var tokenStatusEl = shadow.querySelector('.dce-token-status');

  // --- Event Handlers ---
  triggerBtn.addEventListener('click', function () {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      updateChannelInfo();
    }
  });

  closeBtn.addEventListener('click', function () {
    panel.classList.remove('open');
  });

  formatSelect.addEventListener('change', function () {
    if (formatSelect.value === 'html') {
      themeRow.classList.add('visible');
    } else {
      themeRow.classList.remove('visible');
    }
  });

  actionBtn.addEventListener('click', function () {
    if (state === STATE.EXPORTING) {
      cancelExport();
    } else if (state === STATE.COMPLETE) {
      downloadExport();
    } else {
      startExport();
    }
  });

  // --- Channel Detection ---
  ns.onChannelChange(function () {
    updateChannelInfo();
    // Reset state on channel change
    if (state !== STATE.EXPORTING) {
      setState(STATE.IDLE);
    }
  });

  function updateChannelInfo() {
    var ch = ns.getCurrentChannel();
    if (!ch) {
      channelInfoEl.style.display = 'none';
      noChannelEl.style.display = 'block';
      return;
    }

    channelInfoEl.style.display = 'block';
    noChannelEl.style.display = 'none';
    channelNameEl.textContent = '# ' + ch.channelId;
    guildNameEl.textContent = ch.isDM ? 'Direct Message' : 'Loading...';

    // Fetch actual channel/guild names if we have a token
    if (apiClient) {
      fetchChannelMeta(ch);
    }
  }

  async function fetchChannelMeta(ch) {
    try {
      var channelData = await apiClient.getChannel(ch.channelId);
      channelMeta.channelId = ch.channelId;
      channelMeta.channelName = channelData.name || (channelData.recipients
        ? channelData.recipients.map(function (r) { return r.global_name || r.username; }).join(', ')
        : ch.channelId);
      channelNameEl.textContent = (ch.isDM ? '' : '# ') + channelMeta.channelName;

      if (ch.guildId) {
        try {
          var guildData = await apiClient.getGuild(ch.guildId);
          channelMeta.guildId = ch.guildId;
          channelMeta.guildName = guildData.name;
          guildNameEl.textContent = guildData.name;
        } catch (e) {
          guildNameEl.textContent = 'Server ' + ch.guildId;
        }
      } else {
        channelMeta.guildId = null;
        channelMeta.guildName = null;
        guildNameEl.textContent = 'Direct Message';
      }
    } catch (e) {
      console.error('[Discord Exporter] Failed to fetch channel info:', e);
    }
  }

  // --- Token Status ---
  function updateTokenStatus(connected) {
    if (connected) {
      tokenStatusEl.className = 'dce-token-status connected';
      tokenStatusEl.innerHTML = '<span class="dce-token-dot"></span> Connected';
      actionBtn.disabled = false;

      // Refresh channel info now that we have a token
      updateChannelInfo();
    } else {
      tokenStatusEl.className = 'dce-token-status waiting';
      tokenStatusEl.innerHTML = '<span class="dce-token-dot"></span> Waiting for auth token...';
      actionBtn.disabled = true;
    }
  }

  // --- State Management ---
  function setState(newState) {
    state = newState;

    switch (state) {
      case STATE.IDLE:
        actionBtn.className = 'dce-btn dce-btn-primary';
        actionBtn.textContent = 'Export Messages';
        actionBtn.disabled = !token;
        progressEl.classList.remove('visible');
        statusEl.classList.remove('visible');
        statsEl.classList.remove('visible');
        break;

      case STATE.EXPORTING:
        actionBtn.className = 'dce-btn dce-btn-danger';
        actionBtn.textContent = 'Cancel Export';
        actionBtn.disabled = false;
        progressEl.classList.add('visible');
        progressBar.style.width = '0%';
        progressBar.classList.add('indeterminate');
        progressText.textContent = 'Starting export...';
        statusEl.classList.remove('visible');
        statsEl.classList.remove('visible');
        break;

      case STATE.COMPLETE:
        actionBtn.className = 'dce-btn dce-btn-success';
        actionBtn.textContent = 'Download File';
        actionBtn.disabled = false;
        progressBar.classList.remove('indeterminate');
        progressBar.style.width = '100%';
        break;

      case STATE.ERROR:
        actionBtn.className = 'dce-btn dce-btn-primary';
        actionBtn.textContent = 'Retry Export';
        actionBtn.disabled = !token;
        progressEl.classList.remove('visible');
        break;
    }
  }

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = 'dce-status visible ' + (type || 'info');
  }

  // --- Export Logic ---
  var exportedData = null;
  var exportFilename = '';

  async function startExport() {
    var ch = ns.getCurrentChannel();
    if (!ch || !apiClient) return;

    setState(STATE.EXPORTING);

    var dateRange = null;
    if (startDateInput.value || endDateInput.value) {
      dateRange = {};
      if (startDateInput.value) dateRange.start = new Date(startDateInput.value + 'T00:00:00');
      if (endDateInput.value) dateRange.end = new Date(endDateInput.value + 'T23:59:59.999');
    }

    try {
      var messages = await apiClient.fetchAllMessages(ch.channelId, {
        dateRange: dateRange,
        onProgress: function (info) {
          progressBar.classList.remove('indeterminate');
          progressText.textContent = info.fetched + ' messages fetched' +
            (info.status === 'rate_limited' ? ' (rate limited, waiting...)' : '');
          // Pulse the bar since we don't know total
          var pct = Math.min(95, (info.fetched / 100) * 5);
          progressBar.style.width = pct + '%';
        }
      });

      if (messages.length === 0) {
        showStatus('No messages found in this channel.', 'info');
        setState(STATE.IDLE);
        return;
      }

      // Format the messages
      var format = formatSelect.value;
      var formatter = ns.formatters[format];
      if (!formatter) {
        showStatus('Unknown format: ' + format, 'error');
        setState(STATE.ERROR);
        return;
      }

      var metadata = {
        channelId: ch.channelId,
        channelName: channelMeta.channelName || ch.channelId,
        guildId: channelMeta.guildId || ch.guildId,
        guildName: channelMeta.guildName || null
      };

      var options = {};
      if (format === 'html') {
        options.theme = themeSelect.value;
      }

      progressText.textContent = 'Formatting ' + messages.length + ' messages...';

      // Run formatting in next tick to let UI update
      await new Promise(function (r) { setTimeout(r, 50); });

      var output = formatter.format(messages, metadata, options);

      // Build filename
      var channelSlug = (channelMeta.channelName || ch.channelId).replace(/[^a-zA-Z0-9_-]/g, '_');
      var dateStr = new Date().toISOString().split('T')[0];
      exportFilename = 'discord-export-' + channelSlug + '-' + dateStr + '.' + formatter.extension;
      exportedData = { content: output, mimeType: formatter.mimeType };

      // Show stats
      var fileSize = new Blob([output]).size;
      statsEl.innerHTML = '<div><strong>' + messages.length + '</strong> messages exported</div>' +
        '<div><strong>' + formatFileSize(fileSize) + '</strong> file size</div>' +
        '<div>From: ' + new Date(messages[0].timestamp).toLocaleDateString() + '</div>' +
        '<div>To: ' + new Date(messages[messages.length - 1].timestamp).toLocaleDateString() + '</div>';
      statsEl.classList.add('visible');

      progressText.textContent = 'Export complete! ' + messages.length + ' messages.';
      showStatus('Ready to download.', 'success');
      setState(STATE.COMPLETE);

    } catch (e) {
      if (e.name === 'AbortError') {
        showStatus('Export cancelled.', 'info');
        setState(STATE.IDLE);
      } else {
        console.error('[Discord Exporter] Export failed:', e);
        showStatus('Export failed: ' + e.message, 'error');
        setState(STATE.ERROR);
      }
    }
  }

  function cancelExport() {
    if (apiClient) {
      apiClient.abort();
    }
  }

  function downloadExport() {
    if (!exportedData) return;

    var blob = new Blob([exportedData.content], { type: exportedData.mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = exportFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // --- HTML Templates ---
  function getTriggerHTML() {
    return '<button class="dce-trigger" title="Discord Chat Exporter">' +
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>' +
      '</svg></button>';
  }

  function getPanelHTML() {
    return '<div class="dce-panel">' +
      '<div class="dce-header">' +
      '<h3>Discord Chat Exporter</h3>' +
      '<button class="dce-close">&times;</button>' +
      '</div>' +
      '<div class="dce-body">' +

      // Token status
      '<div class="dce-token-status waiting">' +
      '<span class="dce-token-dot"></span> Waiting for auth token...' +
      '</div>' +

      // Channel info
      '<div class="dce-channel-info" style="display:none">' +
      '<div class="dce-channel-name"></div>' +
      '<div class="dce-guild-name"></div>' +
      '</div>' +
      '<div class="dce-no-channel" style="display:none">Navigate to a channel to export.</div>' +

      // Format selector
      '<div class="dce-field">' +
      '<label class="dce-label">Export Format</label>' +
      '<select class="dce-select" id="dce-format">' +
      '<option value="json">JSON</option>' +
      '<option value="html" selected>HTML</option>' +
      '<option value="txt">Plain Text</option>' +
      '<option value="csv">CSV</option>' +
      '</select>' +
      '</div>' +

      // HTML theme (only visible when HTML selected)
      '<div class="dce-theme-row visible">' +
      '<div class="dce-field">' +
      '<label class="dce-label">HTML Theme</label>' +
      '<select class="dce-select" id="dce-theme">' +
      '<option value="dark" selected>Dark</option>' +
      '<option value="light">Light</option>' +
      '</select>' +
      '</div>' +
      '</div>' +

      // Date range
      '<div class="dce-date-row">' +
      '<div class="dce-field">' +
      '<label class="dce-label">From (optional)</label>' +
      '<input type="date" class="dce-input" id="dce-start-date">' +
      '</div>' +
      '<div class="dce-field">' +
      '<label class="dce-label">To (optional)</label>' +
      '<input type="date" class="dce-input" id="dce-end-date">' +
      '</div>' +
      '</div>' +

      // Progress
      '<div class="dce-progress">' +
      '<div class="dce-progress-bar-bg"><div class="dce-progress-bar"></div></div>' +
      '<div class="dce-progress-text">Starting...</div>' +
      '</div>' +

      // Status
      '<div class="dce-status"></div>' +

      // Stats
      '<div class="dce-stats"></div>' +

      // Action button
      '<button class="dce-btn dce-btn-primary" id="dce-action-btn" disabled>Export Messages</button>' +

      '</div>' +

      // Footer
      '<div class="dce-footer">All data processed locally. Nothing leaves your browser.</div>' +

      '</div>';
  }

  // --- Init ---
  injectPageScript();
  updateTokenStatus(false);
  updateChannelInfo();
})();
