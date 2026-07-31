const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/data/games.db');

// Fix the 2 orders inserted with wrong (full FC) game names
// Correct game names are the short forms already used in DB

// 1. Fix 287032691: "Chelsea FC vs Nottingham Forest FC" → "Chelsea vs Nottingham Forest"
const r1 = db.prepare(`UPDATE orders SET game_name='Chelsea vs Nottingham Forest', game_datetime='Mon, 04/05/2026, 15:00' WHERE order_number='287032691' AND deleted_at IS NULL`).run();
console.log(`287032691: updated ${r1.changes} row → "Chelsea vs Nottingham Forest"`);

// 2. Fix 287032809: "Arsenal FC vs Burnley FC" → "Arsenal vs Burnley"
const r2 = db.prepare(`UPDATE orders SET game_name='Arsenal vs Burnley', game_datetime='Mon, 18/05/2026, 20:00' WHERE order_number='287032809' AND deleted_at IS NULL`).run();
console.log(`287032809: updated ${r2.changes} row → "Arsenal vs Burnley"`);

// Verify
const verify = db.prepare(`SELECT order_number, game_name, game_datetime, buyer_name, total_amount FROM orders WHERE order_number IN ('287032691','287032809') AND deleted_at IS NULL`).all();
console.log('\nVerification:');
verify.forEach(r => console.log(`  ${r.order_number} | ${r.game_name} | ${r.game_datetime} | ${r.buyer_name} | €${r.total_amount}`));

// Now check remaining orders that were skipped - are there truly missing ones?
// Orders that match by number but may have DIFFERENT game names in DB
const checkOrders = ['287028753','287031201','287032282','287024164'];
const existing = db.prepare(`SELECT order_number, game_name, game_datetime FROM orders WHERE order_number IN ('287028753','287031201','287032282','287024164') AND deleted_at IS NULL`).all();
console.log('\nCheck previously-skipped orders in DB:');
existing.forEach(r => console.log(`  ${r.order_number} | ${r.game_name} | ${r.game_datetime}`));

// Also check all Arsenal vs Fulham orders count
const avf = db.prepare(`SELECT COUNT(*) as cnt, ROUND(SUM(total_amount),2) as total FROM orders WHERE game_name='Arsenal vs Fulham' AND deleted_at IS NULL`).get();
console.log(`\nArsenal vs Fulham in DB: ${avf.cnt} orders, €${avf.total}`);

const cvnf = db.prepare(`SELECT COUNT(*) as cnt, ROUND(SUM(total_amount),2) as total FROM orders WHERE game_name='Chelsea vs Nottingham Forest' AND deleted_at IS NULL`).get();
console.log(`Chelsea vs Nottingham Forest in DB: ${cvnf.cnt} orders, €${cvnf.total}`);

const avb = db.prepare(`SELECT COUNT(*) as cnt, ROUND(SUM(total_amount),2) as total FROM orders WHERE game_name='Arsenal vs Burnley' AND deleted_at IS NULL`).get();
console.log(`Arsenal vs Burnley in DB: ${avb.cnt} orders, €${avb.total}`);
