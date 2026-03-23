import { getItem, getPriceHistory, getSettings } from '../lib/storage.js';

let allHistory = [];
let item = null;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get('id');
  if (!itemId) {
    document.getElementById('item-name').textContent = 'No item specified';
    return;
  }

  item = await getItem(itemId);
  allHistory = await getPriceHistory(itemId);

  if (!item) {
    document.getElementById('item-name').textContent = 'Item not found';
    return;
  }

  // Apply theme
  const settings = await getSettings();
  const dark = settings.darkMode === 'dark' || (settings.darkMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');

  // Populate header
  document.getElementById('item-name').textContent = item.name;
  document.getElementById('item-url').textContent = getDomain(item.url);
  document.getElementById('btn-visit').href = item.url;
  document.title = `Price History — ${item.name}`;

  // Calculate and show stats
  showStats();

  // Draw chart & table
  drawChart(allHistory);
  renderTable(allHistory);

  // Range buttons
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filtered = filterByRange(btn.dataset.range);
      drawChart(filtered);
    });
  });
});

function showStats() {
  const prices = allHistory.map(r => r.price);
  if (prices.length === 0) return;

  const current = item.currentPrice;
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const lowRecord = allHistory.find(r => r.price === low);
  const highRecord = allHistory.find(r => r.price === high);

  document.getElementById('stat-current').textContent = current !== null ? `$${current.toFixed(2)}` : 'N/A';
  document.getElementById('stat-target').textContent = item.targetPrice !== null ? `$${item.targetPrice.toFixed(2)}` : 'None';
  document.getElementById('stat-low').textContent = `$${low.toFixed(2)}`;
  document.getElementById('stat-low-date').textContent = lowRecord ? formatDate(lowRecord.timestamp) : '';
  document.getElementById('stat-high').textContent = `$${high.toFixed(2)}`;
  document.getElementById('stat-high-date').textContent = highRecord ? formatDate(highRecord.timestamp) : '';
  document.getElementById('stat-avg').textContent = `$${avg.toFixed(2)}`;
  document.getElementById('stat-count').textContent = prices.length;
}

function filterByRange(range) {
  if (range === 'all') return allHistory;
  const now = Date.now();
  const ms = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }[range] || 0;
  return allHistory.filter(r => (now - r.timestamp) <= ms);
}

function drawChart(history) {
  const canvas = document.getElementById('price-chart');
  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();

  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  ctx.scale(2, 2);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  if (history.length < 2) {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted');
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Not enough data for chart', w / 2, h / 2);
    return;
  }

  const prices = history.map(r => r.price);
  const timestamps = history.map(r => r.timestamp);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  const chartW = w - paddingLeft - paddingRight;
  const chartH = h - paddingTop - paddingBottom;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const lineColor = isDark ? '#60a5fa' : '#2563eb';
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const fillColor = isDark ? 'rgba(96, 165, 250, 0.1)' : 'rgba(37, 99, 235, 0.1)';

  // Draw grid lines (5 horizontal)
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  ctx.font = '11px sans-serif';
  ctx.fillStyle = textColor;
  ctx.textAlign = 'right';

  for (let i = 0; i <= 4; i++) {
    const y = paddingTop + (chartH / 4) * i;
    const priceVal = max - (range / 4) * i;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(w - paddingRight, y);
    ctx.stroke();
    ctx.fillText(`$${priceVal.toFixed(2)}`, paddingLeft - 8, y + 4);
  }

  // Draw target line if set
  if (item.targetPrice !== null && item.targetPrice >= min && item.targetPrice <= max) {
    const targetY = paddingTop + ((max - item.targetPrice) / range) * chartH;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, targetY);
    ctx.lineTo(w - paddingRight, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'left';
    ctx.fillText('Target', w - paddingRight + 4, targetY + 4);
  }

  // Draw X-axis labels (timestamps)
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  const labelCount = Math.min(6, history.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor(i * (history.length - 1) / (labelCount - 1));
    const x = paddingLeft + (idx / (history.length - 1)) * chartW;
    ctx.fillText(formatShortDate(timestamps[idx]), x, h - 8);
  }

  // Draw price line
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();

  const points = [];
  for (let i = 0; i < prices.length; i++) {
    const x = paddingLeft + (i / (prices.length - 1)) * chartW;
    const y = paddingTop + ((max - prices[i]) / range) * chartH;
    points.push({ x, y });
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Fill area under line
  ctx.lineTo(points[points.length - 1].x, paddingTop + chartH);
  ctx.lineTo(points[0].x, paddingTop + chartH);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Draw dots at data points (if not too many)
  if (points.length <= 50) {
    ctx.fillStyle = lineColor;
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function renderTable(history) {
  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = '';

  // Show newest first
  const reversed = [...history].reverse();

  for (let i = 0; i < reversed.length; i++) {
    const record = reversed[i];
    const prev = reversed[i + 1]; // previous in time (next in reversed array)
    const change = prev ? record.price - prev.price : 0;
    const changePercent = prev ? ((change / prev.price) * 100) : 0;

    let changeClass = '';
    let changeText = '--';
    if (prev) {
      if (change < 0) {
        changeClass = 'change-down';
        changeText = `-$${Math.abs(change).toFixed(2)} (${changePercent.toFixed(1)}%)`;
      } else if (change > 0) {
        changeClass = 'change-up';
        changeText = `+$${change.toFixed(2)} (+${changePercent.toFixed(1)}%)`;
      } else {
        changeText = 'No change';
      }
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatDateTime(record.timestamp)}</td>
      <td class="price-cell">$${record.price.toFixed(2)}</td>
      <td class="${changeClass}">${changeText}</td>
    `;
    tbody.appendChild(row);
  }
}

// --- Utilities ---
function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateTime(ts) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
