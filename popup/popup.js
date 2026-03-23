import { getAllItems, getItem, addItem, updateItem, deleteItem, toggleItem, getPriceHistory, getSettings, parsePrice } from '../lib/storage.js';

// --- DOM refs ---
const btnTrack = document.getElementById('btn-track');
const btnSettings = document.getElementById('btn-settings');
const btnCheckAll = document.getElementById('btn-check-all');
const addForm = document.getElementById('add-form');
const itemsList = document.getElementById('items-list');
const emptyState = document.getElementById('empty-state');
const editModal = document.getElementById('edit-modal');

// Search/Filter/Sort
const searchInput = document.getElementById('search-input');
const filterSelect = document.getElementById('filter-select');
const sortSelect = document.getElementById('sort-select');

// Bulk actions
const bulkActions = document.getElementById('bulk-actions');
const selectAllCb = document.getElementById('select-all-cb');
const bulkCount = document.getElementById('bulk-count');

// Add form inputs
const inputName = document.getElementById('input-name');
const inputUrl = document.getElementById('input-url');
const inputSelector = document.getElementById('input-selector');
const inputFallbackSelectors = document.getElementById('input-fallback-selectors');
const inputCurrentPrice = document.getElementById('input-current-price');
const inputTargetPrice = document.getElementById('input-target-price');
const inputAlertCondition = document.getElementById('input-alert-condition');
const inputPercentThreshold = document.getElementById('input-percent-threshold');
const percentThresholdGroup = document.getElementById('percent-threshold-group');
const inputInterval = document.getElementById('input-interval');
const inputBrowserRendering = document.getElementById('input-browser-rendering');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');

// Edit modal inputs
const editId = document.getElementById('edit-id');
const editName = document.getElementById('edit-name');
const editSelector = document.getElementById('edit-selector');
const editFallbackSelectors = document.getElementById('edit-fallback-selectors');
const editTargetPrice = document.getElementById('edit-target-price');
const editAlertCondition = document.getElementById('edit-alert-condition');
const editPercentThreshold = document.getElementById('edit-percent-threshold');
const editPercentThresholdGroup = document.getElementById('edit-percent-threshold-group');
const editInterval = document.getElementById('edit-interval');
const editBrowserRendering = document.getElementById('edit-browser-rendering');
const btnEditSave = document.getElementById('btn-edit-save');
const btnEditCancel = document.getElementById('btn-edit-cancel');

// Stats
const statTotal = document.getElementById('stat-total');
const statBelow = document.getElementById('stat-below');
const statActive = document.getElementById('stat-active');
const statErrors = document.getElementById('stat-errors');

// State
let selectedItems = new Set();
let allItemsCache = [];

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadItems();
  setupEventListeners();
  checkPendingPick();
  applyTheme();
});

