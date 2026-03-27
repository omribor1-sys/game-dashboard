'use strict';

const { google } = require('googleapis');
const db = require('../database');

// ── OAuth2 client ─────────────────────────────────────────────────────────────
function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getHeader(headers, name) {
  const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function decodeBody(part) {
  if (!part) return '';
  if (part.body && part.body.data) {
    return Buffer.from(part.body.data, 'base64').toString('utf-8');
  }
  if (part.parts) {
    for (const p of part.parts) {
      const text = decodeBody(p);
      if (text) return text;
    }
  }
  return '';
}

function getPlainText(payload) {
  // Prefer text/plain, fall back to text/html (strip tags)
  function findPart(part, mime) {
    if (part.mimeType === mime) return part;
    if (part.parts) {
      for (const p of part.parts) {
        const found = findPart(p, mime);
        if (found) return found;
      }
    }
    return null;
  }
  const plain = findPart(payload, 'text/plain');
  if (plain) return decodeBody(plain);
  const html = findPart(payload, 'text/html');
  if (html) return decodeBody(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return decodeBody(payload);
}

function orderExists(orderNumber) {
  if (!orderNumber) return false;
  const row = db.prepare('SELECT id FROM orders WHERE order_number = ?').get(String(orderNumber));
  return !!row;
}

function insertOrder(data) {
  const result = db.prepare(`
    INSERT INTO orders
      (buyer_name, buyer_email, buyer_phone, status, notes,
       game_name, order_number, sales_channel,
       total_amount, ticket_quantity, category, row_seat, game_datetime)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    data.buyer_name    || null,
    data.buyer_email   || null,
    null,
    'Confirmed',
    data.notes         || null,
    data.game_name     || null,
    data.order_number  || null,
    data.sales_channel || null,
    data.total_amount  || 0,
    data.ticket_quantity || 1,
    data.category      || null,
    data.row_seat      || null,
    data.game_datetime || null,
  );
  return result.lastInsertRowid;
}

// ── StubHub parser ─────────────────────────────────────────────────────────────
// Subject: "You sold your ticket for {game_name} Tickets - Order# 123456789"
// Body:
//   OrderID #286956987
//   2 ticket(s)
//   Longside Lower 031
//   Row oneseatgap | Seat(s) 822,824
//   Sun, 19/04/2026, 16:30 Europe/London
//   Payment Total  €612.48
function parseStubHub(subject, body) {
  try {
    // Game name base — from subject, strip " Tickets" suffix
    const gameMatch = subject.match(/You sold your (?:ticket|tickets) for (.+?)(?:\s+Tickets\b|\s+-\s+Order|$)/i);
    const game_name_base = gameMatch ? gameMatch[1].trim() : null;

    // Game datetime — "Sun, 19/04/2026, 16:30 Europe/London"
    // Format: DayName, DD/MM/YYYY, HH:MM
    const dtMatch = body.match(/(\w{2,3}),\s+(\d{1,2})\/(\d{1,2})\/(\d{4}),\s+(\d{1,2}:\d{2})/);
    let game_date = null;
    let game_datetime = null; // stored string: "Sun, 19/04/2026, 16:30"
    if (dtMatch) {
      const [, dayName, dd, mm, yyyy, hhmm] = dtMatch;
      game_datetime = `${dayName}, ${dd}/${mm}/${yyyy}, ${hhmm}`;
      // Parse to Date (month is 0-indexed)
      const [hh, min] = hhmm.split(':').map(Number);
      game_date = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), hh, min);
    }

    // Combine game name + datetime
    const game_name = game_name_base && game_datetime
      ? `${game_name_base} | ${game_datetime}`
      : game_name_base;

    // Order number — body: "OrderID #286956987", fallback: subject "Order# XXXXXXX"
    const orderMatch = body.match(/OrderID\s*#\s*(\d{6,12})/i)
      || subject.match(/Order#\s*(\d{6,12})/i);
    const order_number = orderMatch ? orderMatch[1] : null;

    // Ticket quantity — "2 ticket(s)"
    const qtyMatch = body.match(/(\d+)\s*ticket\(s\)/i);
    const ticket_quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;

    // Category — line like "Longside Lower 031" or "Shortside Lower" (contains Lower/Upper/Side/etc.)
    const categoryMatch = body.match(/^([A-Za-z][A-Za-z0-9\s]*(Lower|Upper|Side|Stand|Block|Tier|Level|End|Corner)[A-Za-z0-9\s]*)$/im);
    const category = categoryMatch ? categoryMatch[1].trim() : null;

    // Row and seats — "Row oneseatgap | Seat(s) 822,824"
    const rowMatch = body.match(/Row\s+([^|\n]+)\s*\|\s*Seat\(s\)\s*([^\n\r]+)/i);
    const row_seat = rowMatch
      ? `Row ${rowMatch[1].trim()} | Seat(s) ${rowMatch[2].trim()}`
      : null;

    // Payment Total — "Payment Total   €612.48"
    const amountMatch = body.match(/Payment Total[\s\t]+[€£$]\s*([\d,]+\.?\d{0,2})/i);
    const total_amount = amountMatch
      ? parseFloat(amountMatch[1].replace(/,/g, ''))
      : 0;

    // Buyer name — all-caps full name on its own line (e.g. "EVEN CIENFUEGOS")
    const buyerMatch = body.match(/^([A-Z][A-Z' \-]{2,40})$/m);
    const buyer_name = buyerMatch ? buyerMatch[1].trim() : null;

    // Buyer email
    const emailMatch = body.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
    const buyer_email = emailMatch ? emailMatch[1] : null;

    return {
      game_name, order_number, buyer_name, buyer_email,
      ticket_quantity, category, row_seat, total_amount,
      sales_channel: 'StubHub',
      game_date,
      game_datetime,
    };
  } catch (e) {
    console.error('[StubHub parser error]', e.message);
    return null;
  }
}

// ── FootballTicketNet parser ───────────────────────────────────────────────────
function parseFootballTicketNet(subject, body) {
  try {
    // Order number
    const orderMatch = body.match(/Order\s*#?\s*:?\s*(\d{5,10})/i)
      || subject.match(/(\d{5,10})/);
    const order_number = orderMatch ? orderMatch[1] : null;

    // Game name — look for "vs" pattern
    const gameMatch = body.match(/([A-Za-z\s]+(?:FC|United|City|Athletic|Hotspur|Liverpool|Arsenal|Chelsea|Madrid|Barça|Barcelona)?)\s+vs\.?\s+([A-Za-z\s]+(?:FC|United|City|Athletic|Hotspur|Liverpool|Arsenal|Chelsea|Madrid|Barça|Barcelona)?)/i);
    const game_name = gameMatch ? gameMatch[0].trim() : null;

    // Buyer name
    const buyerMatch = body.match(/(?:Name|Customer|Buyer)[:\s]+([A-Za-zÀ-ÿ'\- ]{2,40})(?:\s*[\n\r]|$)/im);
    const buyer_name = buyerMatch ? buyerMatch[1].trim() : null;

    // Ticket quantity + category + row/seat
    const ticketMatch = body.match(/(\d+)\s*[×x×]\s*([^\n,]+(?:Level|Lower|Upper|Stand|Block|Tier)[^\n,]*)/i)
      || body.match(/(\d+)\s*[×x×]\s*([^,\n]+)/i);
    const ticket_quantity = ticketMatch ? parseInt(ticketMatch[1]) : 1;
    const category        = ticketMatch ? ticketMatch[2].trim() : null;

    // Block/row info
    const blockMatch = body.match(/Block\s+([A-Z0-9]+)/i);
    const row_seat = blockMatch ? `Block ${blockMatch[1]}` : null;

    // Amount (GBP or EUR)
    const amountMatch = body.match(/(?:GBP|£|€)\s*(\d[\d,]*\.?\d{0,2})/i);
    const total_amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;

    return {
      game_name, order_number, buyer_name, buyer_email: null,
      ticket_quantity, category, row_seat, total_amount,
      sales_channel: 'FootballTicketNet',
    };
  } catch (e) {
    console.error('[FootballTicketNet parser error]', e.message);
    return null;
  }
}

// ── Main importer ─────────────────────────────────────────────────────────────
// options.futureOnly = true → skip orders where game date is in the past
async function checkEmailsAndImport(options = {}) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    console.log('[Gmail] Skipping — GOOGLE credentials not configured');
    return { checked: 0, imported: 0, skipped: 0, errors: [] };
  }
  const futureOnly  = !!options.futureOnly;
  const ignoreRead  = !!options.ignoreRead; // when true, search all mail not just unread
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const auth   = getOAuth2Client();
  const gmail  = google.gmail({ version: 'v1', auth });
  const stats  = { checked: 0, imported: 0, skipped: 0, errors: [] };
  const importedOrders = [];

  try {
    // Search for relevant emails (unread by default)
    const unreadFilter = ignoreRead ? '' : ' is:unread';
    const queries = [
      `from:stubhub subject:"You sold your ticket"${unreadFilter}`,
      `from:footballticketnet${unreadFilter}`,
      `from:noreply@stubhub.com${unreadFilter}`,
    ];

    const messageIds = new Set();

    for (const q of queries) {
      const r = await gmail.users.messages.list({
        userId: 'me', q, maxResults: 50,
      });
      for (const m of (r.data.messages || [])) {
        messageIds.add(m.id);
      }
    }

    console.log(`[Gmail] Found ${messageIds.size} candidate emails`);

    for (const msgId of messageIds) {
      try {
        stats.checked++;
        const msg = await gmail.users.messages.get({
          userId: 'me', id: msgId, format: 'full',
        });

        const headers = msg.data.payload.headers;
        const subject = getHeader(headers, 'subject');
        const from    = getHeader(headers, 'from').toLowerCase();
        const body    = getPlainText(msg.data.payload);

        let parsed = null;
        if (from.includes('stubhub')) {
          parsed = parseStubHub(subject, body);
        } else if (from.includes('footballticketnet') || from.includes('football-ticket-net')) {
          parsed = parseFootballTicketNet(subject, body);
        }

        if (!parsed) {
          stats.skipped++;
          continue;
        }

        // Future-only filter: skip past games (if date could be parsed and it's before today)
        if (futureOnly && parsed.game_date instanceof Date && !isNaN(parsed.game_date)) {
          const gd = new Date(parsed.game_date); gd.setHours(0, 0, 0, 0);
          if (gd < today) {
            console.log(`[Gmail] Skipping past game: ${parsed.game_name} (${parsed.game_date.toDateString()})`);
            stats.skipped++;
            // Still mark as read so we don't reprocess
            await gmail.users.messages.modify({
              userId: 'me', id: msgId,
              requestBody: { removeLabelIds: ['UNREAD'] },
            });
            continue;
          }
        }

        if (!parsed.order_number) {
          stats.errors.push(`No order number found in email: ${subject}`);
          stats.skipped++;
          continue;
        }

        if (orderExists(parsed.order_number)) {
          console.log(`[Gmail] Order ${parsed.order_number} already exists — skip`);
          stats.skipped++;
        } else {
          const newId = insertOrder(parsed);
          console.log(`[Gmail] Imported order ${parsed.order_number} → id=${newId}`);
          stats.imported++;
          importedOrders.push(parsed);
        }

        // Mark email as read
        await gmail.users.messages.modify({
          userId: 'me', id: msgId,
          requestBody: { removeLabelIds: ['UNREAD'] },
        });
      } catch (e) {
        console.error('[Gmail] Error processing message:', e.message);
        stats.errors.push(e.message);
      }
    }

    console.log(`[Gmail] Done: checked=${stats.checked}, imported=${stats.imported}, skipped=${stats.skipped}`);
    return { stats, importedOrders };
  } catch (e) {
    console.error('[Gmail] Fatal error:', e.message);
    stats.errors.push(e.message);
    return { stats, importedOrders };
  }
}

// ── Summary email ──────────────────────────────────────────────────────────────
async function sendSummaryEmail(auth, stats, importedOrders) {
  if (stats.imported === 0) return; // nothing to report
  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

    let bodyText = `GameYield — Daily Import Summary (${dateStr})\n`;
    bodyText += `${'─'.repeat(50)}\n`;
    bodyText += `Checked:  ${stats.checked}\n`;
    bodyText += `Imported: ${stats.imported}\n`;
    bodyText += `Skipped:  ${stats.skipped}\n`;
    if (stats.errors.length) bodyText += `Errors:   ${stats.errors.length}\n`;
    bodyText += `\nNew Orders:\n${'─'.repeat(50)}\n`;

    for (const o of importedOrders) {
      bodyText += `\n🎟  ${o.game_name || '—'}\n`;
      bodyText += `   Order #${o.order_number}  |  ${o.ticket_quantity} ticket(s)  |  €${o.total_amount}\n`;
      if (o.category) bodyText += `   ${o.category}`;
      if (o.row_seat) bodyText += `  |  ${o.row_seat}`;
      if (o.category || o.row_seat) bodyText += '\n';
      if (o.buyer_name)  bodyText += `   Buyer: ${o.buyer_name}`;
      if (o.buyer_email) bodyText += ` <${o.buyer_email}>`;
      if (o.buyer_name || o.buyer_email) bodyText += '\n';
    }

    const subject = `[GameYield] ${stats.imported} new order(s) imported — ${dateStr}`;
    const rawMessage = [
      `To: omribor1@gmail.com`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      `MIME-Version: 1.0`,
      ``,
      bodyText,
    ].join('\r\n');

    const encoded = Buffer.from(rawMessage).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });
    console.log(`[Gmail] Summary email sent — ${stats.imported} order(s)`);
  } catch (e) {
    console.error('[Gmail] Failed to send summary email:', e.message);
  }
}

module.exports = { checkEmailsAndImport, sendSummaryEmail };
