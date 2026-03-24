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

  // --- Inlined CSS (avoids fetch / web_accessible_resources requirement) ---
  var CSS_TEXT = ':host{all:initial;font-family:"gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif;font-size:14px;color:#dbdee1}' +
    '.dce-trigger{position:fixed;bottom:24px;right:24px;z-index:99999;width:48px;height:48px;border-radius:50%;background:#5865f2;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.4);transition:background .15s,transform .15s}' +
    '.dce-trigger:hover{background:#4752c4;transform:scale(1.1)}' +
    '.dce-trigger svg{width:24px;height:24px;fill:#fff}' +
    '.dce-panel{position:fixed;bottom:84px;right:24px;z-index:99999;width:360px;background:#2b2d31;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.5);overflow:hidden;display:none}' +
    '.dce-panel.open{display:block}' +
    '.dce-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#1e1f22;border-bottom:1px solid #3f4147}' +
    '.dce-header h3{margin:0;font-size:14px;font-weight:600;color:#f2f3f5}' +
    '.dce-close{background:none;border:none;color:#b5bac1;cursor:pointer;padding:4px;font-size:18px;line-height:1}' +
    '.dce-close:hover{color:#f2f3f5}' +
    '.dce-body{padding:16px}' +
    '.dce-channel-info{background:#1e1f22;border-radius:4px;padding:10px 12px;margin-bottom:12px}' +
    '.dce-channel-name{font-weight:600;color:#f2f3f5;font-size:14px}' +
    '.dce-guild-name{color:#949ba4;font-size:12px;margin-top:2px}' +
    '.dce-no-channel{color:#f0b232;font-size:13px}' +
    '.dce-field{margin-bottom:12px}' +
    '.dce-label{display:block;font-size:12px;font-weight:600;color:#b5bac1;text-transform:uppercase;letter-spacing:.02em;margin-bottom:6px}' +
    '.dce-select{width:100%;padding:8px 10px;background:#1e1f22;border:1px solid #3f4147;border-radius:4px;color:#dbdee1;font-size:14px;font-family:inherit;outline:none;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23949ba4\' d=\'M3 4.5l3 3 3-3\'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center}' +
    '.dce-select:focus{border-color:#5865f2}' +
    '.dce-input{width:100%;padding:8px 10px;background:#1e1f22;border:1px solid #3f4147;border-radius:4px;color:#dbdee1;font-size:14px;font-family:inherit;outline:none}' +
    '.dce-input:focus{border-color:#5865f2}' +
    '.dce-date-row{display:flex;gap:8px}' +
    '.dce-date-row .dce-field{flex:1}' +
    '.dce-theme-row{display:none;margin-bottom:12px}' +
    '.dce-theme-row.visible{display:block}' +
    '.dce-btn{width:100%;padding:10px;border:none;border-radius:4px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;transition:background .15s}' +
    '.dce-btn-primary{background:#5865f2;color:#fff}' +
    '.dce-btn-primary:hover{background:#4752c4}' +
    '.dce-btn-primary:disabled{background:#3f4147;color:#949ba4;cursor:not-allowed}' +
    '.dce-btn-danger{background:#da373c;color:#fff}' +
    '.dce-btn-danger:hover{background:#a12d31}' +
    '.dce-btn-success{background:#248046;color:#fff}' +
    '.dce-btn-success:hover{background:#1a6334}' +
    '.dce-progress{display:none;margin-bottom:12px}' +
    '.dce-progress.visible{display:block}' +
    '.dce-progress-bar-bg{width:100%;height:6px;background:#1e1f22;border-radius:3px;overflow:hidden;margin-bottom:6px}' +
    '.dce-progress-bar{height:100%;background:#5865f2;border-radius:3px;transition:width .3s;width:0%}' +
    '.dce-progress-bar.indeterminate{width:30%;animation:dce-indeterminate 1.5s infinite ease-in-out}' +
    '@keyframes dce-indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}' +
    '.dce-progress-text{font-size:12px;color:#949ba4;text-align:center}' +
    '.dce-status{text-align:center;padding:8px;border-radius:4px;font-size:13px;margin-bottom:12px;display:none}' +
    '.dce-status.visible{display:block}' +
    '.dce-status.error{background:rgba(218,55,60,0.15);color:#f0b232}' +
    '.dce-status.success{background:rgba(36,128,70,0.15);color:#57f287}' +
    '.dce-status.info{background:rgba(88,101,242,0.15);color:#949ba4}' +
    '.dce-stats{display:none;background:#1e1f22;border-radius:4px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:#b5bac1}' +
    '.dce-stats.visible{display:block}' +
    '.dce-stats div{margin-bottom:4px}' +
    '.dce-stats strong{color:#f2f3f5}' +
    '.dce-footer{padding:8px 16px;border-top:1px solid #3f4147;text-align:center;font-size:11px;color:#949ba4}' +
    '.dce-token-status{display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:12px;padding:6px 10px;border-radius:4px}' +
    '.dce-token-status.connected{background:rgba(36,128,70,0.15);color:#57f287}' +
    '.dce-token-status.waiting{background:rgba(240,178,50,0.15);color:#f0b232}' +
    '.dce-token-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}' +
    '.dce-token-status.connected .dce-token-dot{background:#57f287}' +
    '.dce-token-status.waiting .dce-token-dot{background:#f0b232;animation:dce-pulse 1.5s infinite}' +
    '@keyframes dce-pulse{0%,100%{opacity:1}50%{opacity:.3}}' +
    '.dce-checkbox-label{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;color:#dbdee1}' +
    '.dce-checkbox-label input[type="checkbox"]{width:18px;height:18px;accent-color:#5865f2;cursor:pointer;flex-shrink:0}' +
    '.dce-attachment-hint{font-size:11px;color:#949ba4;margin-top:4px}';

  // --- Token Capture ---
  function injectPageScript() {
    try {
      var scriptUrl = chrome.runtime.getURL('exporter-inject.js');
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

  // Load CSS into shadow DOM (inlined to avoid fetch/web_accessible_resources issues)
  var style = document.createElement('style');
  style.textContent = CSS_TEXT;
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
  var includeAttachmentsCheckbox = shadow.querySelector('#dce-include-attachments');

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
  var exportAbortController = null;

  async function startExport() {
    var ch = ns.getCurrentChannel();
    if (!ch || !apiClient) return;

    setState(STATE.EXPORTING);

    exportAbortController = new AbortController();
    var signal = exportAbortController.signal;

    var dateRange = null;
    if (startDateInput.value || endDateInput.value) {
      dateRange = {};
      if (startDateInput.value) dateRange.start = new Date(startDateInput.value + 'T00:00:00');
      if (endDateInput.value) dateRange.end = new Date(endDateInput.value + 'T23:59:59.999');
    }

    var includeAttachments = includeAttachmentsCheckbox.checked;

    try {
      // Phase 1: Fetch messages
      var messages = await apiClient.fetchAllMessages(ch.channelId, {
        dateRange: dateRange,
        onProgress: function (info) {
          progressBar.classList.remove('indeterminate');
          progressText.textContent = info.fetched + ' messages fetched' +
            (info.status === 'rate_limited' ? ' (rate limited, waiting...)' : '');
          var pct = Math.min(95, (info.fetched / 100) * 5);
          progressBar.style.width = pct + '%';
        }
      });

      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

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

      // Build filename
      var channelSlug = (channelMeta.channelName || ch.channelId).replace(/[^a-zA-Z0-9_-]/g, '_');
      var dateStr = new Date().toISOString().split('T')[0];
      var baseFilename = 'discord-export-' + channelSlug + '-' + dateStr;

      // Phase 2: Download attachments (if enabled)
      var attachmentResult = null;
      if (includeAttachments) {
        progressBar.style.width = '0%';
        progressText.textContent = 'Scanning for attachments...';
        await new Promise(function (r) { setTimeout(r, 50); });

        attachmentResult = await ns.downloadAttachments(messages, {
          maxSizeMB: 25,
          signal: signal,
          onProgress: function (info) {
            if (info.total === 0) {
              progressText.textContent = 'No attachments found.';
              return;
            }
            var pct = Math.round((info.downloaded / info.total) * 100);
            progressBar.style.width = pct + '%';
            progressText.textContent = 'Downloading attachments... ' +
              info.downloaded + '/' + info.total +
              (info.currentFile ? ' (' + info.currentFile + ')' : '');
          }
        });

        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        // For HTML, provide the attachment map so local paths are used
        if (format === 'html' && attachmentResult.files.size > 0) {
          options.attachmentMap = attachmentResult.files;
        }
      }

      progressText.textContent = 'Formatting ' + messages.length + ' messages...';
      await new Promise(function (r) { setTimeout(r, 50); });

      var output = formatter.format(messages, metadata, options);

      // Build final export
      if (includeAttachments && attachmentResult && attachmentResult.files.size > 0) {
        // Bundle into ZIP
        progressText.textContent = 'Building ZIP file...';
        await new Promise(function (r) { setTimeout(r, 50); });

        var zip = new ns.ZipWriter();
        zip.addFile(baseFilename + '.' + formatter.extension, output);

        // Track unique files (avoid duplicates from url/proxy_url mapping)
        var addedPaths = {};
        attachmentResult.files.forEach(function (fileInfo) {
          if (!addedPaths[fileInfo.localPath]) {
            zip.addFile(fileInfo.localPath, fileInfo.data);
            addedPaths[fileInfo.localPath] = true;
          }
        });

        var zipBlob = zip.toBlob();
        exportFilename = baseFilename + '.zip';
        exportedData = { blob: zipBlob, isZip: true };

        // Show stats with attachment info
        var statLines = [
          '<div><strong>' + messages.length + '</strong> messages exported</div>',
          '<div><strong>' + formatFileSize(zipBlob.size) + '</strong> ZIP file size</div>',
          '<div><strong>' + Object.keys(addedPaths).length + '</strong> attachments downloaded</div>'
        ];
        if (attachmentResult.skipped.length > 0) {
          statLines.push('<div><strong>' + attachmentResult.skipped.length + '</strong> skipped (too large)</div>');
        }
        if (attachmentResult.failed.length > 0) {
          statLines.push('<div><strong>' + attachmentResult.failed.length + '</strong> failed to download</div>');
        }
        statLines.push('<div>From: ' + new Date(messages[0].timestamp).toLocaleDateString() + '</div>');
        statLines.push('<div>To: ' + new Date(messages[messages.length - 1].timestamp).toLocaleDateString() + '</div>');
        statsEl.innerHTML = statLines.join('');
      } else {
        // Single file export (no attachments or no attachments found)
        exportFilename = baseFilename + '.' + formatter.extension;
        exportedData = { content: output, mimeType: formatter.mimeType };

        var fileSize = new Blob([output]).size;
        var statLines = [
          '<div><strong>' + messages.length + '</strong> messages exported</div>',
          '<div><strong>' + formatFileSize(fileSize) + '</strong> file size</div>',
          '<div>From: ' + new Date(messages[0].timestamp).toLocaleDateString() + '</div>',
          '<div>To: ' + new Date(messages[messages.length - 1].timestamp).toLocaleDateString() + '</div>'
        ];
        if (includeAttachments && attachmentResult) {
          if (attachmentResult.files.size === 0 && attachmentResult.skipped.length === 0) {
            statLines.splice(2, 0, '<div>No attachments in this channel</div>');
          }
          if (attachmentResult.skipped.length > 0) {
            statLines.splice(2, 0, '<div><strong>' + attachmentResult.skipped.length + '</strong> attachments skipped (too large)</div>');
          }
        }
        statsEl.innerHTML = statLines.join('');
      }

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
    if (exportAbortController) {
      exportAbortController.abort();
    }
    if (apiClient) {
      apiClient.abort();
    }
  }

  function downloadExport() {
    if (!exportedData) return;

    var blob;
    if (exportedData.isZip) {
      blob = exportedData.blob;
    } else {
      blob = new Blob([exportedData.content], { type: exportedData.mimeType });
    }
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

      // Download attachments checkbox
      '<div class="dce-field">' +
      '<label class="dce-checkbox-label">' +
      '<input type="checkbox" id="dce-include-attachments">' +
      '<span>Download attachments (ZIP)</span>' +
      '</label>' +
      '<div class="dce-attachment-hint">Fetches attachment files and bundles everything into a ZIP</div>' +
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
