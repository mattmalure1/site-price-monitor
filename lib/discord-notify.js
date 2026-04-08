// discord-notify.js — Send notifications via Discord webhook

export async function sendDiscordNotification(webhookUrl, item, newPrice, oldPrice) {
  if (!webhookUrl) return;

  const priceChange = oldPrice !== null ? `$${oldPrice.toFixed(2)} -> $${newPrice.toFixed(2)}` : `$${newPrice.toFixed(2)}`;
  const color = (oldPrice !== null && newPrice < oldPrice) ? 3066993 : 15158332; // green or red

  const embed = {
    title: `Price Alert: ${item.name}`,
    url: item.url,
    color: color,
    fields: [
      { name: 'Current Price', value: `$${newPrice.toFixed(2)}`, inline: true },
      { name: 'Target Price', value: item.targetPrice !== null ? `$${item.targetPrice.toFixed(2)}` : 'None', inline: true },
      { name: 'Change', value: priceChange, inline: true },
      { name: 'Website', value: getDomain(item.url), inline: true }
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Site Price Monitor' }
  };

  if (item.targetPrice !== null && newPrice <= item.targetPrice) {
    embed.description = '**TARGET PRICE REACHED!** Time to buy!';
    embed.color = 16776960; // gold
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Price Monitor', embeds: [embed] })
    });
    if (!response.ok) {
      console.error('Discord webhook failed:', response.status);
    }
  } catch (err) {
    console.error('Discord notification error:', err);
  }
}

/**
 * Send a digest of multiple alerts as a single Discord message.
 */
export async function sendDiscordDigest(webhookUrl, alerts) {
  if (!webhookUrl || alerts.length === 0) return;

  const embeds = alerts.slice(0, 10).map(({ item, newPrice, oldPrice }) => {
    const isTargetHit = item.targetPrice !== null && newPrice <= item.targetPrice;
    return {
      title: item.name,
      url: item.url,
      color: isTargetHit ? 16776960 : (oldPrice !== null && newPrice < oldPrice ? 3066993 : 15158332),
      description: isTargetHit ? '**TARGET REACHED!**' : undefined,
      fields: [
        { name: 'Price', value: `$${newPrice.toFixed(2)}`, inline: true },
        { name: 'Was', value: oldPrice !== null ? `$${oldPrice.toFixed(2)}` : 'N/A', inline: true },
        { name: 'Target', value: item.targetPrice !== null ? `$${item.targetPrice.toFixed(2)}` : 'None', inline: true }
      ]
    };
  });

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Price Monitor',
        content: `**Price Alert Digest** — ${alerts.length} item${alerts.length > 1 ? 's' : ''}`,
        embeds
      })
    });
    if (!response.ok) {
      console.error('Discord digest failed:', response.status);
    }
  } catch (err) {
    console.error('Discord digest error:', err);
  }
}

export async function testDiscordWebhook(webhookUrl) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Price Monitor',
        embeds: [{
          title: 'Test Notification',
          description: 'Site Price Monitor is connected successfully!',
          color: 3066993,
          timestamp: new Date().toISOString(),
          footer: { text: 'Site Price Monitor' }
        }]
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}
