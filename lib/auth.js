// auth.js — Shared Google OAuth2 token management

/**
 * Get a cached auth token, optionally prompting the user interactively.
 * Handles token refresh on 401 by clearing the cached token and retrying.
 *
 * @param {boolean} interactive - Whether to show the Google sign-in prompt
 * @returns {Promise<string|null>} The auth token or null
 */
export async function getAuthToken(interactive = false) {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Remove a cached token (e.g., after a 401) and get a fresh one.
 * @param {string} expiredToken - The token that failed
 * @returns {Promise<string|null>} A fresh token or null
 */
export async function refreshAuthToken(expiredToken) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token: expiredToken }, () => {
      chrome.identity.getAuthToken({ interactive: false }, (newToken) => {
        if (chrome.runtime.lastError || !newToken) {
          resolve(null);
        } else {
          resolve(newToken);
        }
      });
    });
  });
}
