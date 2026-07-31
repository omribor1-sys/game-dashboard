const db = require('./database');
function round2(n) { return Math.round(n * 100) / 100; }

// 1. Insert MENI order for Roderick Duguid (not yet in DB)
const existing = db.prepare("SELECT id FROM orders WHERE order_number='MENI-FVA-1' AND deleted_at IS NULL").get();
if (!existing) {
  db.prepare(`
    INSERT INTO orders (order_number, game_name, game_datetime, ticket_quantity, total_amount,
      buyer_name, buyer_email, sales_channel, category, row_seat)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'MENI-FVA-1',
    'Fulham vs Aston Villa',
    'Sat, 19/04/2026, 17:30',
    2,
    166.00,
    'Roderick Kenneth Duguid',
    'Roderick8@avitals.club',
    'MENI',
    null,
    'H3-S-48, H3-S-49'
  );
  console.log('✅ Inserted MENI order for Roderick Duguid — €166.00 (2 tickets)');
} else {
  console.log('⚠️  MENI order already exists, skipping');
}

// 2. Close the game
const game_name = 'Fulham vs Aston Villa';
const total_ticket_cost = 1062.60;
const eli_cost = 0;
const game_date = '2026-04-19';

const revRow = db.prepare(`SELECT COALESCE(SUM(total_amount),0) AS rev FROM orders WHERE game_name=? AND deleted_at IS NULL AND (status IS NULL OR status!='Cancelled')`).get(game_name);
const totalRevenue = round2(revRow.rev);

const tktRow = db.prepare(`SELECT COALESCE(SUM(ticket_quantity),COUNT(*)) AS tkt FROM orders WHERE game_name=? AND deleted_at IS NULL AND (status IS NULL OR status!='Cancelled')`).get(game_name);
const ticketsSold = tktRow.tkt || 0;

const totalAllCosts = round2(total_ticket_cost + eli_cost);
const netProfit = round2(totalRevenue - totalAllCosts);
const marginPercent = totalRevenue > 0 ? round2((netProfit / totalRevenue) * 100) : 0;

const existingGame = db.prepare('SELECT id FROM games WHERE name=?').get(game_name);
if (existingGame) {
  db.prepare(`UPDATE games SET total_revenue=?,total_ticket_cost=?,eli_cost=?,total_all_costs=?,net_profit=?,margin_percent=?,tickets_sold=?,completed=1,date=COALESCE(?,date) WHERE id=?`)
    .run(totalRevenue, total_ticket_cost, eli_cost, totalAllCosts, netProfit, marginPercent, ticketsSold, game_date, existingGame.id);
} else {
  db.prepare(`INSERT INTO games (name,date,total_revenue,total_ticket_cost,eli_cost,total_all_costs,net_profit,margin_percent,tickets_sold,completed) VALUES (?,?,?,?,?,?,?,?,?,1)`)
    .run(game_name, game_date, totalRevenue, total_ticket_cost, eli_cost, totalAllCosts, netProfit, marginPercent, ticketsSold);
}

console.log(`✅ CLOSED: "${game_name}"`);
console.log(`   Revenue: €${totalRevenue} | Cost: €${totalAllCosts} | Net Profit: €${netProfit} (${marginPercent}%) | Tickets: ${ticketsSold}`);
