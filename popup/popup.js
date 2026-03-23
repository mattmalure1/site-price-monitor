import { getAllItems, getItem, addItem, updateItem, deleteItem, toggleItem, getPriceHistory, getSettings, parsePrice } from '../lib/storage.js';

// --- DOM refs ---
const btnTrack = document.getElementById('btn-track');
const btnSettings = document.getElementById('btn-settings');
const addForm = document.getElementById('add-form');
const itemsList = document.getElementById('items-list');
const emptyState = document.getElementById('empty-state');
const editModal = document.getElementById('edit-modal');

// Add form inputs
const inputName = document.getElementById('input-name');
const inputUrl = document.getElementById('input-url');
const inputSelector = document.getElementById('input-selector');
const inputCurrentPrice = document.getElementById('input-current-price');
const inputTargetPrice = document.getElementById('input-target-price');
const inputAlertCondition = document.getElementById('input-alert-condition');
const inputPercentThreshold = document.getElementById('input-percent-threshold');
const percentThresholdGroup = document.getElementById('percent-threshold-group');
const inputInterval = document.getElementById('input-interval');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');

// Edit modal inputs
const editId = document.getElementById('edit-id');
const editName = document.getElementById('edit-name');
const editSelector = document.getElementById('edit-selector');
const editTargetPrice = document.getElementById('edit-target-price');
const editAlertCondition = document.getElementById('edit-alert-condition');
const editPercentThreshold = document.getElementById('edit-percent-threshold');
const editPercentThresholdGroup = document.getElementById('edit-percent-threshold-group');
const editInterval = document.getElementById('edit-interval');
const btnEditSave = document.getElementById('btn-edit-save');
const btnEditCancel = document.getElementById('btn-edit-cancel');

// Stats
const statTotal = document.getElementById('stat-total');
const statBelow = document.getElementById('stat-below');
const statActive = document.getElementById('stat-active');

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadItems();
  setupEventListeners();
});

function setupEventListeners() {
  btnTrack.addEventListener('click', startTracking);
  btnSave.addEventListener('click', saveNewItem);
  btnCancel.addEventListener('click', cancelAdd);
  btnSettings.addEventListener('click', openSettings);
  btnEditSave.addEventListener('click', saveEditItem);
  btnEditCancel.addEventListener('click', () => editModal.classList.add('hidden'));

  inputAlertCondition.addEventListener('change', () => {
    percentThresholdGroup.classList.toggle('hidden', inputAlertCondition.value !== 'percent_drop');
  });
  editAlertCondition.addEventListener('change', () => {
    editPercentThresholdGroup.classList.toggle('hidden', editAlertCondition.value !== 'percent_drop');
  });
}

// --- Load & Render Items ---
async function loadItems() {
  const items = await getAllItems();
  const itemArray = Object.values(items);

  // Update stats
  statTotal.textContent = itemArray.length;
  statBelow.textContent = itemArray.filter(i => i.targetPrice !== null && i.currentPrice !== null && i.currentPrice <= i.targetPrice).length;
  statActive.textContent = itemArray.filter(i => i.isActive).length;

  // Show/hide empty state
  if (itemArray.length === 0) {
    emptyState.classList.remove('hidden');
    itemsList.classList.add('hidden');
  } else {
    emptyState.classList.add('hidden');
    itemsList.classList.remove('hidden');
    await renderItems(itemArray);
  }
}

