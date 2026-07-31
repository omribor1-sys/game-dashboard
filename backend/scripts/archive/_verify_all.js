const db = require('./database');

const games = [
  { label: 'Arsenal vs Newcastle (22/04)', like: '%Newcastle%Arsenal%' },
  { label: 'Arsenal vs Newcastle (22/04)', like: '%Arsenal%Newcastle%' },
  { label: 'Fulham vs Aston Villa (19/04)', like: '%Fulham%Aston%' },
  { label: 'Fulham vs Aston Villa (19/04)', like: '%Aston%Fulham%' },
  { label: 'Man City vs Southampton', like: '%Southampton%' },
];

const seen = new Set();
for (const g of games) {
  const rows = db.prepare(
    "SELECT order_number, game_name, game_datetime, total_amount, ticket_quantity FROM orders WHERE game_name LIKE ? AND deleted_at IS NULL ORDER BY order_number"
  ).all(g.like);
  for (const r of rows) {
    if (seen.has(r.order_number)) continue;
    seen.add(r.order_number);
    console.log(`[${g.label}] ${r.order_number} | "${r.game_name}" | "${r.game_datetime}" | €${r.total_amount} | ${r.ticket_quantity}tx`);
  }
}

// Also check all distinct game_names in DB
console.log('\n=== All game_names with orders in DB ===');
const allGames = db.prepare("SELECT game_name, game_datetime, COUNT(*) as cnt, SUM(total_amount) as total FROM orders WHERE deleted_at IS NULL GROUP BY game_name, game_datetime ORDER BY game_name").all();
allGames.forEach(g => console.log(`  "${g.game_name}" | "${g.game_datetime}" | ${g.cnt} orders | €${g.total?.toFixed(2)}`));
