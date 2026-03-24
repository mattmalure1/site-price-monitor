// attachment-downloader.js — Downloads Discord message attachments via service worker
// Handles deduplication, rate limiting, size limits, and progress reporting
// Declarative content script (IIFE, no ES modules)

(function () {
  'use strict';

  window.__discordExporter = window.__discordExporter || {};

  var MAX_CONCURRENT = 2;
  var DELAY_BETWEEN_MS = 500;
  var DEFAULT_MAX_SIZE_MB = 25;

  function sanitizeFilename(name) {
    return (name || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  function base64ToUint8Array(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function collectAttachments(messages, maxSizeBytes) {
    var seen = {};
    var items = [];
    var skipped = [];

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      if (!msg.attachments || msg.attachments.length === 0) continue;

      for (var j = 0; j < msg.attachments.length; j++) {
        var att = msg.attachments[j];
        if (!att.url || seen[att.url]) continue;
        seen[att.url] = true;

        if (att.size && att.size > maxSizeBytes) {
          skipped.push({
            filename: att.filename,
            url: att.url,
            size: att.size,
            reason: 'Too large (' + (att.size / (1024 * 1024)).toFixed(1) + ' MB)'
          });
          continue;
        }

        var localPath = 'attachments/' + msg.id + '_' + j + '_' + sanitizeFilename(att.filename);
        items.push({
          url: att.url,
          proxyUrl: att.proxy_url,
          filename: att.filename,
          localPath: localPath,
          size: att.size || 0
        });
      }
    }

    return { items: items, skipped: skipped };
  }

  function fetchAttachment(url) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(
        { type: 'FETCH_ATTACHMENT', url: url },
        function (response) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.ok) {
            reject(new Error(response ? response.error : 'No response from service worker'));
            return;
          }
          resolve(base64ToUint8Array(response.data));
        }
      );
    });
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /**
   * Download all attachments from messages.
   * @param {Array} messages - Discord message objects
   * @param {Object} opts - { onProgress, signal, maxSizeMB }
   * @returns {Promise<{ files: Map, skipped: Array, failed: Array }>}
   */
  async function downloadAttachments(messages, opts) {
    opts = opts || {};
    var maxSizeBytes = (opts.maxSizeMB || DEFAULT_MAX_SIZE_MB) * 1024 * 1024;
    var onProgress = opts.onProgress || function () {};
    var signal = opts.signal || null;

    var collected = collectAttachments(messages, maxSizeBytes);
    var items = collected.items;
    var skipped = collected.skipped;
    var failed = [];
    var files = new Map();

    var total = items.length;
    var downloaded = 0;

    if (total === 0) {
      onProgress({ downloaded: 0, total: 0, currentFile: '', skipped: skipped.length, failed: 0 });
      return { files: files, skipped: skipped, failed: failed };
    }

    // Process with concurrency limit
    var index = 0;

    async function worker() {
      while (index < items.length) {
        if (signal && signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        var current = items[index++];

        onProgress({
          downloaded: downloaded,
          total: total,
          currentFile: current.filename,
          skipped: skipped.length,
          failed: failed.length
        });

        try {
          var data = await fetchAttachment(current.url);
          files.set(current.url, { localPath: current.localPath, data: data });
          if (current.proxyUrl) {
            files.set(current.proxyUrl, { localPath: current.localPath, data: data });
          }
        } catch (err) {
          // Retry once with proxy URL
          if (current.proxyUrl) {
            try {
              var data = await fetchAttachment(current.proxyUrl);
              files.set(current.url, { localPath: current.localPath, data: data });
              files.set(current.proxyUrl, { localPath: current.localPath, data: data });
            } catch (err2) {
              failed.push({ filename: current.filename, url: current.url, error: err2.message });
            }
          } else {
            failed.push({ filename: current.filename, url: current.url, error: err.message });
          }
        }

        downloaded++;
        await sleep(DELAY_BETWEEN_MS);
      }
    }

    // Launch concurrent workers
    var workers = [];
    for (var w = 0; w < Math.min(MAX_CONCURRENT, total); w++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    onProgress({
      downloaded: downloaded,
      total: total,
      currentFile: '',
      skipped: skipped.length,
      failed: failed.length
    });

    return { files: files, skipped: skipped, failed: failed };
  }

  window.__discordExporter.downloadAttachments = downloadAttachments;
})();
