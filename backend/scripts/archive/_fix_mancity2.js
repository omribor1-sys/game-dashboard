const db = require('./database');
function round2(n) { return Math.round(n * 100) / 100; }

// 1. Soft-delete the 2 duplicate orders with wrong order numbers
const wrongOrders = ['286002519', '286993597'];
for (const on of wrongOrders) {
  const r = db.prepare("UPDATE orders SET deleted_at=datetime('now') WHERE order_number=? AND deleted_at IS NULL").run(on);
  console.log(`🗑️  Deleted wrong order ${on} (${r.changes} row)`);
}

// 2. Verify remaining orders
const remaining = db.prepare(`
  SELECT order_number, ticket_quantity, total_amount, buyer_name
  FROM orders WHERE game_name LIKE '%Southampton%' AND deleted_at IS NULL ORDER BY order_number
`).all();
console.log('\nRemaining orders:');
remaining.forEach(r => console.log(`  ${r.order_number} | ${r.ticket_quantity}tx | €${r.total_amount} | ${r.buyer_name || '—'}`));
const totalRev = round2(remaining.reduce((s,r) => s+r.total_amount, 0));
console.log(`Total: ${remaining.length} orders, €${totalRev}`);

// 3. Re-close game with correct figures
const GAME = 'Manchester City vs Southampton - FA Cup Semi-Final';
const total_ticket_cost = 586.50;
const eli_cost = 0;
const totalAllCosts = round2(total_ticket_cost + eli_cost);
const netProfit = round2(totalRev - totalAllCosts);
const marginPercent = totalRev > 0 ? round2((netProfit / totalRev) * 100) : 0;
const ticketsSold = remaining.reduce((s,r) => s + (r.ticket_quantity||0), 0);

db.prepare(`UPDATE games SET total_revenue=?,total_ticket_cost=?,eli_cost=?,total_all_costs=?,net_profit=?,margin_percent=?,tickets_sold=?,completed=1 WHERE name=?`)
  .run(totalRev, total_ticket_cost, eli_cost, totalAllCosts, netProfit, marginPercent, ticketsSold, GAME);

console.log(`\n✅ Re-closed: "${GAME}"`);
console.log(`   Revenue: €${totalRev} | Cost: €${totalAllCosts} | Profit: €${netProfit} (${marginPercent}%) | Tickets: ${ticketsSold}`);
