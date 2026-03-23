// price-overlay.js — Floating price history widget on tracked product pages
// Declarative content script (IIFE, no ES modules)

(function () {
  if (window.__spm_overlay_active) return;
  window.__spm_overlay_active = true;

  const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'tag', 'fbclid', 'gclid', 'dclid', 'msclkid'];

  function normalizeUrl(raw) {
    try {
      const u = new URL(raw);
      u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
      TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
      u.hash = '';
      let path = u.pathname.replace(/\/+$/, '') || '/';
      u.searchParams.sort();
      return u.hostname + path + (u.search || '');
    } catch { return raw; }
  }

  async function init() {
    let data;
    try {
      data = await chrome.storage.local.get(['items', 'priceHistory', 'settings']);
    } catch { return; }

    const settings = data.settings || {};
    if (settings.overlayEnabled === false) return;

    const items = data.items || {};
    const currentNorm = normalizeUrl(window.location.href);

    let matchedItem = null;
    for (const item of Object.values(items)) {
      if (normalizeUrl(item.url) === currentNorm) {
        matchedItem = item;
        break;
      }
    }
    if (!matchedItem) return;

    const history = (data.priceHistory || {})[matchedItem.id] || [];
    const isDark = settings.darkMode === 'dark' || (settings.darkMode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    // Check collapsed preference
    const stateData = await chrome.storage.local.get('spm_overlay_collapsed');
    const startCollapsed = stateData.spm_overlay_collapsed !== false;

    renderWidget(matchedItem, history, isDark, startCollapsed);
  }

  function renderWidget(item, history, isDark, startCollapsed) {
    const host = document.createElement('div');
    host.id = 'spm-price-overlay-host';
    const shadow = host.attachShadow({ mode: 'closed' });

    shadow.innerHTML = `
      <style>${getStyles()}</style>
      <div class="spm-overlay ${isDark ? 'dark' : 'light'}">
        <div class="spm-collapsed">
          <span class="spm-pill-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </span>
          <span class="spm-pill-price"></span>
          <span class="spm-pill-trend"></span>
        </div>
        <div class="spm-expanded hidden">
          <div class="spm-header">
            <span class="spm-title"></span>
            <div class="spm-controls">
              <button class="spm-btn spm-btn-collapse" title="Collapse">&#8722;</button>
              <button class="spm-btn spm-btn-dismiss" title="Dismiss">&times;</button>
            </div>
          </div>
          <div class="spm-stats"></div>
          <div class="spm-chart-area"><canvas></canvas></div>
          <div class="spm-range-buttons">
            <button data-range="7d">7D</button>
            <button data-range="30d">30D</button>
            <button data-range="all" class="active">All</button>
          </div>
          <a class="spm-link" target="_blank">Full History &rarr;</a>
        </div>
      </div>
    `;

    const root = shadow.querySelector('.spm-overlay');
    const collapsed = shadow.querySelector('.spm-collapsed');
    const expanded = shadow.querySelector('.spm-expanded');
    const titleEl = shadow.querySelector('.spm-title');
    const statsEl = shadow.querySelector('.spm-stats');
    const canvas = shadow.querySelector('canvas');
    const link = shadow.querySelector('.spm-link');
    const pillPrice = shadow.querySelector('.spm-pill-price');
    const pillTrend = shadow.querySelector('.spm-pill-trend');

    let currentRange = 'all';
    let currentHistory = history;
    let currentItem = item;

    function updateContent() {
      const h = currentHistory;
      const prices = h.map(r => r.price);
      const currentPrice = currentItem.currentPrice;
      const priceStr = currentPrice !== null && currentPrice !== undefined ? `$${currentPrice.toFixed(2)}` : 'N/A';

      // Pill
      pillPrice.textContent = priceStr;
      if (h.length >= 2) {
        const prev = h[h.length - 2].price;
        const curr = h[h.length - 1].price;
        const pct = prev !== 0 ? ((curr - prev) / prev * 100).toFixed(1) : 0;
        if (curr < prev) {
          pillTrend.textContent = `\u25BC ${Math.abs(pct)}%`;
          pillTrend.className = 'spm-pill-trend trend-down';
        } else if (curr > prev) {
          pillTrend.textContent = `\u25B2 ${Math.abs(pct)}%`;
          pillTrend.className = 'spm-pill-trend trend-up';
        } else {
          pillTrend.textContent = '';
        }
      } else {
        pillTrend.textContent = '';
      }

      // Title
      titleEl.textContent = currentItem.name || 'Tracked Item';
      titleEl.title = currentItem.name || '';

      // Stats
      if (prices.length > 0) {
        const low = Math.min(...prices);
        const high = Math.max(...prices);
        statsEl.innerHTML = `
          <div class="spm-stat"><span class="spm-stat-label">Current</span><span class="spm-stat-value">${priceStr}</span></div>
          <div class="spm-stat"><span class="spm-stat-label">Low</span><span class="spm-stat-value">$${low.toFixed(2)}</span></div>
          <div class="spm-stat"><span class="spm-stat-label">High</span><span class="spm-stat-value">$${high.toFixed(2)}</span></div>
        `;
      } else {
        statsEl.innerHTML = '<div class="spm-stat"><span class="spm-stat-label">No data yet</span></div>';
      }

      // Link
      link.href = chrome.runtime.getURL(`history/history.html?id=${currentItem.id}`);

      // Chart
      drawChart(canvas, filterHistory(currentHistory, currentRange), currentItem, root.classList.contains('dark'));
    }

    function filterHistory(h, range) {
      if (range === 'all') return h;
      const now = Date.now();
      const ms = range === '7d' ? 7 * 86400000 : 30 * 86400000;
      return h.filter(r => now - r.timestamp <= ms);
    }

    // Collapsed / expanded
    function setCollapsed(val) {
      if (val) {
        collapsed.classList.remove('hidden');
        expanded.classList.add('hidden');
      } else {
        collapsed.classList.add('hidden');
        expanded.classList.remove('hidden');
        drawChart(canvas, filterHistory(currentHistory, currentRange), currentItem, root.classList.contains('dark'));
      }
      chrome.storage.local.set({ spm_overlay_collapsed: val });
    }

    collapsed.addEventListener('click', () => setCollapsed(false));

    shadow.querySelector('.spm-btn-collapse').addEventListener('click', (e) => {
      e.stopPropagation();
      setCollapsed(true);
    });

    shadow.querySelector('.spm-btn-dismiss').addEventListener('click', (e) => {
      e.stopPropagation();
      host.remove();
      window.__spm_overlay_active = false;
    });

    // Range buttons
    shadow.querySelectorAll('.spm-range-buttons button').forEach(btn => {
      btn.addEventListener('click', () => {
        shadow.querySelectorAll('.spm-range-buttons button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRange = btn.dataset.range;
        drawChart(canvas, filterHistory(currentHistory, currentRange), currentItem, root.classList.contains('dark'));
      });
    });

    // Initial render
    updateContent();
    setCollapsed(startCollapsed);

    document.body.appendChild(host);

    // Listen for storage changes (live updates when background checks prices)
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.items) {
        const newItems = changes.items.newValue || {};
        if (newItems[currentItem.id]) {
          currentItem = newItems[currentItem.id];
        }
      }
      if (changes.priceHistory) {
        const newHistory = changes.priceHistory.newValue || {};
        if (newHistory[currentItem.id]) {
          currentHistory = newHistory[currentItem.id];
        }
      }
      if (changes.items || changes.priceHistory) {
        updateContent();
        if (!expanded.classList.contains('hidden')) {
          drawChart(canvas, filterHistory(currentHistory, currentRange), currentItem, root.classList.contains('dark'));
        }
      }
    });
  }

  function drawChart(canvas, history, item, isDark) {
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const lineColor = isDark ? '#60a5fa' : '#2563eb';
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const fillColor = isDark ? 'rgba(96, 165, 250, 0.12)' : 'rgba(37, 99, 235, 0.1)';
    const bgColor = isDark ? '#1e293b' : '#ffffff';

    if (history.length < 2) {
      ctx.fillStyle = textColor;
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Not enough data', w / 2, h / 2);
      return;
    }

    const prices = history.map(r => r.price);
    const timestamps = history.map(r => r.timestamp);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const pL = 45, pR = 10, pT = 10, pB = 24;
    const cW = w - pL - pR;
    const cH = h - pT - pB;

    // Grid lines (3)
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';

    for (let i = 0; i <= 2; i++) {
      const y = pT + (cH / 2) * i;
      const val = max - (range / 2) * i;
      ctx.beginPath();
      ctx.moveTo(pL, y);
      ctx.lineTo(w - pR, y);
      ctx.stroke();
      ctx.fillText(`$${val.toFixed(val >= 100 ? 0 : 2)}`, pL - 4, y + 3);
    }

    // Target line
    if (item.targetPrice !== null && item.targetPrice !== undefined && item.targetPrice >= min && item.targetPrice <= max) {
      const tY = pT + ((max - item.targetPrice) / range) * cH;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pL, tY);
      ctx.lineTo(w - pR, tY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // X-axis labels (3-4)
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    const labelCount = Math.min(4, history.length);
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor(i * (history.length - 1) / (labelCount - 1));
      const x = pL + (idx / (history.length - 1)) * cW;
      const d = new Date(timestamps[idx]);
      ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, x, h - 4);
    }

    // Price line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    const points = [];
    for (let i = 0; i < prices.length; i++) {
      const x = pL + (i / (prices.length - 1)) * cW;
      const y = pT + ((max - prices[i]) / range) * cH;
      points.push({ x, y });
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under line
    ctx.lineTo(points[points.length - 1].x, pT + cH);
    ctx.lineTo(points[0].x, pT + cH);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
  }

  function getStyles() {
    return `
      :host {
        all: initial;
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 2147483640;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .hidden { display: none !important; }

      .spm-overlay {
        --bg: #ffffff;
        --bg-card: #f8fafc;
        --text: #0f172a;
        --text-muted: #64748b;
        --border: #e2e8f0;
        --accent: #2563eb;
        --accent-light: rgba(37, 99, 235, 0.08);
      }

      .spm-overlay.dark {
        --bg: #1e293b;
        --bg-card: #0f172a;
        --text: #f1f5f9;
        --text-muted: #94a3b8;
        --border: #334155;
        --accent: #60a5fa;
        --accent-light: rgba(96, 165, 250, 0.1);
      }

      .spm-collapsed {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 20px;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        transition: transform 0.15s, box-shadow 0.15s;
        user-select: none;
      }

      .spm-collapsed:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(0,0,0,0.18);
      }

      .spm-pill-icon {
        display: flex;
        align-items: center;
        color: var(--accent);
      }

      .spm-pill-price {
        font-size: 13px;
        font-weight: 600;
        color: var(--text);
      }

      .spm-pill-trend {
        font-size: 11px;
        font-weight: 500;
      }

      .trend-down { color: #22c55e; }
      .trend-up { color: #ef4444; }

      .spm-expanded {
        width: 340px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        overflow: hidden;
      }

      .spm-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid var(--border);
      }

      .spm-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 240px;
      }

      .spm-controls {
        display: flex;
        gap: 4px;
      }

      .spm-btn {
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        font-size: 16px;
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        padding: 0;
      }

      .spm-btn:hover {
        background: var(--accent-light);
        color: var(--text);
      }

      .spm-stats {
        display: flex;
        gap: 8px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--border);
      }

      .spm-stat {
        flex: 1;
        text-align: center;
      }

      .spm-stat-label {
        display: block;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-muted);
        margin-bottom: 2px;
      }

      .spm-stat-value {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: var(--text);
      }

      .spm-chart-area {
        padding: 8px 8px 0;
        height: 140px;
      }

      .spm-chart-area canvas {
        width: 100%;
        height: 100%;
        display: block;
      }

      .spm-range-buttons {
        display: flex;
        justify-content: center;
        gap: 4px;
        padding: 6px 12px;
      }

      .spm-range-buttons button {
        padding: 3px 10px;
        font-size: 10px;
        font-weight: 500;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--text-muted);
        border-radius: 10px;
        cursor: pointer;
        font-family: inherit;
      }

      .spm-range-buttons button:hover {
        background: var(--accent-light);
      }

      .spm-range-buttons button.active {
        background: var(--accent);
        color: white;
        border-color: var(--accent);
      }

      .spm-link {
        display: block;
        text-align: center;
        padding: 8px;
        font-size: 11px;
        color: var(--accent);
        text-decoration: none;
        border-top: 1px solid var(--border);
      }

      .spm-link:hover {
        background: var(--accent-light);
      }
    `;
  }

  init();
})();
