// LOCAL DEV ONLY — seeds a few orders across two seasons to verify the season filter.
// Safe: touches backend/games.db (local dev), never production (/data/games.db on Fly).
const db = require('./database');

const rows = [
  // 2026/27 (current) — future games, StubHub datetime format
  ['Arsenal vs Borussia Dortmund - Emirates Cup', 'Sun, 09/08/2026, 14:00', 'Mustafa Patel', 172.48, 2, '287768025'],
  ['Chelsea vs Real Sociedad',                     'Sat, 15/08/2026, 14:00', 'Andrea Santos',  287.76, 3, '287767478'],
  ['Arsenal vs Chelsea',                           'Sun, 06/09/2026, 16:30', 'Mubako Jordan',  604.56, 3, '287870773'],
  // 2025/26 (previous season) — May 2026 games
  ['Tottenham vs Everton',   'Sat, 24/05/2026, 15:00', 'Old Buyer A', 4048.00, 23, 'OLD-24051'],
  ['Arsenal vs Burnley',     'Mon, 18/05/2026, 20:00', 'Old Buyer B', 807.00,   3, 'OLD-18051'],
  ['Chelsea vs Tottenham',   'Tue, 19/05/2026, 20:00', 'Old Buyer C', 464.88,   4, 'OLD-19051'],
];

const stmt = db.prepare(`INSERT INTO orders
  (buyer_name, status, game_name, order_number, sales_channel, total_amount, ticket_quantity, category, row_seat, game_datetime)
  VALUES (?, 'Confirmed', ?, ?, 'StubHub', ?, ?, 'Shortside Upper', 'Row A | Seats 1,2', ?)`);

for (const [name, dt, buyer, total, qty, num] of rows) {
  const exists = db.prepare('SELECT 1 FROM orders WHERE order_number = ?').get(num);
  if (exists) { console.log('skip', num); continue; }
  stmt.run(buyer, name, num, total, qty, dt);
  console.log('seeded', num, name);
}
console.log('total orders now:', db.prepare('SELECT COUNT(*) c FROM orders').get().c);
