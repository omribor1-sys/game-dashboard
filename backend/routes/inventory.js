const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const path    = require('path');
const db      = require('../database');

const upload = multer({ dest: path.join(__dirname, '../uploads/') });

// ─── Migrations ──────────────────────────────────────────────────────────────
try { db.exec("ALTER TABLE orders ADD COLUMN game_id INTEGER"); } catch(_) {}
try { db.exec("ALTER TABLE orders ADD COLUMN game_name TEXT"); } catch(_) {}

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_INVENTORY_STATUSES = ['Available', 'Reserved', 'Sold', 'Delivered', 'Cancelled'];
const VALID_ORDER_STATUSES = ['Pending', 'Confirmed', 'Paid', 'Delivered', 'Cancelled'];

function round2(n) {
  return Math.round(n * 100) / 100;
}

function getOrderWithItems(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  order.items = db.prepare(`
    SELECT oi.id, oi.inventory_id, oi.sell_price,
           i.game_name, i.game_date, i.seat, i.section, i.category, i.status
    FROM order_items oi
    JOIN inventory i ON i.id = oi.inventory_id
    WHERE oi.order_id = ?
    ORDER BY oi.id
  `).all(orderId);
  return order;
}

// ════════════════════════════════════════════════════════════════════════════
//  INVENTORY ROUTER  — mounted at /api/inventory
// ════════════════════════════════════════════════════════════════════════════
const inventoryRouter = express.Router();

