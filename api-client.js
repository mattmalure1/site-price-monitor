// api-client.js — Discord API client with rate limiting and pagination
// Declarative content script (no ES modules)

(function () {
  'use strict';

  window.__discordExporter = window.__discordExporter || {};

  const API_BASE = 'https://discord.com/api/v9';
  const MESSAGES_PER_REQUEST = 100;
  const MIN_REQUEST_DELAY_MS = 1000;
  const DEFAULT_DELAY_MS = 1500;

  class DiscordApiClient {
    constructor(token) {
      this._token = token;
      this._abortController = null;
    }

    get headers() {
      return {
        'Authorization': this._token,
        'Content-Type': 'application/json'
      };
    }

    // Cancel any in-progress export
    abort() {
      if (this._abortController) {
        this._abortController.abort();
        this._abortController = null;
      }
    }

    // Fetch channel metadata
    async getChannel(channelId) {
      const resp = await fetch(API_BASE + '/channels/' + channelId, {
        headers: this.headers
      });
      if (!resp.ok) throw new Error('Failed to fetch channel: ' + resp.status);
      return resp.json();
    }

    // Fetch guild (server) metadata
    async getGuild(guildId) {
      const resp = await fetch(API_BASE + '/guilds/' + guildId, {
        headers: this.headers
      });
      if (!resp.ok) throw new Error('Failed to fetch guild: ' + resp.status);
      return resp.json();
    }

    // Fetch all messages from a channel with pagination
    // options: { before, after, dateRange: { start, end }, onProgress, onBatch }
    async fetchAllMessages(channelId, options) {
      options = options || {};
      this._abortController = new AbortController();
      const signal = this._abortController.signal;

      const allMessages = [];
      let beforeId = options.before || null;
      let hasMore = true;
      let totalFetched = 0;

      // If date range end is specified, convert to snowflake for 'before'
      if (options.dateRange && options.dateRange.end) {
        const endSnowflake = dateToSnowflake(options.dateRange.end);
        if (!beforeId || BigInt(endSnowflake) < BigInt(beforeId)) {
          beforeId = endSnowflake;
        }
      }

      // Start date snowflake for filtering
      const afterSnowflake = options.dateRange && options.dateRange.start
        ? dateToSnowflake(options.dateRange.start)
        : null;

      while (hasMore) {
        if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');

        // Build URL
        let url = API_BASE + '/channels/' + channelId + '/messages?limit=' + MESSAGES_PER_REQUEST;
        if (beforeId) url += '&before=' + beforeId;

        // Fetch batch
        const resp = await fetch(url, {
          headers: this.headers,
          signal: signal
        });

        // Handle rate limiting
        if (resp.status === 429) {
          const retryData = await resp.json();
          const retryAfter = (retryData.retry_after || 5) * 1000;
          if (options.onProgress) {
            options.onProgress({
              fetched: totalFetched,
              status: 'rate_limited',
              retryAfterMs: retryAfter
            });
          }
          await sleep(retryAfter, signal);
          continue; // Retry same request
        }

        if (!resp.ok) {
          throw new Error('Discord API error: ' + resp.status + ' ' + resp.statusText);
        }

        const messages = await resp.json();

        if (!messages || messages.length === 0) {
          hasMore = false;
          break;
        }

        // Messages come newest-first; filter by start date if needed
        let filteredBatch = messages;
        if (afterSnowflake) {
          filteredBatch = messages.filter(function (m) {
            return BigInt(m.id) >= BigInt(afterSnowflake);
          });
          // If we filtered some out, we've gone past the start date
          if (filteredBatch.length < messages.length) {
            hasMore = false;
          }
        }

        allMessages.push.apply(allMessages, filteredBatch);
        totalFetched += filteredBatch.length;

        // Update progress
        if (options.onProgress) {
          options.onProgress({ fetched: totalFetched, status: 'fetching' });
        }

        // Emit batch for streaming formatters
        if (options.onBatch) {
          options.onBatch(filteredBatch);
        }

        // Set up next page — use last message ID as 'before' cursor
        if (messages.length < MESSAGES_PER_REQUEST) {
          hasMore = false;
        } else {
          beforeId = messages[messages.length - 1].id;
        }

        // Respect rate limits from headers
        if (hasMore) {
          const delay = getRateLimitDelay(resp);
          await sleep(delay, signal);
        }
      }

      this._abortController = null;

      // Sort chronologically (oldest first)
      allMessages.sort(function (a, b) {
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

      return allMessages;
    }
  }

  // --- Helpers ---

  function getRateLimitDelay(response) {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const resetAfter = response.headers.get('X-RateLimit-Reset-After');

    if (remaining !== null && parseInt(remaining, 10) <= 1 && resetAfter) {
      return Math.max(parseFloat(resetAfter) * 1000, MIN_REQUEST_DELAY_MS);
    }

    return DEFAULT_DELAY_MS;
  }

  function sleep(ms, signal) {
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) {
        reject(new DOMException('Export cancelled', 'AbortError'));
        return;
      }

      var timer = setTimeout(resolve, ms);

      if (signal) {
        signal.addEventListener('abort', function () {
          clearTimeout(timer);
          reject(new DOMException('Export cancelled', 'AbortError'));
        }, { once: true });
      }
    });
  }

  // Convert a Date to a Discord snowflake ID
  // Discord epoch: 2015-01-01T00:00:00.000Z = 1420070400000
  function dateToSnowflake(date) {
    const DISCORD_EPOCH = 1420070400000;
    const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
    // Snowflake = (timestamp_ms - discord_epoch) << 22
    return String((BigInt(timestamp - DISCORD_EPOCH)) << 22n);
  }

  // Export
  window.__discordExporter.DiscordApiClient = DiscordApiClient;
  window.__discordExporter.dateToSnowflake = dateToSnowflake;
})();
