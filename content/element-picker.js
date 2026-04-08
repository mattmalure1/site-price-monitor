// element-picker.js — Visual element picker injected into the active tab
// Allows user to hover and click on any element to capture its CSS selector and text

(function() {
  // Prevent double-injection
  if (window.__spm_picker_active) return;
  window.__spm_picker_active = true;

  let overlay = null;
  let tooltip = null;
  let banner = null;
  let currentElement = null;
  let lockedElement = null;

  function init() {
    createBanner();
    createOverlay();
    createTooltip();
    document.body.classList.add('__spm-picking');
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function createBanner() {
    banner = document.createElement('div');
    banner.id = 'spm-banner';
    banner.innerHTML = `
      <span>Site Price Monitor — Click a price element to track it. Press <kbd>Escape</kbd> to cancel.</span>
    `;
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483647;
      background: #1e293b;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      padding: 10px 20px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    `;
    // Style the kbd element
    const style = document.createElement('style');
    style.textContent = `
      #spm-banner kbd {
        background: #334155;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 11px;
        border: 1px solid #475569;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(banner);
  }

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'spm-overlay';
    overlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      border: 2px solid #2563eb;
      background: rgba(37, 99, 235, 0.1);
      z-index: 2147483646;
      transition: all 0.1s ease;
      border-radius: 3px;
      display: none;
    `;
    document.body.appendChild(overlay);
  }

  function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.id = 'spm-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      background: #1e293b;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      pointer-events: none;
      max-width: 350px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: none;
      line-height: 1.4;
    `;
    document.body.appendChild(tooltip);
  }

  function onMouseMove(e) {
    if (lockedElement) return; // Don't update while locked

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === tooltip || el === banner ||
        el.id === 'spm-overlay' || el.id === 'spm-tooltip' || el.id === 'spm-banner' ||
        el.closest('#spm-banner')) return;

    currentElement = el;
    const rect = el.getBoundingClientRect();

    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    const text = el.textContent.trim().slice(0, 60);
    const selector = generateSelector(el);
    tooltip.innerHTML = `
      <div style="font-weight:600;margin-bottom:2px;">${escapeHtml(text)}</div>
      <div style="color:#94a3b8;font-size:11px;font-family:monospace;">${escapeHtml(selector)}</div>
    `;
    tooltip.style.display = 'block';

    // Position tooltip below cursor
    let tooltipX = e.clientX + 10;
    let tooltipY = e.clientY + 20;
    if (tooltipX + 350 > window.innerWidth) tooltipX = window.innerWidth - 360;
    if (tooltipY + 50 > window.innerHeight) tooltipY = e.clientY - 55;
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (!currentElement) return;

    if (lockedElement) {
      // Already locked — clicking again unlocks (re-pick mode)
      lockedElement = null;
      overlay.style.borderColor = '#2563eb';
      overlay.style.background = 'rgba(37, 99, 235, 0.1)';
      banner.querySelector('span').innerHTML = 'Click a price element to track it. Press <kbd>Escape</kbd> to cancel.';
      return;
    }

    // Lock this element
    lockedElement = currentElement;
    overlay.style.borderColor = '#16a34a';
    overlay.style.background = 'rgba(22, 163, 74, 0.15)';

    const selector = generateSelector(lockedElement);
    const text = lockedElement.textContent.trim();

    // Update banner to show confirmation
    banner.querySelector('span').innerHTML = `
      Selected: <strong>"${escapeHtml(text.slice(0, 30))}"</strong> —
      Click again to re-pick, or press <kbd>Enter</kbd> to confirm, <kbd>Escape</kbd> to cancel.
    `;

    // Store for Enter key confirmation
    lockedElement.__spm_selector = selector;
    lockedElement.__spm_text = text;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (lockedElement) {
        // Unlock and go back to picking
        lockedElement = null;
        overlay.style.borderColor = '#2563eb';
        overlay.style.background = 'rgba(37, 99, 235, 0.1)';
        banner.querySelector('span').innerHTML = 'Click a price element to track it. Press <kbd>Escape</kbd> to cancel.';
      } else {
        chrome.runtime.sendMessage({ type: 'PICKER_CANCELLED' });
        cleanup();
      }
    } else if (e.key === 'Enter' && lockedElement) {
      // Confirm selection
      chrome.runtime.sendMessage({
        type: 'ELEMENT_PICKED',
        selector: lockedElement.__spm_selector,
        text: lockedElement.__spm_text,
        url: window.location.href
      });
      cleanup();
    }
  }

  function cleanup() {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.body.classList.remove('__spm-picking');
    if (overlay) overlay.remove();
    if (tooltip) tooltip.remove();
    if (banner) banner.remove();
    window.__spm_picker_active = false;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function generateSelector(el) {
    // Try ID first
    if (el.id) {
      return '#' + CSS.escape(el.id);
    }

    // Build a specific selector using tag, classes, and nth-child
    const parts = [];
    let current = el;

    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = '#' + CSS.escape(current.id);
        parts.unshift(selector);
        break;
      }

      // Add meaningful classes (skip dynamic/generated ones)
      const classes = Array.from(current.classList).filter(c => {
        return c.length > 1 && !/^[a-z]{1,2}\d|^_|^css-|^jsx-|^sc-|^__/.test(c);
      });

      if (classes.length > 0) {
        selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }

      // Add nth-child if needed for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(s => s.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      parts.unshift(selector);
      current = current.parentElement;

      // Stop if we have enough specificity (4 levels)
      if (parts.length >= 4) break;
    }

    const fullSelector = parts.join(' > ');

    // Verify the selector uniquely matches the element
    try {
      const matches = document.querySelectorAll(fullSelector);
      if (matches.length === 1 && matches[0] === el) {
        return fullSelector;
      }
    } catch {
      // Invalid selector, fall through
    }

    // Fallback: use full path
    return getFullPath(el);
  }

  function getFullPath(el) {
    const path = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        path.unshift('#' + CSS.escape(current.id));
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const index = Array.from(parent.children).indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  init();
})();
