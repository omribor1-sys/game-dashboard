const db = require('./database');
function round2(n) { return Math.round(n * 100) / 100; }

const game_name = 'Arsenal vs Newcastle United';
const total_ticket_cost = 3168.42;
const eli_cost = 533.68;
const game_date = '2026-04-22';

const revRow = db.prepare(`SELECT COALESCE(SUM(total_amount),0) AS rev FROM orders WHERE game_name=? AND deleted_at IS NULL AND (status IS NULL OR status!='Cancelled')`).get(game_name);
const totalRevenue = round2(revRow.rev);

const tktRow = db.prepare(`SELECT COALESCE(SUM(ticket_quantity),COUNT(*)) AS tkt FROM orders WHERE game_name=? AND deleted_at IS NULL AND (status IS NULL OR status!='Cancelled')`).get(game_name);
const ticketsSold = tktRow.tkt || 0;

const totalAllCosts = round2(total_ticket_cost + eli_cost);
const netProfit = round2(totalRevenue - totalAllCosts);
const marginPercent = totalRevenue > 0 ? round2((netProfit / totalRevenue) * 100) : 0;

const existing = db.prepare('SELECT id FROM games WHERE name=?').get(game_name);
if (existing) {
  db.prepare(`UPDATE games SET total_revenue=?,total_ticket_cost=?,eli_cost=?,total_all_costs=?,net_profit=?,margin_percent=?,tickets_sold=?,completed=1,date=COALESCE(?,date) WHERE id=?`)
    .run(totalRevenue, total_ticket_cost, eli_cost, totalAllCosts, netProfit, marginPercent, ticketsSold, game_date, existing.id);
} else {
  db.prepare(`INSERT INTO games (name,date,total_revenue,total_ticket_cost,eli_cost,total_all_costs,net_profit,margin_percent,tickets_sold,completed) VALUES (?,?,?,?,?,?,?,?,?,1)`)
    .run(game_name, game_date, totalRevenue, total_ticket_cost, eli_cost, totalAllCosts, netProfit, marginPercent, ticketsSold);
}

console.log(`✅ CLOSED: "${game_name}"`);
console.log(`   Revenue: €${totalRevenue} | Ticket cost: €${total_ticket_cost} | Eli: €${eli_cost} | Total cost: €${totalAllCosts}`);
console.log(`   Net Profit: €${netProfit} (${marginPercent}%) | Tickets: ${ticketsSold}`);
