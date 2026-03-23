// price-parser.js — Shared price text normalization and parsing

/**
 * Parse raw price text into a number.
 * Handles currency symbols, thousands separators, European formats,
 * price ranges (takes first value), and "Free"/"Out of stock" states.
 *
 * @param {string} text - Raw price text (e.g. "$1,299.99", "EUR 29,90", "$12.99 - $19.99")
 * @returns {number|null} Parsed price or null if unparseable
 */
export function parsePrice(text) {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim().toLowerCase();

  // Handle special states
  if (trimmed === 'free' || trimmed === '$0' || trimmed === '$0.00') return 0;
  if (/out of stock|unavailable|sold out|coming soon/i.test(trimmed)) return null;

  // If it's a range like "$10.99 - $19.99", take the first price
  const rangeParts = text.split(/\s*[-–—]\s*\$/);
  const priceText = rangeParts[0];

  // Remove currency symbols, spaces, and non-numeric chars (keep digits, dots, commas)
  const cleaned = priceText.replace(/[^0-9.,]/g, '');
  if (!cleaned) return null;

  let normalized;
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // Both present — determine which is the decimal separator
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastDot > lastComma) {
      // Format: 1,299.99 (US) or 1.299,99 won't hit this since comma is last
      normalized = cleaned.replace(/,/g, '');
    } else {
      // Format: 1.299,99 (European)
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts[parts.length - 1].length <= 2) {
      // Likely decimal comma (European format: 29,99 or 1299,90)
      normalized = cleaned.replace(/,/g, '.');
      // If there were multiple commas (shouldn't happen), just take the last as decimal
      const dotParts = normalized.split('.');
      if (dotParts.length > 2) {
        normalized = dotParts.slice(0, -1).join('') + '.' + dotParts[dotParts.length - 1];
      }
    } else {
      // Likely thousands separator (1,299 or 12,345,678)
      normalized = cleaned.replace(/,/g, '');
    }
  } else {
    normalized = cleaned;
  }

  const price = parseFloat(normalized);
  if (isNaN(price) || price < 0) return null;

  // Sanity check: reject absurdly large values (likely parsing error)
  if (price > 99999999) return null;

  return Math.round(price * 100) / 100; // Round to 2 decimal places
}
