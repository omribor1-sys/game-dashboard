const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { parseGameFile } = require('../utils/parser');

const upload = multer({
  dest: path.join(__dirname, '../uploads/'),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) cb(null, true);
    else cb(new Error('Only Excel/CSV files are allowed'));
  },
});

// POST /api/games/upload
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    const { name, date, tabName } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!name) return res.status(400).json({ error: 'Game name is required' });

    // Parse extra costs from JSON string
    let extraCosts = [];
    try {
      extraCosts = JSON.parse(req.body.extraCosts || '[]');
    } catch (_) {}

    const parsed = parseGameFile(req.file.path, tabName);

    // Calculate totals
    const extraTotal = extraCosts.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    const totalAllCosts = round2(parsed.totalTicketCost + parsed.eliCost + extraTotal);
    const netProfit = round2(parsed.totalRevenue - totalAllCosts);
    const marginPercent = parsed.totalRevenue > 0
      ? round2((netProfit / parsed.totalRevenue) * 100)
      : 0;

    const stmt = db.prepare(`
      INSERT INTO games (name, date, tab_name, total_revenue, total_ticket_cost,
        eli_cost, total_all_costs, net_profit, margin_percent,
        tickets_sold, avg_buy_price, avg_sell_price, status_breakdown, issues)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name, date || null, parsed.sheetUsed,
      parsed.totalRevenue, parsed.totalTicketCost,
      parsed.eliCost, totalAllCosts, netProfit, marginPercent,
      parsed.ticketsSold, parsed.avgBuyPrice, parsed.avgSellPrice,
      JSON.stringify(parsed.statusBreakdown),
      JSON.stringify(parsed.issues)
    );

    const gameId = result.lastInsertRowid;

    if (extraCosts.length > 0) {
      const costStmt = db.prepare(
        'INSERT INTO extra_costs (game_id, label, amount) VALUES (?, ?, ?)'
      );
      for (const cost of extraCosts) {
        if (cost.label) costStmt.run(gameId, cost.label, parseFloat(cost.amount) || 0);
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ id: gameId, name, netProfit, marginPercent });
  } catch (err) {
    console.error('Upload error:', err);
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/games
router.get('/', (req, res) => {
  try {
    const gamesFromTable = db.prepare(`
      SELECT id, name, date, uploaded_at, total_revenue, total_ticket_cost,
        eli_cost, total_all_costs, net_profit, margin_percent, tickets_sold
      FROM games ORDER BY date DESC, uploaded_at DESC
    `).all();

    // Add source flag to games-table entries
    const gamesWithSource = gamesFromTable.map(g => ({ ...g, source: 'games' }));

    // Get names of games already in the games table (for deduplication)
    const gamesTableNames = new Set(gamesFromTable.map(g => g.name));

    // Aggregate inventory-only games: games that exist in inventory but NOT in games table
    const inventoryGames = db.prepare(`
      SELECT
        game_name AS name,
        game_date AS date,
        COUNT(*) AS tickets_sold,
        SUM(CASE WHEN status IN ('Sold','Delivered') THEN sell_price ELSE 0 END) AS total_revenue,
        SUM(buy_price) AS total_all_costs
      FROM inventory
      GROUP BY game_name
      ORDER BY game_date DESC, game_name
    `).all();

    const inventoryOnlyGames = inventoryGames
      .filter(g => !gamesTableNames.has(g.name))
      .map(g => {
        const revenue = g.total_revenue || 0;
        const costs = g.total_all_costs || 0;
        const netProfit = round2(revenue - costs);
        const marginPercent = revenue > 0 ? round2((netProfit / revenue) * 100) : 0;
        return {
          id: null,
          name: g.name,
          date: g.date,
          uploaded_at: null,
          total_revenue: round2(revenue),
          total_ticket_cost: round2(costs),
          eli_cost: 0,
          total_all_costs: round2(costs),
          net_profit: netProfit,
          margin_percent: marginPercent,
          tickets_sold: g.tickets_sold || 0,
          source: 'inventory',
        };
      });

    const games = [...gamesWithSource, ...inventoryOnlyGames].sort((a, b) => {
      const da = a.date || '';
      const db2 = b.date || '';
      if (da > db2) return -1;
      if (da < db2) return 1;
      return 0;
    });

    const summary = {
      totalRevenue: games.reduce((s, g) => s + (g.total_revenue || 0), 0),
      totalCosts: games.reduce((s, g) => s + (g.total_all_costs || 0), 0),
      netProfit: games.reduce((s, g) => s + (g.net_profit || 0), 0),
      totalTickets: games.reduce((s, g) => s + (g.tickets_sold || 0), 0),
      gameCount: games.length,
    };
    summary.avgMargin = summary.totalRevenue > 0
      ? round2((summary.netProfit / summary.totalRevenue) * 100)
      : 0;

    res.json({ games, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/games/by-name/:name
router.get('/by-name/:name', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const game = db.prepare('SELECT * FROM games WHERE name = ?').get(name);
    if (!game) return res.json({ id: null, name, source: 'inventory' });
    res.json(game);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/games/:id
router.get('/:id', (req, res) => {
  try {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const extraCosts = db.prepare(
      'SELECT * FROM extra_costs WHERE game_id = ? ORDER BY id'
    ).all(req.params.id);

    game.status_breakdown = safeParse(game.status_breakdown, {});
    game.issues = safeParse(game.issues, {});
    game.extra_costs = extraCosts;

    res.json(game);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/games/:id/costs
router.put('/:id/costs', (req, res) => {
  try {
    const { extraCosts } = req.body;
    const game = db.prepare(
      'SELECT total_revenue, total_ticket_cost, eli_cost FROM games WHERE id = ?'
    ).get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Replace extra costs
    db.prepare('DELETE FROM extra_costs WHERE game_id = ?').run(req.params.id);

    const costStmt = db.prepare(
      'INSERT INTO extra_costs (game_id, label, amount) VALUES (?, ?, ?)'
    );
    let extraTotal = 0;
    for (const cost of (extraCosts || [])) {
      if (cost.label) {
        const amt = parseFloat(cost.amount) || 0;
        costStmt.run(req.params.id, cost.label, amt);
        extraTotal += amt;
      }
    }

    const totalAllCosts = round2(game.total_ticket_cost + game.eli_cost + extraTotal);
    const netProfit = round2(game.total_revenue - totalAllCosts);
    const marginPercent = game.total_revenue > 0
      ? round2((netProfit / game.total_revenue) * 100)
      : 0;

    db.prepare(`
      UPDATE games SET total_all_costs = ?, net_profit = ?, margin_percent = ? WHERE id = ?
    `).run(totalAllCosts, netProfit, marginPercent, req.params.id);

    const updated = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    updated.status_breakdown = safeParse(updated.status_breakdown, {});
    updated.issues = safeParse(updated.issues, {});
    updated.extra_costs = db.prepare(
      'SELECT * FROM extra_costs WHERE game_id = ? ORDER BY id'
    ).all(req.params.id);

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/games/:id/notes
router.put('/:id/notes', (req, res) => {
  try {
    const { notes } = req.body;
    const result = db.prepare('UPDATE games SET notes = ? WHERE id = ?').run(notes || '', req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Game not found' });
    res.json({ success: true, notes: notes || '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/games/:id
router.put('/:id', (req, res) => {
  try {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const { name, date } = req.body;
    const newName = (name !== undefined ? name : game.name) || game.name;
    const newDate = date !== undefined ? (date || null) : game.date;

    db.prepare('UPDATE games SET name = ?, date = ? WHERE id = ?').run(newName, newDate, req.params.id);

    const updated = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/games/:id
router.delete('/:id', (req, res) => {
  try {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Delete related inventory tickets first
    db.prepare('DELETE FROM inventory WHERE game_name = ?').run(game.name);

    db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/games/:id/inventory
router.get('/:id/inventory', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT i.*, oi.order_id
      FROM inventory i
      LEFT JOIN order_items oi ON oi.inventory_id = i.id
      WHERE i.game_name = (SELECT name FROM games WHERE id = ?)
      ORDER BY i.category, i.seat
    `).all(req.params.id);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/games/:id/orders
