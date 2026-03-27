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
       total_amount, ticket_quantity, category, row_seat)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
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
  );
  return result.lastInsertRowid;
}

// ── StubHub parser ─────────────────────────────────────────────────────────────
// Subject: "You sold your ticket for {game_name}"
function parseStubHub(subject, body) {
  try {
    // Game name from subject
    const gameMatch = subject.match(/You sold your (?:ticket|tickets) for (.+)/i);
    const game_name = gameMatch ? gameMatch[1].trim() : null;

    // Order number
    const orderMatch = body.match(/Order\s*#?\s*:?\s*(\d{6,12})/i);
    const order_number = orderMatch ? orderMatch[1] : null;

    // Buyer name
    const buyerMatch = body.match(/(?:Buyer|Sold to)[:\s]+([A-Za-zÀ-ÿ'\- ]{2,40})(?:\s*[\n\r(]|$)/im);
    const buyer_name = buyerMatch ? buyerMatch[1].trim() : null;

    // Buyer email
    const emailMatch = body.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
    const buyer_email = emailMatch ? emailMatch[1] : null;

    // Ticket quantity + category + row/seat
    // "2 × Longside Lower, Row SPURS, General Admission"
    const ticketMatch = body.match(/(\d+)\s*[×x]\s*([^,\n]+),?\s*([^\n€£$]*)/i);
    const ticket_quantity = ticketMatch ? parseInt(ticketMatch[1]) : 1;
    const category        = ticketMatch ? ticketMatch[2].trim() : null;
    const row_seat        = ticketMatch ? ticketMatch[3].trim() : null;

    // Amount (€ or other currency)
    const amountMatch = body.match(/[€£$]\s*(\d[\d,]*\.?\d{0,2})/);
    const total_amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;

    return {
      game_name, order_number, buyer_name, buyer_email,
      ticket_quantity, category, row_seat, total_amount,
      sales_channel: 'StubHub',
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
async function checkEmailsAndImport() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    console.log('[Gmail] Skipping — GOOGLE credentials not configured');
    return { checked: 0, imported: 0, skipped: 0, errors: [] };
  }

  const auth   = getOAuth2Client();
  const gmail  = google.gmail({ version: 'v1', auth });
  const stats  = { checked: 0, imported: 0, skipped: 0, errors: [] };

  try {
    // Search for relevant unread emails
    const queries = [
      'from:stubhub subject:"You sold your ticket" is:unread',
      'from:footballticketnet is:unread',
      'from:noreply@stubhub.com is:unread',
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
    return stats;
  } catch (e) {
    console.error('[Gmail] Fatal error:', e.message);
    stats.errors.push(e.message);
    return stats;
  }
}

module.exports = { checkEmailsAndImport };