async function applyTheme() {
  const settings = await getSettings();
  const dark = settings.darkMode === 'dark' || (settings.darkMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

async function checkPendingPick() {
  const result = await chrome.storage.local.get('pendingPick');
  if (result.pendingPick) {
    const msg = result.pendingPick;
    inputSelector.value = msg.selector;
    inputCurrentPrice.value = msg.text;
    showAddForm();
    chrome.storage.local.remove('pendingPick');
  }
}

function setupEventListeners() {
  btnTrack.addEventListener('click', startTracking);
  btnSave.addEventListener('click', saveNewItem);
  btnCancel.addEventListener('click', cancelAdd);
  btnSettings.addEventListener('click', openSettings);
  btnCheckAll.addEventListener('click', checkAll);
  btnEditSave.addEventListener('click', saveEditItem);
  btnEditCancel.addEventListener('click', () => editModal.classList.add('hidden'));

  inputAlertCondition.addEventListener('change', () => {
    percentThresholdGroup.classList.toggle('hidden', inputAlertCondition.value !== 'percent_drop');
  });
  editAlertCondition.addEventListener('change', () => {
    editPercentThresholdGroup.classList.toggle('hidden', editAlertCondition.value !== 'percent_drop');
  });

  // Search/filter/sort
  searchInput.addEventListener('input', loadItems);
  filterSelect.addEventListener('change', loadItems);
  sortSelect.addEventListener('change', loadItems);

  // Bulk actions
  selectAllCb.addEventListener('change', toggleSelectAll);
  document.querySelectorAll('[data-bulk]').forEach(btn => {
    btn.addEventListener('click', handleBulkAction);
  });
}

// --- Load & Render Items ---
async function loadItems() {
  const items = await getAllItems();
  let itemArray = Object.values(items);
  allItemsCache = itemArray;

  // Update stats (before filtering)
  statTotal.textContent = itemArray.length;
  statBelow.textContent = itemArray.filter(i => i.targetPrice !== null && i.currentPrice !== null && i.currentPrice <= i.targetPrice).length;
  statActive.textContent = itemArray.filter(i => i.isActive).length;
  statErrors.textContent = itemArray.filter(i => i.isActive && i.lastError).length;

  // Apply search
  const query = searchInput.value.toLowerCase().trim();
  if (query) {
    itemArray = itemArray.filter(i =>
      i.name.toLowerCase().includes(query) ||
      i.url.toLowerCase().includes(query) ||
      getDomain(i.url).toLowerCase().includes(query)
    );
  }

  // Apply filter
  const filter = filterSelect.value;
  switch (filter) {
    case 'active': itemArray = itemArray.filter(i => i.isActive); break;
    case 'paused': itemArray = itemArray.filter(i => !i.isActive); break;
    case 'errors': itemArray = itemArray.filter(i => i.lastError); break;
    case 'target_met': itemArray = itemArray.filter(i => i.targetPrice !== null && i.currentPrice !== null && i.currentPrice <= i.targetPrice); break;
  }

  // Apply sort
  const sort = sortSelect.value;
  switch (sort) {
    case 'newest': itemArray.sort((a, b) => b.createdAt - a.createdAt); break;
    case 'oldest': itemArray.sort((a, b) => a.createdAt - b.createdAt); break;
    case 'name': itemArray.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'price_low': itemArray.sort((a, b) => (a.currentPrice || Infinity) - (b.currentPrice || Infinity)); break;
    case 'price_high': itemArray.sort((a, b) => (b.currentPrice || 0) - (a.currentPrice || 0)); break;
    case 'last_checked': itemArray.sort((a, b) => (b.lastChecked || 0) - (a.lastChecked || 0)); break;
  }

  // Show/hide empty state
  if (allItemsCache.length === 0) {
    emptyState.classList.remove('hidden');
    itemsList.classList.add('hidden');
  } else {
    emptyState.classList.add('hidden');
    itemsList.classList.remove('hidden');
    await renderItems(itemArray);
  }

  updateBulkUI();
}

async function renderItems(items) {
  itemsList.innerHTML = '';
  for (const item of items) {
    const history = await getPriceHistory(item.id);
    const card = createTrackingCard(item, history);
    itemsList.appendChild(card);
  }
}

function createTrackingCard(item, history) {
  const card = document.createElement('div');
  card.className = 'tracking-card';
  card.dataset.itemId = item.id;
  if (!item.isActive) card.classList.add('inactive');
  if (item.targetPrice !== null && item.currentPrice !== null && item.currentPrice <= item.targetPrice) {
    card.classList.add('alert');
  }
  if (item.lastError) card.classList.add('has-error');

  // Determine price direction
  let priceClass = '';
  if (history.length >= 2) {
    const prev = history[history.length - 2].price;
    if (item.currentPrice < prev) priceClass = 'price-down';
    else if (item.currentPrice > prev) priceClass = 'price-up';
  }

  const priceDisplay = item.currentPrice !== null ? `$${item.currentPrice.toFixed(2)}` : 'N/A';
  const targetDisplay = item.targetPrice !== null ? `Target: $${item.targetPrice.toFixed(2)}` : 'No target';
  const lastChecked = item.lastChecked ? timeAgo(item.lastChecked) : 'Never';
  const domain = getDomain(item.url);
  const isSnoozed = item.snoozedUntil && Date.now() < item.snoozedUntil;

  let errorHtml = '';
  if (item.lastError) {
    errorHtml = `<div class="card-error" title="${escapeHtml(item.lastError)}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      ${escapeHtml(item.lastError.slice(0, 40))}${item.errorCount > 1 ? ` (x${item.errorCount})` : ''}
    </div>`;
  }

  let snoozeHtml = '';
  if (isSnoozed) {
    snoozeHtml = `<span class="snooze-badge" title="Snoozed until ${new Date(item.snoozedUntil).toLocaleString()}">Snoozed</span>`;
  }

  card.innerHTML = `
    <div class="card-header">
      <label class="card-checkbox"><input type="checkbox" class="item-cb" data-id="${item.id}"></label>
      <span class="card-name" title="${escapeHtml(item.name)}" data-url="${escapeHtml(item.url)}">${escapeHtml(item.name)}</span>
      <div class="card-actions">
        <button class="card-action-btn" data-action="history" data-id="${item.id}" title="Price history">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </button>
        <button class="card-action-btn" data-action="snooze" data-id="${item.id}" title="Snooze alerts">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        </button>
        <button class="card-action-btn" data-action="check" data-id="${item.id}" title="Check now">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
        <button class="card-action-btn ${item.isActive ? 'active' : 'paused'}" data-action="toggle" data-id="${item.id}" title="${item.isActive ? 'Pause' : 'Resume'}">
          ${item.isActive
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
          }
        </button>
        <button class="card-action-btn" data-action="edit" data-id="${item.id}" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="card-action-btn" data-action="delete" data-id="${item.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
    <div class="card-prices">
      <span class="current-price ${priceClass}">${priceDisplay}</span>
      <span class="target-price">${targetDisplay}</span>
      ${snoozeHtml}
    </div>
    ${errorHtml}
    <div class="card-sparkline"><canvas data-item-id="${item.id}"></canvas></div>
    <div class="card-meta">
      <span>${domain}${item.useBrowserRendering ? ' (JS)' : ''}</span>
      <span>Checked ${lastChecked}</span>
    </div>
  `;

  // Event listeners
  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleCardAction);
  });

  card.querySelector('.card-name').addEventListener('click', () => {
    chrome.tabs.create({ url: item.url });
  });

  // Checkbox for bulk selection
  const cb = card.querySelector('.item-cb');
  cb.checked = selectedItems.has(item.id);
  cb.addEventListener('change', () => {
    if (cb.checked) selectedItems.add(item.id);
    else selectedItems.delete(item.id);
    updateBulkUI();
  });

  // Draw sparkline
  requestAnimationFrame(() => {
    const canvas = card.querySelector(`canvas[data-item-id="${item.id}"]`);
    if (canvas && history.length > 1) {
      drawSparkline(canvas, history);
    }
  });

  return card;
}

