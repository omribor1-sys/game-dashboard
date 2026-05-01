const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/data/games.db');

// Full summary of all games with pending orders
const games = db.prepare(`
  SELECT game_name, game_datetime, COUNT(*) as cnt, ROUND(SUM(total_amount),2) as total
  FROM orders
  WHERE deleted_at IS NULL AND (status IS NULL OR status != 'Cancelled')
  GROUP BY game_name
  ORDER BY game_datetime DESC
`).all();

console.log('=== All games with orders in DB ===');
games.forEach(g => console.log(`  ${g.game_datetime || '?'} | ${g.game_name} | ${g.cnt} orders | €${g.total}`));

// Check Arsenal vs Fulham specifically
console.log('\n=== Arsenal vs Fulham orders ===');
const avf = db.prepare(`SELECT order_number, ticket_quantity, total_amount, buyer_name FROM orders WHERE game_name='Arsenal vs Fulham' AND deleted_at IS NULL ORDER BY order_number`).all();
avf.forEach(r => console.log(`  ${r.order_number} | ${r.ticket_quantity}tx | €${r.total_amount} | ${r.buyer_name}`));
console.log(`Total: ${avf.length} orders, €${avf.reduce((s,r)=>s+r.total_amount,0).toFixed(2)}`);