router.get('/:id/orders', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT o.*, COUNT(oi.id) AS item_count, COALESCE(SUM(oi.sell_price),0) AS items_total
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.game_name = (SELECT name FROM games WHERE id = ?) OR o.game_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `).all(req.params.id, req.params.id);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/games/:id/summary
router.put('/:id/summary', (req, res) => {
  try {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const totalRevenue = parseFloat(req.body.total_revenue) || 0;
    const totalTicketCost = parseFloat(req.body.total_ticket_cost) || 0;
    const eliCost = parseFloat(req.body.eli_cost) || 0;
    const notes = req.body.notes !== undefined ? req.body.notes : game.notes;

    const extraSum = db.prepare(
      'SELECT COALESCE(SUM(amount),0) AS s FROM extra_costs WHERE game_id = ?'
    ).get(req.params.id).s;

    const totalAllCosts = round2(totalTicketCost + eliCost + extraSum);
    const netProfit = round2(totalRevenue - totalAllCosts);
    const marginPercent = totalRevenue > 0 ? round2((netProfit / totalRevenue) * 100) : 0;

    db.prepare(`
      UPDATE games
      SET total_revenue = ?, total_ticket_cost = ?, eli_cost = ?, notes = ?,
          total_all_costs = ?, net_profit = ?, margin_percent = ?
      WHERE id = ?
    `).run(totalRevenue, totalTicketCost, eliCost, notes,
           totalAllCosts, netProfit, marginPercent, req.params.id);

    const updated = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    updated.status_breakdown = safeParse(updated.status_breakdown, {});
    updated.issues = safeParse(updated.issues, {});
    updated.extra_costs = db.prepare(
      'SELECT * FROM extra_costs WHERE game_id = ? ORDER BY id'
    ).all(req.params.id);

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/games/:id/summary/upload
router.post('/:id/summary/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Game not found' });
    }

    const tabName = req.body.tab_name || undefined;
    const parsed = parseGameFile(req.file.path, tabName);
    fs.unlinkSync(req.file.path);

    const extraSum = db.prepare(
      'SELECT COALESCE(SUM(amount),0) AS s FROM extra_costs WHERE game_id = ?'
    ).get(req.params.id).s;

    const totalAllCosts = round2(parsed.totalTicketCost + parsed.eliCost + extraSum);
    const netProfit = round2(parsed.totalRevenue - totalAllCosts);
    const marginPercent = parsed.totalRevenue > 0
      ? round2((netProfit / parsed.totalRevenue) * 100)
      : 0;

    db.prepare(`
      UPDATE games
      SET total_revenue = ?, total_ticket_cost = ?, eli_cost = ?, tab_name = ?,
          total_all_costs = ?, net_profit = ?, margin_percent = ?
      WHERE id = ?
    `).run(parsed.totalRevenue, parsed.totalTicketCost, parsed.eliCost, parsed.sheetUsed,
           totalAllCosts, netProfit, marginPercent, req.params.id);

    const updated = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    updated.status_breakdown = safeParse(updated.status_breakdown, {});
    updated.issues = safeParse(updated.issues, {});
    updated.extra_costs = db.prepare(
      'SELECT * FROM extra_costs WHERE game_id = ? ORDER BY id'
    ).all(req.params.id);

    res.json(updated);
  } catch (err) {
    console.error(err);
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    res.status(500).json({ error: err.message });
  }
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

function safeParse(val, fallback = {}) {
  if (!val || val === 'null' || val === 'undefined') return fallback;
  try {
    const parsed = JSON.parse(val);
    return parsed ?? fallback;
  } catch (_) {
    return fallback;
  }
}

module.exports = router;
