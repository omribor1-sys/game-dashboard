'use strict';

const { google } = require('googleapis');
const db = require('../database');
const { normalizeGameName } = require('../utils/normalize');

// How many days before the watermark to re-scan on every run. Covers cron misses,
// late-arriving mail, and anything the previous run's query didn't see.
const LOOKBACK_DAYS = 7;
// 100 messages/page — a backstop against a runaway loop, not an expected limit.
const MAX_PAGES_PER_QUERY = 10;

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
  // Consider both active AND soft-deleted orders as "existing" — never re-import a deleted order
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
    // Only handle sale confirmations — not purchase confirmations or other emails
    if (!subject.match(/You sold your (?:ticket|tickets)/i)) return null;

    // Game name base — from subject, strip " Tickets" suffix
    const gameMatch = subject.match(/You sold your (?:ticket|tickets) for (.+?)(?:\s+Tickets\b|\s+-\s+Order|$)/i);
    const game_name_base = gameMatch ? gameMatch[1].trim() : null;

    // Game datetime — "Sun, 19/04/2026, 16:30 Europe/London"
    // OR newer format: "Saturday, 18/04/2026, 20:00 Europe/London"
    // Must include timezone marker to avoid matching the ticket-transfer deadline date
    const dtMatch = body.match(/(\w{2,10}),\s+(\d{1,2})\/(\d{1,2})\/(\d{4}),\s+(\d{1,2}:\d{2})\s+Europe\//i)
      || body.match(/(\w{2,10}),\s+(\d{1,2})\/(\d{1,2})\/(\d{4}),\s+(\d{1,2}:\d{2})\s+\d{2}:\d{2}/i) // fallback with offset
      || body.match(/(\w{2,10}),\s+(\d{1,2})\/(\d{1,2})\/(\d{4}),\s+(\d{1,2}:\d{2})(?!\s*\n)/i); // last-resort fallback (not line-end)
    let game_date = null;
    let game_datetime = null; // stored string: "Sat, 18/04/2026, 20:00"
    const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (dtMatch) {
      const [, dayNameRaw, dd, mm, yyyy, hhmm] = dtMatch;
      // Parse the date to get correct day abbreviation (normalise full names like "Saturday" → "Sat")
      const parsedForDay = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
      const dayName = DAY_ABBR[parsedForDay.getDay()] || dayNameRaw.substring(0, 3);
      game_datetime = `${dayName}, ${dd}/${mm}/${yyyy}, ${hhmm}`;
      // Parse to Date (month is 0-indexed)
      const [hh, min] = hhmm.split(':').map(Number);
      game_date = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), hh, min);
    }

    // Combine game name + datetime, then normalize to canonical name
    const game_name_raw = game_name_base && game_datetime
      ? `${game_name_base} | ${game_datetime}`
      : game_name_base;
    const game_name = normalizeGameName(game_name_raw, db);

    // Order number — body: "OrderID #286956987", fallback: subject "Order# XXXXXXX"
    const orderMatch = body.match(/OrderID\s*#\s*(\d{6,12})/i)
      || subject.match(/Order#\s*(\d{6,12})/i);
    const order_number = orderMatch ? orderMatch[1] : null;

    // Ticket quantity — "2 ticket(s)"
    const qtyMatch = body.match(/(\d+)\s*ticket\(s\)/i);
    const ticket_quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;

    // Category — single line like "Shortside Upper 124" or "Longside Lower 031"
    // Use [ \t] not \s to avoid spanning multiple lines
    const categoryMatch = body.match(/^([A-Za-z][A-Za-z0-9 \t]*(Lower|Upper|Side|Stand|Block|Tier|Level|End|Corner)[A-Za-z0-9 \t]*)$/im);
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
    // Exclude common non-name all-caps words (UTC, USA, UK, etc.)
    const EXCLUDE_NAMES = new Set(['UTC', 'USA', 'UK', 'EU', 'VAT', 'PDF', 'N/A', 'N A']);
    const buyerMatch = body.match(/^([A-Z][A-Z' \-]{2,40})$/gm);
    const buyer_name = buyerMatch
      ? buyerMatch.map(s => s.trim()).find(s => !EXCLUDE_NAMES.has(s) && s.includes(' ')) || null
      : null;

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
// FTN emails are "Daily Sales Summary" containing a table with multiple orders.
// Table columns (after HTML stripping, all on one line):
//   EventName  EventDate(DD/MM/YYYY HH:MM)  Category  OrderID(7-digit)  Qty  PricePerTicket GBP  SubTotal GBP
//
// Example row:
//   "Arsenal vs Bayer Leverkusen 17/03/2026 20:00 Shortside Upper Level 1598484 2 148.00 GBP 296.00 GBP"
//
// Returns an ARRAY of order objects (one email can have multiple orders).
function parseFootballTicketNet(subject, body) {
  const results = [];
  try {
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function parseFtnDate(dd, mm, yyyy, hh, min) {
      const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min));
      return {
        game_date: d,
        game_datetime: `${DAY_NAMES[d.getDay()]}, ${dd}/${mm}/${yyyy}, ${hh}:${min}`,
      };
    }

    // ── Case 1: Individual sale notification ──────────────────────────────────
    // Subject: "Your tickets have been sold on FootballTicketNet - Order  1602091 - Manchester City vs Liverpool FC"
    // Body (HTML→plain, table format):
    //   Order ID         1602091
    //   Event Name       Manchester City vs Liverpool FC
    //   Event Date       04/04/2026 12:45
    //   Ticket Quantity  2
    //   Category         Longside Lower Level
    //   Extra Information  Block: 9 - Row: LOWROW; Seats: 193|
    //   Price Per Ticket GBP 88.00
    //   Total Price      GBP 176.00
    // FTN order IDs gained a "TK-" prefix in Aug 2026 ("Order TK-811201938 - ...").
    // The same redesign also dropped the whitespace between a table label and its value
    // ("Order IDTK-811201938Event Name…"), so every label regex below tolerates \s*.
    const saleMatch = subject.match(/Order\s+((?:TK-)?\d{5,10})\s+-\s+(.+)$/i);
    if (saleMatch) {
      const order_number  = saleMatch[1];
      const game_name_raw = saleMatch[2].trim();

      // Event Date: "Event Date  04/04/2026 12:45"
      const dtM = body.match(/Event Date\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/i)
        || body.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
      const { game_date, game_datetime } = dtM
        ? parseFtnDate(dtM[1], dtM[2], dtM[3], dtM[4], dtM[5])
        : { game_date: null, game_datetime: null };

      // Ticket Quantity: "Ticket Quantity  2"
      const qtyM = body.match(/Ticket Quantity\s*(\d+)/i)
        || body.match(/Quantity[:\s]*(\d+)/i);
      const ticket_quantity = qtyM ? parseInt(qtyM[1]) : 1;

      // Category: "Category  Longside Lower Level  Split Type..."
      // No \b before "Category": the redesigned table glues it to the previous value
      // ("Ticket Quantity2Category…"), and digit→C is not a word boundary.
      const catM = body.match(/Category\s*([A-Za-z][A-Za-z\s0-9]+?)(?=\s*(?:Split|Shipping|Fan Side|Extra|Price|$))/i)
        || body.match(/([A-Za-z][A-Za-z\s0-9]*?(?:Level|Lower|Upper|Longside|Shortside|Side|Stand|Block|Tier)[A-Za-z\s0-9]*)/i);
      const category = catM ? catM[1].trim() : null;

      // Row/Seat from Extra Information: "Block: 9 - Row: LOWROW; Seats: 193|"
      const rowM = body.match(/Block:\s*([^\s\-]+)\s*-?\s*Row:\s*([^;|\n]+?)(?:;\s*Seats?:\s*([^|\n.]+))?(?:\s|$)/i);
      const row_seat = rowM
        ? `Block ${rowM[1].trim()} | Row ${rowM[2].trim()}${rowM[3] ? ' | Seats ' + rowM[3].trim() : ''}`
        : null;

      // Total Price: "Total Price  GBP 176.00" (GBP before the number)
      const totalM = body.match(/Total Price\s*(?:GBP|EUR|€|£)\s*([\d,]+\.?\d{0,2})/i)
        || body.match(/(?:GBP|EUR|€|£)\s*([\d,]+\.?\d{0,2})/i);
      const total_amount = totalM ? parseFloat(totalM[1].replace(/,/g, '')) : 0;

      const game_name_with_dt = game_name_raw + (game_datetime ? ` | ${game_datetime}` : '');
      const game_name = normalizeGameName(game_name_with_dt, db);

      results.push({
        game_name, order_number, buyer_name: null, buyer_email: null,
        ticket_quantity, category, row_seat, total_amount,
        sales_channel: 'FootballTicketNet', game_date, game_datetime,
      });
      return results;
    }

    // ── Case 2: Daily summary / payment email — table rows ────────────────────
    // Each row: EventName vs Team  DD/MM/YYYY HH:MM  CategoryText  7-digit-OrderID  Qty  Price GBP
    const rowRegex = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'&-]*?\bvs\.?\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'&-]*?)\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})\s+([A-Za-z][A-Za-z\s0-9]*?(?:Level|Lower|Upper|Longside|Shortside|Side|Stand|Block|Tier|End|Corner)[A-Za-z\s0-9]*?)\s+(\d{7})\s+(\d+)\s+([\d]+\.[\d]{2})\s*GBP/gi;

    let match;
    while ((match = rowRegex.exec(body)) !== null) {
      const [, game_name_raw, event_date_str, category, order_number, qty_str, price_str] = match;

      // Parse DD/MM/YYYY HH:MM → proper Date + display string
      const dtMatch = event_date_str.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
      let game_date = null;
      let game_datetime = null;
      if (dtMatch) {
        const [, dd, mm, yyyy, hh, min] = dtMatch;
        game_date = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min));
        game_datetime = `${DAY_NAMES[game_date.getDay()]}, ${dd}/${mm}/${yyyy}, ${hh}:${min}`;
      }

      const qty = parseInt(qty_str);
      const total_amount = qty * parseFloat(price_str);
      const game_name = game_name_raw.trim() + (game_datetime ? ` | ${game_datetime}` : '');

      results.push({
        game_name,
        order_number,
        buyer_name: null,
        buyer_email: null,
        ticket_quantity: qty,
        category: category.trim(),
        row_seat: null,
        total_amount,
        sales_channel: 'FootballTicketNet',
        game_date,
        game_datetime,
      });
    }

    if (results.length === 0) {
      console.log('[FTN] No order rows found in:', subject);
    }
  } catch (e) {
    console.error('[FootballTicketNet parser error]', e.message);
  }
  return results; // array (0 or more)
}

