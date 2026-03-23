// sheets-api.js — Google Sheets OAuth2 + API integration

import { getSettings, saveSettings } from './storage.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

export async function connectGoogleAccount() {
  const token = await getAuthToken(true);
  if (!token) throw new Error('Failed to authenticate');

  // Check if spreadsheet already exists
  const settings = await getSettings();
  if (settings.spreadsheetId) {
    // Verify it still exists
    try {
      await fetchSheets(`${SHEETS_API}/${settings.spreadsheetId}`, token);
      return settings.spreadsheetId;
    } catch {
      // Spreadsheet deleted, create new one
    }
  }

  // Create new spreadsheet
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
    properties: {
      title: 'Site Price Monitor'
    },
    sheets: [
      {
        properties: {
          title: 'Tracked Items',
          gridProperties: { frozenRowCount: 1 }
        }
      },
      {
        properties: {
          title: 'Price History',
          gridProperties: { frozenRowCount: 1 }
        }
      }
    ]
  };

  const resp = await fetchSheets(SHEETS_API, token, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  const spreadsheet = await resp.json();
  const spreadsheetId = spreadsheet.spreadsheetId;

  // Set up headers
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
    item.id,
    item.name,
    item.url,
    item.selector,
    item.currentPrice !== null ? item.currentPrice : '',
    item.targetPrice !== null ? item.targetPrice : '',
    item.alertCondition,
    item.lastChecked ? new Date(item.lastChecked).toISOString() : ''
  ]);

  // Clear existing data and rewrite
  try {
    await fetchSheets(
      `${SHEETS_API}/${settings.spreadsheetId}/values/Tracked Items!A2:H?clear`,
      token,
      { method: 'POST', body: '{}' }
    );

    if (rows.length > 0) {
      await fetchSheets(
        `${SHEETS_API}/${settings.spreadsheetId}/values/Tracked Items!A2:H?valueInputOption=RAW`,
        token,
        {
          method: 'PUT',
          body: JSON.stringify({ values: rows })
        }
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
          values: [[
            item.id,
            item.name,
            price,
            new Date().toISOString(),
            item.url
          ]]
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

async function fetchSheets(url, token, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Sheets API error (${resp.status}): ${error}`);
  }

  return resp;
}
