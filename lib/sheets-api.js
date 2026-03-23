// sheets-api.js — Google Sheets OAuth2 + API integration

import { getSettings, saveSettings } from './storage.js';
import { getAuthToken, refreshAuthToken } from './auth.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export async function connectGoogleAccount() {
  const token = await getAuthToken(true);
  if (!token) throw new Error('Failed to authenticate');

  const settings = await getSettings();
  if (settings.spreadsheetId) {
    try {
      await fetchSheets(`${SHEETS_API}/${settings.spreadsheetId}`, token);
      return settings.spreadsheetId;
    } catch {
      // Spreadsheet deleted, create new one
    }
  }

  const spreadsheetId = await createSpreadsheet(token);
  await saveSettings({ spreadsheetId, sheetsEnabled: true });
  return spreadsheetId;
}

export async function disconnectGoogleAccount() {
  const token = await getAuthToken(false).catch(() => null);
  if (token) {
    chrome.identity.removeCachedAuthToken({ token });
  }
  await saveSettings({ sheetsEnabled: false, spreadsheetId: '' });
}

async function createSpreadsheet(token) {
  const body = {
    properties: { title: 'Site Price Monitor' },
    sheets: [
      { properties: { title: 'Tracked Items', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Price History', gridProperties: { frozenRowCount: 1 } } }
    ]
  };

  const resp = await fetchSheets(SHEETS_API, token, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  const spreadsheet = await resp.json();
  const spreadsheetId = spreadsheet.spreadsheetId;

  await fetchSheets(
    `${SHEETS_API}/${spreadsheetId}/values/Tracked Items!A1:H1?valueInputOption=RAW`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [['ID', 'Product Name', 'URL', 'CSS Selector', 'Current Price', 'Target Price', 'Alert Condition', 'Last Checked']]
      })
    }
  );

  await fetchSheets(
    `${SHEETS_API}/${spreadsheetId}/values/Price History!A1:E1?valueInputOption=RAW`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [['Item ID', 'Product Name', 'Price', 'Timestamp', 'URL']]
      })
    }
  );

  return spreadsheetId;
}

export async function syncTrackedItems(items) {
  const settings = await getSettings();
  if (!settings.sheetsEnabled || !settings.spreadsheetId) return;

  const token = await getAuthToken(false).catch(() => null);
  if (!token) return;

  const rows = Object.values(items).map(item => [
    item.id, item.name, item.url, item.selector,
    item.currentPrice !== null ? item.currentPrice : '',
    item.targetPrice !== null ? item.targetPrice : '',
    item.alertCondition,
    item.lastChecked ? new Date(item.lastChecked).toISOString() : ''
  ]);

  try {
    await fetchSheets(
      `${SHEETS_API}/${settings.spreadsheetId}/values/Tracked Items!A2:H?clear`,
      token, { method: 'POST', body: '{}' }
    );

    if (rows.length > 0) {
      await fetchSheets(
        `${SHEETS_API}/${settings.spreadsheetId}/values/Tracked Items!A2:H?valueInputOption=RAW`,
        token,
        { method: 'PUT', body: JSON.stringify({ values: rows }) }
      );
    }
  } catch (err) {
    console.error('Error syncing tracked items to Sheets:', err);
  }
}

export async function syncPriceToSheets(item, price) {
  const settings = await getSettings();
  if (!settings.sheetsEnabled || !settings.spreadsheetId) return;

  const token = await getAuthToken(false).catch(() => null);
  if (!token) return;

  try {
    await fetchSheets(
      `${SHEETS_API}/${settings.spreadsheetId}/values/Price History!A:E:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          values: [[item.id, item.name, price, new Date().toISOString(), item.url]]
        })
      }
    );
  } catch (err) {
    console.error('Error appending price to Sheets:', err);
  }
}

export function getSpreadsheetUrl(spreadsheetId) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

// --- Fetch with automatic token refresh on 401 ---
async function fetchSheets(url, token, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  // If 401, try refreshing the token and retry once
  if (resp.status === 401) {
    const newToken = await refreshAuthToken(token);
    if (!newToken) {
      // Token refresh failed — mark Sheets as disconnected
      await saveSettings({ sheetsEnabled: false });
      throw new Error('Google authentication expired. Please reconnect in settings.');
    }

    const retryResp = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${newToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    if (!retryResp.ok) {
      const error = await retryResp.text();
      throw new Error(`Sheets API error (${retryResp.status}): ${error}`);
    }

    return retryResp;
  }

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Sheets API error (${resp.status}): ${error}`);
  }

  return resp;
}