function drawSparkline(canvas, history) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  ctx.scale(2, 2);

  const w = rect.width;
  const h = rect.height;
  const prices = history.map(r => r.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const padding = 2;

  ctx.beginPath();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  ctx.strokeStyle = isDark ? '#60a5fa' : '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';

  for (let i = 0; i < prices.length; i++) {
    const x = (i / (prices.length - 1)) * (w - padding * 2) + padding;
    const y = h - padding - ((prices[i] - min) / range) * (h - padding * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.lineTo(w - padding, h - padding);
  ctx.lineTo(padding, h - padding);
  ctx.closePath();
  ctx.fillStyle = isDark ? 'rgba(96, 165, 250, 0.08)' : 'rgba(37, 99, 235, 0.08)';
  ctx.fill();
}

// --- Card Actions ---
async function handleCardAction(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  switch (action) {
    case 'toggle':
      await toggleItem(id);
      await loadItems();
      break;
    case 'delete':
      if (confirm('Delete this tracker?')) {
        await deleteItem(id);
        selectedItems.delete(id);
        await loadItems();
      }
      break;
    case 'edit':
      await openEditModal(id);
      break;
    case 'check':
      btn.classList.add('spinning');
      chrome.runtime.sendMessage({ type: 'CHECK_ITEM', itemId: id }, () => {
        // Wait for the check to complete, then refresh
        setTimeout(async () => {
          btn.classList.remove('spinning');
          await loadItems();
        }, 1500);
      });
      break;
    case 'history':
      chrome.tabs.create({ url: chrome.runtime.getURL(`history/history.html?id=${id}`) });
      break;
    case 'snooze':
      showSnoozeMenu(btn, id);
      break;
  }
}

function showSnoozeMenu(anchorBtn, itemId) {
  // Remove existing snooze menu
  document.querySelectorAll('.snooze-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'snooze-menu';
  menu.innerHTML = `
    <button data-mins="60">1 hour</button>
    <button data-mins="360">6 hours</button>
    <button data-mins="1440">24 hours</button>
    <button data-mins="10080">1 week</button>
    <button data-mins="0">Unsnooze</button>
  `;

  menu.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mins = parseInt(btn.dataset.mins);
      if (mins === 0) {
        await updateItem(itemId, { snoozedUntil: null });
      } else {
        chrome.runtime.sendMessage({ type: 'SNOOZE_ITEM', itemId, duration: mins });
      }
      menu.remove();
      await loadItems();
    });
  });

  anchorBtn.parentElement.appendChild(menu);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closer(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closer);
      }
    });
  }, 0);
}

