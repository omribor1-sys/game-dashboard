const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const path    = require('path');
const db      = require('../database');
const { parseGameFile } = require('../utils/parser');

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

function getOrderItemRow(itemId) {
  return db.prepare(`
    SELECT oi.id AS item_id, oi.sell_price, oi.inventory_id,
           i.seat, i.category, i.member_number, i.status, i.buy_price, i.notes
    FROM order_items oi
    LEFT JOIN inventory i ON i.id = oi.inventory_id
    WHERE oi.id = ?
  `).get(itemId);
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

// GET /api/inventory/available — items not linked to any order, optional ?game_name filter
inventoryRouter.get('/available', (req, res) => {
  try {
    const { game_name } = req.query;
    let sql = `
      SELECT i.* FROM inventory i
      WHERE i.status = 'Available'
        AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.inventory_id = i.id)
    `;
    const params = [];
    if (game_name) {
      sql += ' AND i.game_name = ?';
      params.push(game_name);
    }
    sql += ' ORDER BY i.game_name, i.category, i.seat';
    res.json(db.prepare(sql).all(...params));
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

// POST /api/inventory/parse-preview — analyze file without importing
inventoryRouter.post('/parse-preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const wb = XLSX.readFile(req.file.path);
    const allSheets = wb.SheetNames;

    // Sheet selection: use provided sheet_name if valid, else auto-detect
    const requestedSheet = req.body && req.body.sheet_name;
    let sheetName;
    if (requestedSheet && allSheets.includes(requestedSheet)) {
      sheetName = requestedSheet;
    } else {
      sheetName = wb.SheetNames.find(s => s.toLowerCase().includes('ticket')) || wb.SheetNames[0];
    }

    // Detect if this is a summary-type sheet
    const sheetNameLower = sheetName.toLowerCase();
    const isSummarySheet = ['customer', 'service', 'summary'].some(kw => sheetNameLower.includes(kw));

    if (isSummarySheet) {
      // Parse with parseGameFile and return summary-shaped response
      const parsed = parseGameFile(req.file.path, sheetName);

      const filename = req.file.originalname.replace(/\.xlsx?$/i, '');
      const dateMatch = filename.match(/(\d{2})[_\-\. ](\d{2})[_\-\. ](\d{4})/);
      let detectedDate = null, detectedName = filename;
      if (dateMatch) {
        detectedDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        detectedName = filename.replace(dateMatch[0], '').replace(/\s*-\s*$/, '').replace(/\s+/g, ' ').trim();
      }

      return res.json({
        filename: req.file.originalname,
        all_sheets: allSheets,
        sheet_used: sheetName,
        sheet_type: 'summary',
        total_revenue: parsed.totalRevenue,
        total_ticket_cost: parsed.totalTicketCost,
        eli_cost: parsed.eliCost,
        tickets_sold: parsed.ticketsSold,
        avg_buy_price: parsed.avgBuyPrice,
        avg_sell_price: parsed.avgSellPrice,
        status_breakdown: parsed.statusBreakdown,
        issues: parsed.issues,
        detected_game_name: detectedName,
        detected_game_date: detectedDate,
      });
    }

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    if (rows.length < 2) {
      return res.json({ error: 'Sheet is empty', sheet_used: sheetName, all_sheets: allSheets, total_rows: 0 });
    }

    const rawHeaders = rows[0];
    const headers = rawHeaders.map(h => (h || '').toString().replace(/\s+/g, ' ').trim());
    const headersLower = headers.map(h => h.toLowerCase());

    const findCol = (names) => {
      for (const name of names) {
        const idx = headersLower.findIndex(h => h.includes(name.toLowerCase()));
        if (idx !== -1) return { index: idx, col_name: headers[idx] };
      }
      return null;
    };

    const mapping = {
      member_number: findCol(['member number', 'membernumber']),
      category:      findCol(['cat']),
      seat:          findCol(['seat']),
      buy_price:     findCol(['price in eur', 'price eur']),
      notes:         findCol(['note']),
    };

    const dataRows = rows.slice(1).filter(r => r && !r.every(c => c === null || c === ''));
    const warnings = [];

    // Check nulls in found columns
    for (const [field, col] of Object.entries(mapping)) {
      if (!col) { warnings.push({ field, type: 'missing', message: `Column not found for "${field}"` }); continue; }
      const nullCount = dataRows.filter(r => r[col.index] === null || r[col.index] === '').length;
      if (nullCount === dataRows.length) {
        warnings.push({ field, type: 'all_null', message: `"${col.col_name}" column is empty in all rows` });
      } else if (nullCount > 0) {
        warnings.push({ field, type: 'partial_null', message: `"${col.col_name}": ${nullCount} rows have empty values` });
      }
    }

    // Category analysis from Notes
    let categoryFromNotes = false;
    if (mapping.notes && (!mapping.category || warnings.find(w => w.field === 'category' && w.type === 'all_null'))) {
      const noteCategories = {};
      dataRows.forEach(r => {
        const note = r[mapping.notes.index];
        if (note) {
          // Extract text before number at end, like "Young Adult(17-21) 30" → "Young Adult(17-21)"
          const catMatch = String(note).match(/^(.+?)\s+\d+(\s|$)/);
          const cat = catMatch ? catMatch[1].trim() : String(note).trim();
          noteCategories[cat] = (noteCategories[cat] || 0) + 1;
        }
      });
      if (Object.keys(noteCategories).length > 0) {
        categoryFromNotes = true;
        warnings.push({ field: 'category', type: 'from_notes', message: 'Category will be extracted from Notes column', categories: noteCategories });
      }
    }

    // Sample rows (first 5)
    const sample = dataRows.slice(0, 5).map(r => ({
      member_number: mapping.member_number ? r[mapping.member_number.index] : null,
      category:      mapping.category      ? r[mapping.category.index]      : null,
      seat:          mapping.seat          ? r[mapping.seat.index]           : null,
      buy_price:     mapping.buy_price     ? parseFloat(r[mapping.buy_price.index]) || 0 : 0,
      notes:         mapping.notes         ? r[mapping.notes.index]          : null,
    }));

    // Filename detection
    const filename = req.file.originalname.replace(/\.xlsx?$/i, '');
    const dateMatch = filename.match(/(\d{2})[_\-\. ](\d{2})[_\-\. ](\d{4})/);
    let detectedDate = null, detectedName = filename;
    if (dateMatch) {
      detectedDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      detectedName = filename.replace(dateMatch[0], '').replace(/\s*-\s*$/, '').replace(/\s+/g, ' ').trim();
    }

    // Auto-match against existing games table — use exact game name if found
    const allExistingGames = db.prepare('SELECT name FROM games').all();
    const normStr = s => s.toLowerCase().replace(/[\s\-_]+/g, ' ').replace(/\s+\d{2}\s+\d{2}\s+\d{4}.*$/, '').trim();
    const normDetected = normStr(detectedName);
    const matchedGame = allExistingGames.find(g => {
      const gn = normStr(g.name);
      return gn === normDetected || g.name.toLowerCase().includes(normDetected) || normDetected.includes(gn);
    });
    if (matchedGame) detectedName = matchedGame.name;

    // Price summary
    const prices = dataRows
      .map(r => mapping.buy_price ? parseFloat(r[mapping.buy_price.index]) || 0 : 0)
      .filter(p => p > 0);
    const totalCost = prices.reduce((s, p) => s + p, 0);
    const avgPrice = prices.length > 0 ? totalCost / prices.length : 0;

    res.json({
      filename: req.file.originalname,
      all_sheets: allSheets,
      sheet_used: sheetName,
      sheet_type: 'tickets',
      total_rows: dataRows.length,
      all_headers: headers,
      column_mapping: mapping,
      category_from_notes: categoryFromNotes,
      warnings,
      sample,
      detected_game_name: detectedName,
      detected_game_date: detectedDate,
      price_summary: { total_cost: round2(totalCost), avg_price: round2(avgPrice), tickets_with_price: prices.length },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/bulk-import  — upload Excel, parse Tickets sheet, insert all rows
inventoryRouter.post('/bulk-import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filename = req.file.originalname.replace(/\.xlsx?$/i, '');
    const dateMatch = filename.match(/(\d{2})[_\-\. ](\d{2})[_\-\. ](\d{4})/);
    let gameDate = null, gameName = filename;
    if (dateMatch) {
      gameDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      gameName = filename.replace(dateMatch[0], '').replace(/\s*-\s*$/, '').replace(/\s+/g, ' ').trim();
      const compMatch = filename.match(/\d{2}[_\-\. ]\d{2}[_\-\. ]\d{4}\s*-\s*(.+)/);
      if (compMatch) gameName = gameName + ' - ' + compMatch[1].trim();
    }
    if (req.body.game_name) gameName = req.body.game_name;
    if (req.body.game_date) gameDate = req.body.game_date;

    // Auto-match: if an existing game in games table has a similar name, use that exact name
    // This prevents mismatches when detected name strips the date but games table keeps it
    const existingGames = db.prepare('SELECT name FROM games').all();
    const normalise = s => s.toLowerCase().replace(/[\s\-_]+/g, ' ').replace(/\s+\d{2}\s+\d{2}\s+\d{4}.*$/, '').trim();
    const importNorm = normalise(gameName);
    const matched = existingGames.find(g => {
      const gNorm = normalise(g.name);
      return gNorm === importNorm || g.name.toLowerCase().includes(importNorm) || importNorm.includes(gNorm);
    });
    if (matched) {
      gameName = matched.name;
    }

    const wb = XLSX.readFile(req.file.path);
    const requestedSheetImport = req.body && req.body.sheet_name;
    let sheetName;
    if (requestedSheetImport && wb.SheetNames.includes(requestedSheetImport)) {
      sheetName = requestedSheetImport;
    } else {
      sheetName = wb.SheetNames.find(s => s.toLowerCase().includes('ticket')) || wb.SheetNames[0];
    }
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    if (rows.length < 2) return res.status(400).json({ error: 'No data rows found in sheet: ' + sheetName });

    const headers = rows[0].map(h => (h || '').toString().replace(/\s+/g, ' ').trim().toLowerCase());

    const col = (names) => {
      for (const v of (Array.isArray(names) ? names : [names])) {
        const idx = headers.findIndex(h => h.includes(v.toLowerCase()));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const iMember = col(['member number', 'membernumber']);
    const iCat    = col(['cat']);
    const iSeat   = col(['seat']);
    const iPrice  = col(['price in eur', 'price eur']);
    const iNote   = col(['note']);

    const dataRows = rows.slice(1).filter(r => r && !r.every(c => c === null || c === ''));

    // Check if CAT is all null — if so, extract from Notes
    const catAllNull = iCat >= 0 && dataRows.every(r => r[iCat] === null || r[iCat] === '');

    const extractCatFromNote = (note) => {
      if (!note) return null;
      const s = String(note).trim();
      // "Young Adult(17-21) 30" → "Young Adult(17-21)"
      const m = s.match(/^(.+?)\s+\d+(\s|$)/);
      return m ? m[1].trim() : s;
    };

    const warnings = [];
    if (catAllNull && iNote >= 0) warnings.push('Category extracted from Notes column (CAT column was empty)');
    if (iSeat < 0) warnings.push('SEAT column not found');
    if (iPrice < 0) warnings.push('PRICE IN EUR column not found');

    const inserted = [];
    const categoryStats = {};
    const stmt = db.prepare(`
      INSERT INTO inventory (game_name, game_date, member_number, seat, category, buy_price, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Available')
    `);

    for (const r of dataRows) {
      const memberNum = iMember >= 0 ? (r[iMember] || null) : null;
      const seat      = iSeat   >= 0 ? (r[iSeat]   || null) : null;
      const noteRaw   = iNote   >= 0 ? (r[iNote]   || null) : null;
      const price     = iPrice  >= 0 ? parseFloat(r[iPrice]) || 0 : 0;

      // Category: use CAT column if not null, else extract from Notes
      let cat = iCat >= 0 ? (r[iCat] || null) : null;
      if (!cat && catAllNull && noteRaw) cat = extractCatFromNote(noteRaw);

      categoryStats[cat || 'Unknown'] = (categoryStats[cat || 'Unknown'] || 0) + 1;

      const res2 = stmt.run(gameName, gameDate, memberNum ? String(memberNum) : null, seat, cat, price, noteRaw);
      inserted.push(res2.lastInsertRowid);
    }

    const totalCost = dataRows.reduce((s, r) => s + (iPrice >= 0 ? parseFloat(r[iPrice]) || 0 : 0), 0);

    res.json({
      inserted: inserted.length,
      game_name: gameName,
      game_date: gameDate,
      sheet_used: sheetName,
      total_cost: round2(totalCost),
      category_stats: categoryStats,
      warnings,
    });
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

// DELETE /api/inventory/by-game — delete ALL inventory tickets for a game name
inventoryRouter.delete('/by-game', (req, res) => {
  try {
    const { game_name } = req.body;
    if (!game_name) return res.status(400).json({ error: 'game_name required' });
    const result = db.prepare('DELETE FROM inventory WHERE game_name = ?').run(game_name);
    res.json({ deleted: result.changes, game_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/rename-game — rename a game across inventory + games table
inventoryRouter.put('/rename-game', (req, res) => {
  try {
    const { old_name, new_name, new_date } = req.body;
    if (!old_name || !new_name) return res.status(400).json({ error: 'old_name and new_name required' });
    db.prepare('UPDATE inventory SET game_name = ? WHERE game_name = ?').run(new_name, old_name);
    if (new_date !== undefined) {
      db.prepare('UPDATE inventory SET game_date = ? WHERE game_name = ?').run(new_date || null, new_name);
    }
    res.json({ success: true, old_name, new_name });
  } catch (err) {
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
    const { buyer_name, buyer_email, buyer_phone, status, notes, game_id, game_name, order_number, sales_channel, total_amount } = req.body;

    if (status && !VALID_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    const result = db.prepare(`
      INSERT INTO orders (buyer_name, buyer_email, buyer_phone, status, notes, game_id, game_name, order_number, sales_channel, total_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      parseFloat(total_amount) || 0,
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

    const { buyer_name, buyer_email, buyer_phone, status, notes, game_id, game_name, order_number, sales_channel, total_amount } = req.body;

    if (status && !VALID_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    // Use provided total_amount if given; otherwise keep existing
    const total = total_amount !== undefined
      ? (parseFloat(total_amount) || 0)
      : (existing.total_amount || 0);

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

// GET /api/orders/:id/items
ordersRouter.get('/:id/items', (req, res) => {
  try {
    const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const items = db.prepare(`
      SELECT oi.id AS item_id, oi.sell_price, oi.inventory_id,
             i.seat, i.category, i.member_number, i.status, i.buy_price, i.notes
      FROM order_items oi
      LEFT JOIN inventory i ON i.id = oi.inventory_id
      WHERE oi.order_id = ?
      ORDER BY i.category, i.seat
    `).all(req.params.id);
    res.json(items);
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

    if (inventory_id) {
      const invItem = db.prepare('SELECT * FROM inventory WHERE id = ?').get(inventory_id);
      if (!invItem) return res.status(404).json({ error: 'Inventory item not found' });

      const linked = db.prepare(
        'SELECT COUNT(*) AS n FROM order_items WHERE inventory_id = ? AND order_id != ?'
      ).get(inventory_id, req.params.id).n;
      if (linked > 0) {
        return res.status(409).json({ error: 'Inventory item is already linked to another order' });
      }

      const result = db.prepare(
        'INSERT INTO order_items (order_id, inventory_id, sell_price) VALUES (?, ?, ?)'
      ).run(req.params.id, inventory_id, parseFloat(sell_price) || 0);

      db.prepare("UPDATE inventory SET status = 'Reserved' WHERE id = ?").run(inventory_id);

      res.status(201).json(getOrderItemRow(result.lastInsertRowid));
    } else {
      // Placeholder item (no inventory linked)
      const result = db.prepare(
        'INSERT INTO order_items (order_id, inventory_id, sell_price) VALUES (?, NULL, ?)'
      ).run(req.params.id, parseFloat(sell_price) || 0);

      res.status(201).json(getOrderItemRow(result.lastInsertRowid));
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id/items/:item_id
ordersRouter.put('/:id/items/:item_id', (req, res) => {
  try {
    const orderItem = db.prepare(
      'SELECT * FROM order_items WHERE id = ? AND order_id = ?'
    ).get(req.params.item_id, req.params.id);
    if (!orderItem) return res.status(404).json({ error: 'Order item not found' });

    const { sell_price, inventory_id } = req.body;
    const newInventoryId = inventory_id !== undefined ? (inventory_id || null) : orderItem.inventory_id;
    const newSellPrice   = sell_price   !== undefined ? (parseFloat(sell_price) || 0) : orderItem.sell_price;

    const oldInventoryId = orderItem.inventory_id;
    const inventoryChanging = newInventoryId !== oldInventoryId;

    if (inventoryChanging) {
      // Revert old inventory item to Available
      if (oldInventoryId) {
        db.prepare("UPDATE inventory SET status = 'Available' WHERE id = ? AND status = 'Reserved'").run(oldInventoryId);
      }
      // Reserve new inventory item
      if (newInventoryId) {
        const invItem = db.prepare('SELECT id FROM inventory WHERE id = ?').get(newInventoryId);
        if (!invItem) return res.status(404).json({ error: 'Inventory item not found' });

        const linked = db.prepare(
          'SELECT COUNT(*) AS n FROM order_items WHERE inventory_id = ? AND order_id != ?'
        ).get(newInventoryId, req.params.id).n;
        if (linked > 0) {
          return res.status(409).json({ error: 'Inventory item is already linked to another order' });
        }

        db.prepare("UPDATE inventory SET status = 'Reserved' WHERE id = ?").run(newInventoryId);
      }
    }

    db.prepare(
      'UPDATE order_items SET inventory_id = ?, sell_price = ? WHERE id = ?'
    ).run(newInventoryId, newSellPrice, req.params.item_id);

    res.json(getOrderItemRow(req.params.item_id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/:id/items/:item_id
ordersRouter.delete('/:id/items/:item_id', (req, res) => {
  try {
    const orderItem = db.prepare(
      'SELECT * FROM order_items WHERE id = ? AND order_id = ?'
    ).get(req.params.item_id, req.params.id);
    if (!orderItem) return res.status(404).json({ error: 'Order item not found' });

    db.prepare('DELETE FROM order_items WHERE id = ?').run(req.params.item_id);

    if (orderItem.inventory_id) {
      db.prepare("UPDATE inventory SET status = 'Available' WHERE id = ? AND status = 'Reserved'").run(orderItem.inventory_id);
    }

    res.json({ success: true });
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
