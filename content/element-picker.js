// element-picker.js — Visual element picker injected into the active tab
// Allows user to hover and click on any element to capture its CSS selector and text

(function() {
  // Prevent double-injection
  if (window.__spm_picker_active) return;
  window.__spm_picker_active = true;

  let overlay = null;
  let tooltip = null;
  let currentElement = null;

  function init() {
    createOverlay();
    createTooltip();
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'spm-overlay';
    overlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      border: 2px solid #2563eb;
      background: rgba(37, 99, 235, 0.1);
      z-index: 2147483647;
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
      padding: 6px 10px;
      border-radius: 6px;
      pointer-events: none;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: none;
    `;
    document.body.appendChild(tooltip);
  }

  function onMouseMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === tooltip || el.id === 'spm-overlay' || el.id === 'spm-tooltip') return;

    currentElement = el;
    const rect = el.getBoundingClientRect();

    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    const text = el.textContent.trim().slice(0, 50);
    const selector = generateSelector(el);
    tooltip.textContent = `${text} — ${selector}`;
    tooltip.style.display = 'block';

    // Position tooltip below cursor
    let tooltipX = e.clientX + 10;
    let tooltipY = e.clientY + 20;
    if (tooltipX + 300 > window.innerWidth) tooltipX = window.innerWidth - 310;
    if (tooltipY + 30 > window.innerHeight) tooltipY = e.clientY - 35;
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (!currentElement) return;

    const selector = generateSelector(currentElement);
    const text = currentElement.textContent.trim();

    // Send result back to extension
    chrome.runtime.sendMessage({
      type: 'ELEMENT_PICKED',
      selector: selector,
      text: text,
      url: window.location.href
    });

    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      chrome.runtime.sendMessage({ type: 'PICKER_CANCELLED' });
      cleanup();
    }
  }

  function cleanup() {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    if (overlay) overlay.remove();
    if (tooltip) tooltip.remove();
    window.__spm_picker_active = false;
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
        return c.length > 1 && !/^[a-z]{1,2}\d|^_|^css-|^jsx-|^sc-/.test(c);
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

      // Stop if we have enough specificity (3 levels)
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
