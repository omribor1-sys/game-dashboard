const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/data/games.db');
const orders = db.prepare("SELECT order_number,total_amount,buyer_name,sales_channel,ticket_quantity FROM orders WHERE game_name='Arsenal vs Fulham' AND deleted_at IS NULL ORDER BY sales_channel,order_number").all();
orders.forEach(o => console.log(o.order_number + '|' + o.sales_channel + '|' + o.ticket_quantity + 'tx|' + o.total_amount + '|' + (o.buyer_name||'?')));
const t = db.prepare("SELECT COUNT(*) as cnt, ROUND(SUM(total_amount),2) as total FROM orders WHERE game_name='Arsenal vs Fulham' AND deleted_at IS NULL").get();
console.log('TOTAL: ' + t.cnt + ' orders, ' + t.total);
