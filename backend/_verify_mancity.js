const db = require('./database');

console.log('=== Man City vs Southampton — all orders in DB ===');
const rows = db.prepare(`
  SELECT order_number, game_name, game_datetime, ticket_quantity, total_amount, buyer_name, buyer_email, sales_channel
  FROM orders WHERE game_name LIKE '%Southampton%' AND deleted_at IS NULL ORDER BY order_number
`).all();
rows.forEach(r => console.log(`  ${r.order_number} | ${r.ticket_quantity}tx | €${r.total_amount} | ${r.buyer_name} | ${r.sales_channel || ''}`));
console.log(`Total: ${rows.length} orders, €${rows.reduce((s,r)=>s+r.total_amount,0).toFixed(2)}`);

console.log('\n=== Chelsea vs Leeds — all orders in DB ===');
const rows2 = db.prepare(`
  SELECT order_number, game_name, game_datetime, ticket_quantity, total_amount, buyer_name
  FROM orders WHERE game_name LIKE '%Leeds%' AND deleted_at IS NULL ORDER BY order_number
`).all();
rows2.forEach(r => console.log(`  ${r.order_number} | ${r.ticket_quantity}tx | €${r.total_amount} | ${r.buyer_name}`));
console.log(`Total: ${rows2.length} orders, €${rows2.reduce((s,r)=>s+r.total_amount,0).toFixed(2)}`);
