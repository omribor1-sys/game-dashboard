const db = require('./database');
const r = db.prepare("UPDATE orders SET game_datetime='Sat, 25/04/2026, 17:15' WHERE game_datetime='Fri, 25/04/2026, 17:15' AND deleted_at IS NULL").run();
console.log('Fixed ' + r.changes + ' Man City orders (Fri → Sat)');
const check = db.prepare("SELECT game_datetime, COUNT(*) as cnt FROM orders WHERE game_name LIKE '%Southampton%' AND deleted_at IS NULL GROUP BY game_datetime").all();
check.forEach(c => console.log('  ' + c.game_datetime + ' — ' + c.cnt + ' orders'));