// --- Bulk Actions ---
function updateBulkUI() {
  const count = selectedItems.size;
  bulkCount.textContent = count;
  bulkActions.classList.toggle('hidden', count === 0);
  selectAllCb.checked = count > 0 && count === allItemsCache.length;
}

function toggleSelectAll() {
  if (selectAllCb.checked) {
    allItemsCache.forEach(i => selectedItems.add(i.id));
  } else {
    selectedItems.clear();
  }
  document.querySelectorAll('.item-cb').forEach(cb => {
    cb.checked = selectAllCb.checked;
  });
  updateBulkUI();
}

async function handleBulkAction(e) {
  const action = e.currentTarget.dataset.bulk;
  const ids = [...selectedItems];

  if (ids.length === 0) return;

  switch (action) {
    case 'check':
      chrome.runtime.sendMessage({ type: 'CHECK_ALL' }, () => {
        setTimeout(loadItems, 3000);
      });
      break;
    case 'pause':
      for (const id of ids) await updateItem(id, { isActive: false });
      break;
    case 'resume':
      for (const id of ids) await updateItem(id, { isActive: true });
      break;
    case 'delete':
      if (!confirm(`Delete ${ids.length} tracker(s)?`)) return;
      for (const id of ids) await deleteItem(id);
      selectedItems.clear();
      break;
  }

  await loadItems();
}

async function checkAll() {
  btnCheckAll.classList.add('spinning');
  chrome.runtime.sendMessage({ type: 'CHECK_ALL' }, () => {
    setTimeout(async () => {
      btnCheckAll.classList.remove('spinning');
      await loadItems();
    }, 3000);
  });
}

// --- Edit Modal ---
async function openEditModal(id) {
  const item = await getItem(id);
  if (!item) return;

  editId.value = item.id;
  editName.value = item.name;
  editSelector.value = item.selector;
  editFallbackSelectors.value = (item.fallbackSelectors || []).join(', ');
  editTargetPrice.value = item.targetPrice || '';
  editAlertCondition.value = item.alertCondition || 'below_target';
  editPercentThreshold.value = item.percentThreshold || '';
  editPercentThresholdGroup.classList.toggle('hidden', item.alertCondition !== 'percent_drop');
  editInterval.value = item.checkIntervalMinutes || '';
  editBrowserRendering.checked = item.useBrowserRendering || false;

  editModal.classList.remove('hidden');
}

