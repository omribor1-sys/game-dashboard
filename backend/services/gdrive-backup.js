'use strict';

const { google } = require('googleapis');
const XLSX = require('xlsx');
const db = require('../database');

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1unWKl52BgBD4m_PRo5CVEyOOUJciQ425';

function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

function buildBackupExcel() {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Orders
  const orders = db.prepare(`
    SELECT id, order_number, game_name, buyer_name, buyer_email, buyer_phone,
           sales_channel, status, total_amount, ticket_quantity, category, row_seat,
           notes, created_at
    FROM orders ORDER BY created_at DESC
  `).all();

  const ordersSheet = XLSX.utils.json_to_sheet(orders.map(o => ({
    'ID':             o.id,
    'Order #':        o.order_number || '',
    'Game':           o.game_name || '',
    'Buyer':          o.buyer_name || '',
    'Email':          o.buyer_email || '',
    'Phone':          o.buyer_phone || '',
    'Channel':        o.sales_channel || '',
    'Status':         o.status || '',
    'Total (€)':      o.total_amount || 0,
    'Tickets':        o.ticket_quantity || 1,
    'Category':       o.category || '',
    'Row / Seat':     o.row_seat || '',
    'Notes':          o.notes || '',
    'Created':        o.created_at || '',
  })));
  XLSX.utils.book_append_sheet(wb, ordersSheet, 'Orders');

  // Sheet 2: Games
  const games = db.prepare(`
    SELECT id, name, date, total_revenue, total_ticket_cost, eli_cost,
           net_profit, margin_percent, tickets_sold, uploaded_at
    FROM games ORDER BY date DESC
  `).all();

  const gamesSheet = XLSX.utils.json_to_sheet(games.map(g => ({
    'ID':           g.id,
    'Game':         g.name || '',
    'Date':         g.date || '',
    'Revenue (€)':  g.total_revenue || 0,
    'Cost (€)':     g.total_ticket_cost || 0,
    'Eli Cost (€)': g.eli_cost || 0,
    'Profit (€)':   g.net_profit || 0,
    'Margin %':     g.margin_percent || 0,
    'Tickets Sold': g.tickets_sold || 0,
    'Uploaded':     g.uploaded_at || '',
  })));
  XLSX.utils.book_append_sheet(wb, gamesSheet, 'Games');

  // Sheet 3: Inventory
  const inventory = db.prepare(`
    SELECT id, game_name, seat, category, buy_price, sell_price, status, member_number, created_at
    FROM inventory ORDER BY game_name, seat
  `).all();

  const invSheet = XLSX.utils.json_to_sheet(inventory.map(i => ({
    'ID':            i.id,
    'Game':          i.game_name || '',
    'Seat':          i.seat || '',
    'Category':      i.category || '',
    'Buy Price (€)': i.buy_price || 0,
    'Sell Price (€)':i.sell_price || 0,
    'Status':        i.status || '',
    'Member #':      i.member_number || '',
    'Created':       i.created_at || '',
  })));
  XLSX.utils.book_append_sheet(wb, invSheet, 'Inventory');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function backupToDrive() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    console.log('[Drive] Skipping — GOOGLE credentials not configured');
    return { success: false, reason: 'No credentials' };
  }

  try {
    const auth  = getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });

    const buffer   = buildBackupExcel();
    const now      = new Date();
    const dateStr  = now.toISOString().slice(0, 10);
    const fileName = `GameYield_Backup_${dateStr}.xlsx`;

    const { Readable } = require('stream');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const res = await drive.files.create({
      requestBody: {
        name:    fileName,
        parents: [DRIVE_FOLDER_ID],
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: stream,
      },
    });

    console.log(`[Drive] Backup uploaded: ${fileName} (id=${res.data.id})`);
    return { success: true, file: fileName, fileId: res.data.id };
  } catch (e) {
    console.error('[Drive] Backup error:', e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { backupToDrive, buildBackupExcel };
