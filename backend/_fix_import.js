// Fix the wrongly-inserted order 287005069
const db = require('./database');

// Get the correct game name from existing Fulham vs Aston Villa orders
const existing = db.prepare(
  "SELECT order_number, game_name, game_datetime, total_amount FROM orders WHERE order_number IN ('287028599','287001074','287006667')"
).all();
console.log('Existing correct orders:', JSON.stringify(existing, null, 2));

// Get what we inserted wrongly
const wrong = db.prepare("SELECT * FROM orders WHERE order_number = '287005069'").get();
console.log('Current 287005069:', JSON.stringify(wrong));

if (!wrong) {
  console.log('Order not found!');
  process.exit(1);
}

// Get correct game_name from one of the existing orders
const correctRef = existing[0];
if (!correctRef) {
  console.log('No reference order found!');
  process.exit(1);
}

const correctGameName = correctRef.game_name;
const correctDatetime = correctRef.game_datetime;
console.log('Correct game_name:', correctGameName);
console.log('Correct game_datetime:', correctDatetime);

// Update the wrongly-inserted order
db.prepare(
  "UPDATE orders SET game_name = ?, game_datetime = ? WHERE order_number = '287005069'"
).run(correctGameName, correctDatetime);

// Verify
const fixed = db.prepare("SELECT order_number, game_name, game_datetime, total_amount, buyer_email FROM orders WHERE order_number = '287005069'").get();
console.log('Fixed order:', JSON.stringify(fixed, null, 2));
