// gmail-notify.js — Send email notifications via Gmail API

export async function sendGmailNotification(item, newPrice, oldPrice) {
  try {
    const token = await getAuthToken();
    if (!token) return;

    // Get user's email
    const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const profile = await profileResp.json();
    const email = profile.email;
    if (!email) return;

    const subject = `Price Alert: ${item.name} - $${newPrice.toFixed(2)}`;
    const priceChange = oldPrice !== null
      ? `Price changed from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)}`
      : `Current price: $${newPrice.toFixed(2)}`;

    const targetInfo = item.targetPrice !== null
      ? `Target price: $${item.targetPrice.toFixed(2)}\n${newPrice <= item.targetPrice ? 'TARGET PRICE REACHED! Time to buy!' : ''}`
      : '';

    const body = [
      `Price Alert for ${item.name}`,
      '',
      priceChange,
      targetInfo,
      '',
      `Product URL: ${item.url}`,
      '',
      '---',
      'Sent by Site Price Monitor'
    ].join('\n');

    const rawMessage = createRawEmail(email, email, subject, body);

    const resp = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: rawMessage })
    });

    if (!resp.ok) {
      console.error('Gmail send failed:', resp.status);
    }
  } catch (err) {
    console.error('Gmail notification error:', err);
  }
}

function createRawEmail(from, to, subject, body) {
  const email = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ].join('\r\n');

  return btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
}
