// Import Manchester City vs Southampton FA Cup Semi Final orders
const db = require('./database');

// Check if there are existing orders for this game to get the canonical name
const existingGame = db.prepare(
  "SELECT game_name, game_datetime FROM orders WHERE game_name LIKE '%Southampton%' OR game_name LIKE '%Man%City%' OR game_name LIKE '%Manchester%City%' LIMIT 5"
).all();
console.log('Existing related rows:', JSON.stringify(existingGame));

const GAME_NAME = 'Manchester City vs Southampton';
const GAME_DATETIME = 'Friday, 25/04/2026';

const orders = [
  {
    order_number: '286993597',
    buyer_email: 'athewdhawkins12@gmail.com',
    buyer_name: null,
    ticket_quantity: 4,
    total_amount: 320.00,
    sales_channel: 'StubHub',
  },
  {
    order_number: '287000193',
    buyer_email: 'meredowd@gmail.com',
    buyer_name: null,
    ticket_quantity: 2,
    total_amount: 156.00,
    sales_channel: 'StubHub',
  },
  {
    order_number: '286002519',
    buyer_email: 'orlane.durant@gmail.com',
    buyer_name: null,
    ticket_quantity: 2,
    total_amount: 163.00,
    sales_channel: 'StubHub',
  },
  {
    order_number: '287022435',
    buyer_email: 'flavio.calvagno@yahoo.fr',
    buyer_name: null,
    ticket_quantity: 2,
    total_amount: 68.64,
    sales_channel: 'StubHub',
  },
];

let inserted = 0;
let skipped = 0;

for (const o of orders) {
  const exists = db.prepare("SELECT id FROM orders WHERE order_number = ?").get(o.order_number);
  if (exists) {
    console.log(`SKIP ${o.order_number} — already in DB`);
    skipped++;
    continue;
  }

  db.prepare(`
    INSERT INTO orders
      (buyer_name, buyer_email, status, notes, game_name, order_number, sales_channel,
       total_amount, ticket_quantity, game_datetime)
    VALUES (?, ?, 'Confirmed', NULL, ?, ?, ?, ?, ?, ?)
  `).run(
    o.buyer_name,
    o.buyer_email,
    GAME_NAME,
    o.order_number,
    o.sales_channel,
    o.total_amount,
    o.ticket_quantity,
    GAME_DATETIME
  );
  console.log(`INSERTED ${o.order_number} — ${o.buyer_email} — €${o.total_amount} (${o.ticket_quantity} tickets)`);
  inserted++;
}

console.log(`\nDone: ${inserted} inserted, ${skipped} skipped`);

// Verify all 4 orders
console.log('\nVerification:');
const verify = db.prepare(
  "SELECT order_number, game_name, total_amount, ticket_quantity, buyer_email FROM orders WHERE order_number IN (?,?,?,?) ORDER BY order_number"
).all('286002519','286993597','287000193','287022435');
const total = verify.reduce((s, r) => s + r.total_amount, 0);
console.log(JSON.stringify(verify, null, 2));
console.log(`Total: €${total.toFixed(2)} (expected €707.64)`);
