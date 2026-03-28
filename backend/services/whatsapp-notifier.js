'use strict';

const https = require('https');

/**
 * Send a WhatsApp message via Twilio API
 * Requires env vars:
 *   TWILIO_ACCOUNT_SID  — your Twilio Account SID
 *   TWILIO_AUTH_TOKEN   — your Twilio Auth Token
 *   TWILIO_WHATSAPP_FROM — sender number, e.g. "whatsapp:+14155238886"
 *   TWILIO_WHATSAPP_TO   — your number,   e.g. "whatsapp:+972XXXXXXXXX"
 */
function sendWhatsApp(message) {
  return new Promise((resolve, reject) => {
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from  = process.env.TWILIO_WHATSAPP_FROM;
    const to    = process.env.TWILIO_WHATSAPP_TO;

    if (!sid || !token || !from || !to) {
      console.log('[WhatsApp] Skipping — Twilio credentials not configured');
      return resolve({ skipped: true });
    }

    const body = new URLSearchParams({ From: from, To: to, Body: message }).toString();
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');

    const options = {
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${sid}/Messages.json`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[WhatsApp] Message sent — SID: ${parsed.sid}`);
            resolve(parsed);
          } else {
            console.error(`[WhatsApp] Error ${res.statusCode}:`, parsed.message || data);
            reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Build and send a WhatsApp summary message after email import.
 * Called after checkEmailsAndImport() completes.
 */
async function sendWhatsAppSummary(stats, importedOrders) {
  if (!importedOrders || importedOrders.length === 0) return;

  const now = new Date();
  const futureOrders = importedOrders.filter(o =>
    o.game_date instanceof Date && !isNaN(o.game_date) && o.game_date > now
  );
  const nodateOrders = importedOrders.filter(o => !o.game_date || isNaN(o.game_date));

  if (futureOrders.length === 0 && nodateOrders.length === 0) return;

  const dd   = String(now.getDate()).padStart(2, '0');
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();

  let msg = `🎟️ *GameYield – ${dd}/${mm}/${yyyy}*\n`;
  msg += `${futureOrders.length} new order(s) imported\n`;
  msg += `─────────────────────\n`;

  for (const o of futureOrders) {
    msg += `\n*${o.game_name || 'Unknown Game'}*\n`;
    msg += `  Order #${o.order_number} | ${o.ticket_quantity} ticket(s)`;
    if (o.total_amount) msg += ` | €${o.total_amount.toFixed(2)}`;
    msg += `\n`;
    if (o.category)   msg += `  📍 ${o.category}\n`;
    if (o.row_seat)   msg += `  💺 ${o.row_seat}\n`;
    if (o.buyer_name) msg += `  👤 ${o.buyer_name}\n`;
    msg += `  📡 ${o.sales_channel}\n`;
  }

  if (nodateOrders.length > 0) {
    msg += `\n⚠️ *NEEDS ATTENTION* – No date (${nodateOrders.length}):\n`;
    for (const o of nodateOrders) {
      msg += `  • [${o.sales_channel}] #${o.order_number} – ${o.game_name || 'No Game'}\n`;
    }
  }

  try {
    await sendWhatsApp(msg);
  } catch (e) {
    console.error('[WhatsApp] Failed to send summary:', e.message);
  }
}

module.exports = { sendWhatsApp, sendWhatsAppSummary };