// GET /api/inventory/summary
// IMPORTANT: must be declared before /:id to avoid route shadowing
inventoryRouter.get('/summary', (req, res) => {
  try {
    const all = db.prepare('SELECT status, buy_price, sell_price FROM inventory').all();

    const byStatus = {};
    for (const s of VALID_INVENTORY_STATUSES) byStatus[s] = 0;

    let totalBuyValue = 0;
    let soldRevenue = 0;
    let soldCost = 0;

    for (const item of all) {
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
      totalBuyValue += item.buy_price || 0;
      if (item.status === 'Sold' || item.status === 'Delivered') {
        soldRevenue += item.sell_price || 0;
        soldCost    += item.buy_price  || 0;
      }
    }

    const orderCount = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;

    res.json({
      total: all.length,
      byStatus,
      totalBuyValue: round2(totalBuyValue),
      soldRevenue:   round2(soldRevenue),
      soldProfit:    round2(soldRevenue - soldCost),
      orderCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/games — distinct games that have inventory items
// IMPORTANT: declared before /:id to avoid route shadowing
inventoryRouter.get('/games', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT DISTINCT game_id, game_name FROM inventory ORDER BY game_name'
    ).all();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/stats-by-game — aggregated per game for the dashboard view
inventoryRouter.get('/stats-by-game', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        game_name,
        game_date,
        COUNT(*)                                                        AS bq,
        SUM(CASE WHEN status IN ('Sold','Delivered') THEN 1 ELSE 0 END) AS sq,
        SUM(CASE WHEN status = 'Reserved'            THEN 1 ELSE 0 END) AS reserved,
        SUM(CASE WHEN status = 'Available'           THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN status IN ('Sold','Delivered') THEN sell_price ELSE 0 END) AS income,
        SUM(buy_price)                                                  AS inventory_cost
      FROM inventory
      GROUP BY game_name
      ORDER BY game_date DESC, game_name
    `).all();

    // For each game get order count
    const result = rows.map(r => {
      const oq = db.prepare(`
        SELECT COUNT(DISTINCT oi.order_id) AS n
        FROM order_items oi
        JOIN inventory i ON i.id = oi.inventory_id
        WHERE i.game_name = ?
      `).get(r.game_name)?.n || 0;

      const profit = (r.income || 0) - (r.inventory_cost || 0);
      const margin = r.income > 0 ? Math.round((profit / r.income) * 1000) / 10 : 0;
      const mq     = (r.bq || 0) - (r.sq || 0) - (r.reserved || 0); // unsold & unreserved

      return {
        game_name:      r.game_name,
        game_date:      r.game_date,
        bq:             r.bq || 0,
        oq,
        sq:             r.sq || 0,
        mq:             Math.max(0, mq),
        available:      r.available || 0,
        reserved:       r.reserved  || 0,
        income:         round2(r.income         || 0),
        inventory_cost: round2(r.inventory_cost || 0),
        profit:         round2(profit),
        margin,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory
inventoryRouter.get('/', (req, res) => {
  try {
    const { status, game_id, search } = req.query;
    let sql = 'SELECT * FROM inventory WHERE 1=1';
    const params = [];

    if (status && VALID_INVENTORY_STATUSES.includes(status)) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (game_id) {
      sql += ' AND game_id = ?';
      params.push(Number(game_id));
    }
    if (search) {
      sql += ' AND (game_name LIKE ? OR seat LIKE ? OR section LIKE ? OR category LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY created_at DESC';

    const items = db.prepare(sql).all(...params);
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/bulk-import  — upload Excel, parse Tickets sheet, insert all rows
inventoryRouter.post('/bulk-import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Parse game name & date from filename
    // Format: "Team A VS Team B DD_MM_YYYY - Competition.xlsx"  or "... DD_MM_YYYY.xlsx"
    const filename = req.file.originalname.replace(/\.xlsx?$/i, '');
    const dateMatch = filename.match(/(\d{2})[_\-\.](\d{2})[_\-\.](\d{4})/);
    let gameDate = null;
    let gameName = filename;
    if (dateMatch) {
      gameDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`; // YYYY-MM-DD
      // Remove date from name, clean up separators
      gameName = filename.replace(dateMatch[0], '').replace(/\s*-\s*$/, '').replace(/\s+/g, ' ').trim();
      // If there's a competition after " - ", reattach it
      const compMatch = filename.match(/\d{2}[_\-\.]\d{2}[_\-\.]\d{4}\s*-\s*(.+)/);
      if (compMatch) gameName = gameName + ' - ' + compMatch[1].trim();
    }

    // Allow overrides from form body
    if (req.body.game_name) gameName = req.body.game_name;
    if (req.body.game_date) gameDate = req.body.game_date;

    // Parse Excel
    const wb = XLSX.readFile(req.file.path);
    const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes('ticket')) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    if (rows.length < 2) return res.status(400).json({ error: 'No data rows found in Tickets sheet' });

    // Normalize headers (strip newlines, lowercase, trim)
    const headers = rows[0].map(h => (h || '').toString().replace(/\s+/g, ' ').trim().toLowerCase());

    const col = name => {
      const variants = Array.isArray(name) ? name : [name];
      for (const v of variants) {
        const idx = headers.findIndex(h => h.includes(v.toLowerCase()));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const iMember   = col(['member number', 'membernumber']);
    const iCat      = col(['cat']);
    const iSeat     = col(['seat']);
    const iPrice    = col(['price in eur', 'price eur']);
    const iNote     = col(['note']);

    const inserted = [];
    const stmt = db.prepare(`
      INSERT INTO inventory (game_name, game_date, member_number, seat, category, buy_price, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Available')
    `);

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every(c => c === null || c === '')) continue; // skip empty rows

      const memberNum = iMember >= 0 ? (r[iMember] || null) : null;
      const cat       = iCat    >= 0 ? (r[iCat]    || null) : null;
      const seat      = iSeat   >= 0 ? (r[iSeat]   || null) : null;
      const price     = iPrice  >= 0 ? parseFloat(r[iPrice]) || 0 : 0;
      const note      = iNote   >= 0 ? (r[iNote]   || null) : null;

      const result = stmt.run(gameName, gameDate, memberNum ? String(memberNum) : null, seat, cat, price, note);
      inserted.push(result.lastInsertRowid);
    }

    res.json({ inserted: inserted.length, game_name: gameName, game_date: gameDate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory
inventoryRouter.post('/', (req, res) => {
  try {
    const {
      game_id, game_name, game_date, seat, section, category,
      buy_price, sell_price, status, notes,
    } = req.body;

    if (!game_name || !game_name.trim()) {
      return res.status(400).json({ error: 'game_name is required' });
    }
    if (status && !VALID_INVENTORY_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = db.prepare(`
      INSERT INTO inventory
        (game_id, game_name, game_date, seat, section, category, buy_price, sell_price, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      game_id || null,
      game_name.trim(),
      game_date || null,
      seat     || null,
      section  || null,
      category || null,
      parseFloat(buy_price)  || 0,
      parseFloat(sell_price) || 0,
      status || 'Available',
      notes  || null,
    );

    const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id
inventoryRouter.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const {
      game_id, game_name, game_date, seat, section, category,
      buy_price, sell_price, status, notes, member_number,
    } = req.body;

    if (status && !VALID_INVENTORY_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    db.prepare(`
      UPDATE inventory SET
        game_id       = ?,
        game_name     = ?,
        game_date     = ?,
        seat          = ?,
        section       = ?,
        category      = ?,
        buy_price     = ?,
        sell_price    = ?,
        status        = ?,
        notes         = ?,
        member_number = ?
      WHERE id = ?
    `).run(
      game_id    !== undefined ? (game_id    || null)  : existing.game_id,
      (game_name !== undefined ? game_name   : existing.game_name).trim(),
      game_date  !== undefined ? (game_date  || null)  : existing.game_date,
      seat       !== undefined ? (seat       || null)  : existing.seat,
      section    !== undefined ? (section    || null)  : existing.section,
      category   !== undefined ? (category   || null)  : existing.category,
      buy_price  !== undefined ? (parseFloat(buy_price)  || 0) : existing.buy_price,
      sell_price !== undefined ? (parseFloat(sell_price) || 0) : existing.sell_price,
      status     || existing.status,
      notes         !== undefined ? (notes         || null) : existing.notes,
      member_number !== undefined ? (member_number || null) : existing.member_number,
      req.params.id,
    );

    const updated = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:id
inventoryRouter.delete('/:id', (req, res) => {
  try {
    const inOrder = db.prepare(
      'SELECT order_id FROM order_items WHERE inventory_id = ? LIMIT 1'
    ).get(req.params.id);
    if (inOrder) {
      return res.status(409).json({
        error: `This ticket is part of order #${inOrder.order_id}. Remove it from the order first.`,
      });
    }

    const result = db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  ORDERS ROUTER  — mounted at /api/orders
// ════════════════════════════════════════════════════════════════════════════
const ordersRouter = express.Router();

// GET /api/orders/sales-channels — distinct channels for autocomplete
ordersRouter.get('/sales-channels', (req, res) => {
  try {
    const rows = db.prepare(
      "SELECT DISTINCT sales_channel FROM orders WHERE sales_channel IS NOT NULL AND sales_channel != '' ORDER BY sales_channel"
    ).all();
    res.json(rows.map(r => r.sales_channel));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/orders/game-names — all game names from both tables for autocomplete
ordersRouter.get('/game-names', (req, res) => {
  try {
    const fromGames = db.prepare("SELECT name AS game_name FROM games").all().map(r => r.game_name);
    const fromInv   = db.prepare("SELECT DISTINCT game_name FROM inventory WHERE game_name IS NOT NULL").all().map(r => r.game_name);
    const all = [...new Set([...fromGames, ...fromInv])].sort();
    res.json(all);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/orders
ordersRouter.get('/', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    const result = orders.map(order => {
      order.items = db.prepare(`
        SELECT oi.id, oi.inventory_id, oi.sell_price,
               i.game_name, i.game_date, i.seat, i.section, i.category, i.status
        FROM order_items oi
        JOIN inventory i ON i.id = oi.inventory_id
        WHERE oi.order_id = ?
        ORDER BY oi.id
      `).all(order.id);
      return order;
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders
ordersRouter.post('/', (req, res) => {
  try {
    const { buyer_name, buyer_email, buyer_phone, status, notes, game_id, game_name, order_number, sales_channel } = req.body;

    if (status && !VALID_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    const result = db.prepare(`
      INSERT INTO orders (buyer_name, buyer_email, buyer_phone, status, notes, game_id, game_name, order_number, sales_channel)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      buyer_name     || null,
      buyer_email    || null,
      buyer_phone    || null,
      status || 'Pending',
      notes          || null,
      game_id        || null,
      game_name      || null,
      order_number   || null,
      sales_channel  || null,
    );

    const order = getOrderWithItems(result.lastInsertRowid);
    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id
ordersRouter.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const { buyer_name, buyer_email, buyer_phone, status, notes, game_id, game_name, order_number, sales_channel } = req.body;

    if (status && !VALID_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    // Recalculate total_amount from current order_items
    const items = db.prepare('SELECT sell_price FROM order_items WHERE order_id = ?').all(req.params.id);
    const total = round2(items.reduce((s, i) => s + (i.sell_price || 0), 0));

    db.prepare(`
      UPDATE orders SET
        buyer_name    = ?,
        buyer_email   = ?,
        buyer_phone   = ?,
        status        = ?,
        notes         = ?,
        total_amount  = ?,
        game_id       = ?,
        game_name     = ?,
        order_number  = ?,
        sales_channel = ?
      WHERE id = ?
    `).run(
      buyer_name    !== undefined ? (buyer_name    || null) : existing.buyer_name,
      buyer_email   !== undefined ? (buyer_email   || null) : existing.buyer_email,
      buyer_phone   !== undefined ? (buyer_phone   || null) : existing.buyer_phone,
      status || existing.status,
      notes         !== undefined ? (notes         || null) : existing.notes,
      total,
      game_id       !== undefined ? (game_id       || null) : existing.game_id,
      game_name     !== undefined ? (game_name     || null) : existing.game_name,
      order_number  !== undefined ? (order_number  || null) : existing.order_number,
      sales_channel !== undefined ? (sales_channel || null) : existing.sales_channel,
      req.params.id,
    );

    res.json(getOrderWithItems(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/items
ordersRouter.post('/:id/items', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const { inventory_id, sell_price } = req.body;
    if (!inventory_id) return res.status(400).json({ error: 'inventory_id is required' });

    const invItem = db.prepare('SELECT * FROM inventory WHERE id = ?').get(inventory_id);
    if (!invItem) return res.status(404).json({ error: 'Inventory item not found' });

    // Prevent duplicates within this order
    const duplicate = db.prepare(
      'SELECT id FROM order_items WHERE order_id = ? AND inventory_id = ?'
    ).get(req.params.id, inventory_id);
    if (duplicate) return res.status(409).json({ error: 'Ticket already in this order' });

    // Prevent assigning to another active order
    const elsewhere = db.prepare(`
      SELECT oi.order_id FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.inventory_id = ? AND o.status != 'Cancelled'
    `).get(inventory_id);
    if (elsewhere) {
      return res.status(409).json({
        error: `Ticket is already assigned to order #${elsewhere.order_id}`,
      });
    }

    const itemSellPrice = sell_price !== undefined
      ? (parseFloat(sell_price) || 0)
      : invItem.sell_price;

    db.prepare(
      'INSERT INTO order_items (order_id, inventory_id, sell_price) VALUES (?, ?, ?)'
    ).run(req.params.id, inventory_id, itemSellPrice);

    // Auto-reserve if was Available
    if (invItem.status === 'Available') {
      db.prepare("UPDATE inventory SET status = 'Reserved' WHERE id = ?").run(inventory_id);
    }

    // Recalculate order total
    const allItems = db.prepare('SELECT sell_price FROM order_items WHERE order_id = ?').all(req.params.id);
    const total = round2(allItems.reduce((s, i) => s + (i.sell_price || 0), 0));
    db.prepare('UPDATE orders SET total_amount = ? WHERE id = ?').run(total, req.params.id);

    res.status(201).json(getOrderWithItems(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/:id/items/:itemId
ordersRouter.delete('/:id/items/:itemId', (req, res) => {
  try {
    const orderItem = db.prepare(
      'SELECT * FROM order_items WHERE id = ? AND order_id = ?'
    ).get(req.params.itemId, req.params.id);
    if (!orderItem) return res.status(404).json({ error: 'Order item not found' });

    db.prepare('DELETE FROM order_items WHERE id = ?').run(req.params.itemId);

    // Revert to Available if was Reserved
    const invItem = db.prepare('SELECT status FROM inventory WHERE id = ?').get(orderItem.inventory_id);
    if (invItem && invItem.status === 'Reserved') {
      db.prepare("UPDATE inventory SET status = 'Available' WHERE id = ?").run(orderItem.inventory_id);
    }

    // Recalculate order total
    const allItems = db.prepare('SELECT sell_price FROM order_items WHERE order_id = ?').all(req.params.id);
    const total = round2(allItems.reduce((s, i) => s + (i.sell_price || 0), 0));
    db.prepare('UPDATE orders SET total_amount = ? WHERE id = ?').run(total, req.params.id);

    res.json(getOrderWithItems(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/:id
ordersRouter.delete('/:id', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Revert Reserved tickets to Available before cascade delete
    const reservedItems = db.prepare(`
      SELECT oi.inventory_id FROM order_items oi
      JOIN inventory i ON i.id = oi.inventory_id
      WHERE oi.order_id = ? AND i.status = 'Reserved'
    `).all(req.params.id);

    for (const { inventory_id } of reservedItems) {
      db.prepare("UPDATE inventory SET status = 'Available' WHERE id = ?").run(inventory_id);
    }

    db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { inventoryRouter, ordersRouter };
