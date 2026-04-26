// Temporary one-off import script — delete after use
const db = require('./database');

// Check existing Fulham game name
const existing = db.prepare("SELECT game_name, game_datetime FROM orders WHERE game_name LIKE '%Fulham%' LIMIT 1").get();
console.log('Existing Fulham row:', JSON.stringify(existing));

// Check if 287005069 already exists
const exists = db.prepare("SELECT id, order_number, total_amount FROM orders WHERE order_number = '287005069'").get();
console.log('Order 287005069:', JSON.stringify(exists));

if (exists) {
  console.log('Order already exists — nothing to do.');
  process.exit(0);
}

const gameName = existing ? existing.game_name : 'Fulham FC vs Aston Villa FC';
const gameDatetime = existing ? existing.game_datetime : 'Saturday, 19/04/2026, 17:30';

db.prepare(`
  INSERT INTO orders
    (buyer_name, buyer_email, status, notes, game_name, order_number, sales_channel,
     total_amount, ticket_quantity, category, row_seat, game_datetime)
  VALUES (?, ?, 'Confirmed', NULL, ?, ?, 'StubHub', ?, ?, NULL, NULL, ?)
`).run(
  'Callum Oliver Duguid',
  'francisco.baez@alumnos.udg.mx',
  gameName,
  '287005069',
  235.00,
  2,
  gameDatetime
);

console.log('✅ Inserted order 287005069: Callum Oliver Duguid, Fulham vs Aston Villa, €235.00');

// Verify
const inserted = db.prepare("SELECT * FROM orders WHERE order_number = '287005069'").get();
console.log('Verified:', JSON.stringify(inserted));