// ── Ticombo parser ─────────────────────────────────────────────────────────────
// Subject: "Congratulations!!! Your tickets are sold for {event}"
// Body is HTML-only → arrives here as tag-stripped text with &nbsp; entities intact:
//   Transaction ID: 0ksGWS3fyrkb  Jul 28, 2026  Bruno Mars - The Romantic Tour
//   Wembley Stadium, Wembley, United Kingdom  2 tickets  Category: Pitch Standing
//   Total Ticket Price: EUR 189.00 ... Order #: 1iWmCojyOc
//   Subtotal EUR 378.00  Service fee EUR 113.40 ... Total (payout) EUR 378.00
//
// The number that matters is "Total (payout)" — what Ticombo actually pays Omri,
// the same semantics as StubHub's "Payment Total". "Total" (EUR 491.40) is what the
// buyer paid including the service fee and must NOT be used as revenue.
const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

function parseTicombo(subject, body) {
  try {
    if (!/Your tickets are sold for/i.test(subject)) return null;

    const text = body.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

    // Order number — "Order #: 1iWmCojyOc" (alphanumeric, not the numeric StubHub style)
    const orderMatch = text.match(/Order\s*#:\s*([A-Za-z0-9]{6,16})/);
    const order_number = orderMatch ? orderMatch[1] : null;
    if (!order_number) return null;

    const game_name_base = (subject.match(/Your tickets are sold for\s+(.+?)\s*$/i) || [])[1]?.trim() || null;

    // Event date — "Jul 28, 2026" or "Jun 5, 2026, 14:30 CET". First such match is the
    // event box; the order date uses "Sunday, 26 Jul 2026" (different shape) so no clash.
    const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let game_date = null, game_datetime = null;
    const dtMatch = text.match(/\b([A-Z][a-z]{2})[a-z]* (\d{1,2}), (\d{4})(?:,\s*(\d{1,2}:\d{2}))?/);
    if (dtMatch) {
      const mm = MONTHS[dtMatch[1].toLowerCase()];
      if (mm) {
        const dd = parseInt(dtMatch[2]), yyyy = parseInt(dtMatch[3]);
        const [hh, min] = (dtMatch[4] || '00:00').split(':').map(Number);
        game_date = new Date(yyyy, mm - 1, dd, hh, min);
        game_datetime = `${DAY_ABBR[game_date.getDay()]}, ${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yyyy}, ${dtMatch[4] || '00:00'}`;
      }
    }

    const game_name = normalizeGameName(
      game_name_base && game_datetime ? `${game_name_base} | ${game_datetime}` : game_name_base, db);

    const qtyMatch = text.match(/(\d+)\s*tickets?\b/i);
    const ticket_quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;

    const catMatch = text.match(/Category:\s*([A-Za-z][A-Za-z0-9 \-]{1,40}?)\s+(?:Total Ticket Price|Section|$)/i);
    const category = catMatch ? catMatch[1].trim() : null;

    // Seller payout — never the buyer-facing "Total"
    const payMatch = text.match(/Total \(payout\)\s*([€£$])\s*([\d,]+\.\d{2})/i);
    if (!payMatch) {
      console.error(`[Ticombo] No "Total (payout)" in ${order_number} — skipping rather than guessing revenue`);
      return null;
    }
    // Everything downstream is EUR. A GBP/USD payout would silently land as the wrong
    // number, so surface it instead of importing it.
    if (payMatch[1] !== '€') {
      console.error(`[Ticombo] Order ${order_number} paid out in ${payMatch[1]} — manual entry required (DB is EUR)`);
      return null;
    }
    const total_amount = parseFloat(payMatch[2].replace(/,/g, ''));

    return {
      game_name, order_number,
      buyer_name: null, buyer_email: null, // Ticombo hides the buyer ("A guest user")
      ticket_quantity, category, row_seat: null, total_amount,
      sales_channel: 'Ticombo',
      game_date, game_datetime,
    };
  } catch (e) {
    console.error('[Ticombo parser error]', e.message);
    return null;
  }
}

// ── Main importer ─────────────────────────────────────────────────────────────
// options.futureOnly = true → skip orders where game date is in the past
async function checkEmailsAndImport(options = {}) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    console.log('[Gmail] Skipping — GOOGLE credentials not configured');
    return { stats: { checked: 0, imported: 0, skipped: 0, errors: ['GOOGLE credentials not configured'] }, importedOrders: [] };
  }
  const futureOnly  = !!options.futureOnly;
  const ignoreRead  = !!options.ignoreRead; // when true, ignore the watermark and search ALL mail
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const auth   = getOAuth2Client();
  const gmail  = google.gmail({ version: 'v1', auth });
  const stats  = { checked: 0, imported: 0, skipped: 0, errors: [] };
  const importedOrders = [];

  try {
    // Determine the "after:" date using a persistent watermark stored in the settings table.
    // This ensures each run only checks emails since the last successful run — no re-scanning old mail.
    // ignoreRead=true (manual override) bypasses the watermark and searches all mail.
    let afterDate = null;
    if (!ignoreRead) {
      const wmRow = db.prepare("SELECT value FROM settings WHERE key='gmail_last_checked_at'").get();
      // Overlap window: the watermark is only a floor for how far back to look, never a
      // promise that everything before it was imported. Re-scanning a few days costs one
      // extra API page and orderExists() drops the duplicates.
      const base = wmRow && wmRow.value ? new Date(wmRow.value) : new Date();
      const from = new Date((isNaN(base) ? Date.now() : base.getTime()) - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      afterDate = `${from.getFullYear()}/${String(from.getMonth()+1).padStart(2,'0')}/${String(from.getDate()).padStart(2,'0')}`;
      console.log(`[Gmail] Watermark ${wmRow?.value || '(none)'} → scanning after:${afterDate}`);
    }
    // NOTE: deliberately NOT filtering on is:unread. Omri (and Gmail filters) read/archive
    // these emails on the phone long before the 08:00 cron runs, and an unread filter made
    // every such sale invisible to the importer forever. orderExists() is the dedup guard.
    const dateFilter = (ignoreRead || !afterDate) ? '' : ` after:${afterDate}`;
    const queries = [
      `from:stubhub subject:"You sold your ticket"${dateFilter}`,
      `from:footballticketnet${dateFilter}`,
      `from:noreply@stubhub.com${dateFilter}`,
      `from:ticombo.com subject:"Your tickets are sold"${dateFilter}`,
    ];

    const messageIds = new Set();

    // Paginate. A single page was capped at 50 messages with no nextPageToken follow-up:
    // Gmail returns newest-first, so once a lookback window held more than 50 matches the
    // OLDEST sales were dropped — and because the watermark still advanced to today, they
    // were never scanned again. StubHub sends each "You sold" email twice, and a 7-day
    // window routinely holds 40+ of them, so this was live. Ceiling is loud, not silent.
    for (const q of queries) {
      let pageToken;
      let pages = 0;
      do {
        const r = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100, pageToken });
        for (const m of (r.data.messages || [])) {
          messageIds.add(m.id);
        }
        pageToken = r.data.nextPageToken;
        pages++;
        if (pageToken && pages >= MAX_PAGES_PER_QUERY) {
          console.warn(`[Gmail] ⚠️ hit the ${MAX_PAGES_PER_QUERY}-page ceiling on "${q}" — more mail matched than was scanned`);
          stats.errors.push(`page ceiling reached for query: ${q}`);
          break;
        }
      } while (pageToken);
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

        // Build a list of parsed orders from this email
        // StubHub → single order (or null); FTN → array of orders
        let parsedList = [];
        if (from.includes('stubhub')) {
          const p = parseStubHub(subject, body);
          if (p) parsedList = [p];
        } else if (from.includes('footballticketnet') || from.includes('football-ticket-net')) {
          parsedList = parseFootballTicketNet(subject, body); // returns array
        } else if (from.includes('ticombo')) {
          const p = parseTicombo(subject, body);
          if (p) parsedList = [p];
        }

        if (parsedList.length === 0) {
          stats.errors.push(`No order number found in email: ${subject}`);
          stats.skipped++;
          continue;
        }

        let emailHadAction = false;
        for (const parsed of parsedList) {
          // Future-only filter
          if (futureOnly && parsed.game_date instanceof Date && !isNaN(parsed.game_date)) {
            const gd = new Date(parsed.game_date); gd.setHours(0, 0, 0, 0);
            if (gd < today) {
              console.log(`[Gmail] Skipping past game: ${parsed.game_name}`);
              stats.skipped++;
              emailHadAction = true;
              continue;
            }
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
          emailHadAction = true;
        }

        // Mark email as read after processing all its orders
        if (emailHadAction) {
          await gmail.users.messages.modify({
            userId: 'me', id: msgId,
            requestBody: { removeLabelIds: ['UNREAD'] },
          });
        }
      } catch (e) {
        console.error('[Gmail] Error processing message:', e.message);
        stats.errors.push(e.message);
      }
    }

    console.log(`[Gmail] Done: checked=${stats.checked}, imported=${stats.imported}, skipped=${stats.skipped}`);

    // Update watermark to today so the next run only checks emails after today
    if (!ignoreRead) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}`;
      db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gmail_last_checked_at', ?, CURRENT_TIMESTAMP)").run(todayStr);
      console.log(`[Gmail] Watermark updated to ${todayStr}`);
    }

    return { stats, importedOrders };
  } catch (e) {
    console.error('[Gmail] Fatal error:', e.message);
    stats.errors.push(e.message);
    return { stats, importedOrders };
  }
}

// ── Summary email ──────────────────────────────────────────────────────────────
async function sendSummaryEmail(auth, stats, importedOrders) {
  // Split into: future orders (have date) vs no-date orders (need attention)
  const now = new Date();
  const futureOrders  = importedOrders.filter(o => o.game_date instanceof Date && !isNaN(o.game_date) && o.game_date > now);
  const nodateOrders  = importedOrders.filter(o => !o.game_date || isNaN(o.game_date));

  // Only send if there are future orders OR no-date orders needing attention
  if (futureOrders.length === 0 && nodateOrders.length === 0) return;

  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const now2   = new Date();
    const dd     = String(now2.getDate()).padStart(2, '0');
    const mm     = String(now2.getMonth() + 1).padStart(2, '0');
    const yyyy   = now2.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`; // pure ASCII

    // Subject — ASCII only, no special chars
    const subject = `[GameYield] ${dateStr} - ${futureOrders.length} new order(s) imported`;

    let bodyText = `GameYield - Daily Import Report (${dateStr})\n`;
    bodyText += `${'='.repeat(50)}\n\n`;

    if (futureOrders.length > 0) {
      bodyText += `NEW ORDERS (${futureOrders.length}):\n`;
      bodyText += `${'-'.repeat(40)}\n`;
      for (const o of futureOrders) {
        bodyText += `\n[${o.sales_channel}] ${o.game_name || '?'}\n`;
        bodyText += `  Order #${o.order_number} | ${o.ticket_quantity} ticket(s) | ${o.total_amount ? 'GBP/EUR ' + o.total_amount.toFixed(2) : 'no amount'}\n`;
        if (o.category)    bodyText += `  Category: ${o.category}\n`;
        if (o.row_seat)    bodyText += `  Seats: ${o.row_seat}\n`;
        if (o.buyer_name)  bodyText += `  Buyer: ${o.buyer_name}${o.buyer_email ? ' <' + o.buyer_email + '>' : ''}\n`;
      }
    }

    if (nodateOrders.length > 0) {
      bodyText += `\n\nNEEDS ATTENTION - No game date found (${nodateOrders.length}):\n`;
      bodyText += `${'='.repeat(50)}\n`;
      bodyText += `Please check these orders and update the game date manually:\n\n`;
      for (const o of nodateOrders) {
        bodyText += `  [${o.sales_channel}] Order #${o.order_number} - ${o.game_name || 'No Game'}\n`;
      }
    }

    bodyText += `\n${'='.repeat(50)}\n`;
    bodyText += `Total checked: ${stats.checked} | Imported: ${stats.imported} | Skipped: ${stats.skipped}\n`;

    // RFC 2822 raw message — encode subject as UTF-8 base64 word to be safe
    const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const rawMessage = [
      `To: omribor1@gmail.com`,
      `Subject: ${subjectEncoded}`,
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
    console.log(`[Gmail] Summary email sent — ${futureOrders.length} future orders, ${nodateOrders.length} need attention`);
  } catch (e) {
    console.error('[Gmail] Failed to send summary email:', e.message);
  }
}

module.exports = { checkEmailsAndImport, sendSummaryEmail, parseTicombo, parseFootballTicketNet };