async function saveEditItem() {
  const id = editId.value;
  const fallbackStr = editFallbackSelectors.value.trim();
  const updates = {
    name: editName.value.trim(),
    selector: editSelector.value.trim(),
    fallbackSelectors: fallbackStr ? fallbackStr.split(',').map(s => s.trim()).filter(Boolean) : [],
    targetPrice: editTargetPrice.value ? parseFloat(editTargetPrice.value) : null,
    alertCondition: editAlertCondition.value,
    percentThreshold: editPercentThreshold.value ? parseInt(editPercentThreshold.value) : null,
    checkIntervalMinutes: editInterval.value ? parseInt(editInterval.value) : null,
    useBrowserRendering: editBrowserRendering.checked
  };

  await updateItem(id, updates);
  editModal.classList.add('hidden');
  await loadItems();
}

// --- Tracking Flow ---
async function startTracking() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  inputUrl.value = tab.url;
  inputName.value = tab.title || '';

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/element-picker.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content/element-picker.css']
    });
  } catch (err) {
    console.error('Failed to inject picker:', err);
    showAddForm();
    return;
  }

  chrome.runtime.onMessage.addListener(function pickerListener(msg) {
    if (msg.type === 'ELEMENT_PICKED') {
      chrome.runtime.onMessage.removeListener(pickerListener);
      inputSelector.value = msg.selector;
      inputCurrentPrice.value = msg.text;
      inputName.value = msg.text ? inputName.value : '';
      showAddForm();
    } else if (msg.type === 'PICKER_CANCELLED') {
      chrome.runtime.onMessage.removeListener(pickerListener);
    }
  });

  window.close();
}

function showAddForm() {
  addForm.classList.remove('hidden');
  btnTrack.classList.add('hidden');
  inputName.focus();
}

function cancelAdd() {
  addForm.classList.add('hidden');
  btnTrack.classList.remove('hidden');
  clearForm();
}

function clearForm() {
  inputName.value = '';
  inputUrl.value = '';
  inputSelector.value = '';
  inputFallbackSelectors.value = '';
  inputCurrentPrice.value = '';
  inputTargetPrice.value = '';
  inputAlertCondition.value = 'below_target';
  inputPercentThreshold.value = '';
  inputInterval.value = '';
  inputBrowserRendering.checked = false;
  percentThresholdGroup.classList.add('hidden');
}

async function saveNewItem() {
  const url = inputUrl.value.trim();
  const selector = inputSelector.value.trim();

  if (!url || !selector) {
    alert('URL and CSS Selector are required.');
    return;
  }

  const priceText = inputCurrentPrice.value;
  const currentPrice = parsePrice(priceText);
  const fallbackStr = inputFallbackSelectors.value.trim();

  const item = await addItem({
    url,
    name: inputName.value.trim() || 'Untitled',
    selector,
    fallbackSelectors: fallbackStr ? fallbackStr.split(',').map(s => s.trim()).filter(Boolean) : [],
    currentPrice,
    targetPrice: inputTargetPrice.value ? parseFloat(inputTargetPrice.value) : null,
    alertCondition: inputAlertCondition.value,
    percentThreshold: inputPercentThreshold.value ? parseInt(inputPercentThreshold.value) : null,
    checkIntervalMinutes: inputInterval.value ? parseInt(inputInterval.value) : null,
    useBrowserRendering: inputBrowserRendering.checked
  });

  chrome.runtime.sendMessage({ type: 'ITEM_ADDED', item });

  cancelAdd();
  await loadItems();
}

// --- Settings ---
function openSettings() {
  chrome.runtime.openOptionsPage();
}

// --- Utilities ---
function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ELEMENT_PICKED') {
    inputSelector.value = msg.selector;
    inputCurrentPrice.value = msg.text;
    showAddForm();
  } else if (msg.type === 'PRICES_UPDATED') {
    loadItems();
  }
});