async function renderItems(items) {
  // Sort: active first, then by creation date (newest first)
  items.sort((a, b) => {
    if (a.isActive !== b.isActive) return b.isActive ? 1 : -1;
    return b.createdAt - a.createdAt;
  });

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
  if (!item.isActive) card.classList.add('inactive');
  if (item.targetPrice !== null && item.currentPrice !== null && item.currentPrice <= item.targetPrice) {
    card.classList.add('alert');
  }

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

  card.innerHTML = `
    <div class="card-header">
      <span class="card-name" title="${escapeHtml(item.name)}" data-url="${escapeHtml(item.url)}">${escapeHtml(item.name)}</span>
      <div class="card-actions">
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
    </div>
    <div class="card-sparkline"><canvas data-item-id="${item.id}"></canvas></div>
    <div class="card-meta">
      <span>${domain}</span>
      <span>Checked ${lastChecked}</span>
    </div>
  `;

  // Event listeners for card actions
  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleCardAction);
  });

  // Click product name to open URL
  card.querySelector('.card-name').addEventListener('click', () => {
    chrome.tabs.create({ url: item.url });
  });

  // Draw sparkline after append
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
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';

  for (let i = 0; i < prices.length; i++) {
    const x = (i / (prices.length - 1)) * (w - padding * 2) + padding;
    const y = h - padding - ((prices[i] - min) / range) * (h - padding * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Fill area under line
  ctx.lineTo(w - padding, h - padding);
  ctx.lineTo(padding, h - padding);
  ctx.closePath();
  ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
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
        await loadItems();
      }
      break;
    case 'edit':
      await openEditModal(id);
      break;
    case 'check':
      btn.style.animation = 'spin 0.5s linear';
      chrome.runtime.sendMessage({ type: 'CHECK_ITEM', itemId: id }, () => {
        setTimeout(() => loadItems(), 2000);
      });
      break;
  }
}

async function openEditModal(id) {
  const item = await getItem(id);
  if (!item) return;

  editId.value = item.id;
  editName.value = item.name;
  editSelector.value = item.selector;
  editTargetPrice.value = item.targetPrice || '';
  editAlertCondition.value = item.alertCondition || 'below_target';
  editPercentThreshold.value = item.percentThreshold || '';
  editPercentThresholdGroup.classList.toggle('hidden', item.alertCondition !== 'percent_drop');
  editInterval.value = item.checkIntervalMinutes || '';

  editModal.classList.remove('hidden');
}

async function saveEditItem() {
  const id = editId.value;
  const updates = {
    name: editName.value.trim(),
    selector: editSelector.value.trim(),
    targetPrice: editTargetPrice.value ? parseFloat(editTargetPrice.value) : null,
    alertCondition: editAlertCondition.value,
    percentThreshold: editPercentThreshold.value ? parseInt(editPercentThreshold.value) : null,
    checkIntervalMinutes: editInterval.value ? parseInt(editInterval.value) : null
  };

  await updateItem(id, updates);
  editModal.classList.add('hidden');
  await loadItems();
}

// --- Tracking Flow ---
async function startTracking() {
  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  inputUrl.value = tab.url;
  inputName.value = tab.title || '';

  // Inject element picker into the page
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
    // Fall back to showing form with manual input
    showAddForm();
    return;
  }

  // Listen for picker result
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

  // Close popup so user can interact with page
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
  inputCurrentPrice.value = '';
  inputTargetPrice.value = '';
  inputAlertCondition.value = 'below_target';
  inputPercentThreshold.value = '';
  inputInterval.value = '';
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

  const item = await addItem({
    url,
    name: inputName.value.trim() || 'Untitled',
    selector,
    currentPrice,
    targetPrice: inputTargetPrice.value ? parseFloat(inputTargetPrice.value) : null,
    alertCondition: inputAlertCondition.value,
    percentThreshold: inputPercentThreshold.value ? parseInt(inputPercentThreshold.value) : null,
    checkIntervalMinutes: inputInterval.value ? parseInt(inputInterval.value) : null
  });

  // Notify background to set up alarm
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
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Listen for messages from background (e.g., after picker result comes in while popup is open)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ELEMENT_PICKED') {
    inputSelector.value = msg.selector;
    inputCurrentPrice.value = msg.text;
    showAddForm();
  } else if (msg.type === 'PRICES_UPDATED') {
    loadItems();
  }
});
