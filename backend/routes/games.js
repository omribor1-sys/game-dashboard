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
    const games = db.prepare(`
      SELECT id, name, date, uploaded_at, total_revenue, total_ticket_cost,
        eli_cost, total_all_costs, net_profit, margin_percent, tickets_sold
      FROM games ORDER BY date DESC, uploaded_at DESC
    `).all();

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

// GET /api/games/:id
router.get('/:id', (req, res) => {
  try {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const extraCosts = db.prepare(
      'SELECT * FROM extra_costs WHERE game_id = ? ORDER BY id'
    ).all(req.params.id);

    game.status_breakdown = JSON.parse(game.status_breakdown || '{}');
    game.issues = JSON.parse(game.issues || '{}');
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
    updated.status_breakdown = JSON.parse(updated.status_breakdown || '{}');
    updated.issues = JSON.parse(updated.issues || '{}');
    updated.extra_costs = db.prepare(
      'SELECT * FROM extra_costs WHERE game_id = ? ORDER BY id'
    ).all(req.params.id);

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/games/:id
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Game not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = router;
