// Update category + row_seat for all Arsenal vs Fulham orders (from StubHub page data)
const db = require('./database');

const updates = [
  // 5 older orders (already in DB, category/row_seat was null)
  { order_number: '286966684', ticket_quantity: 2, category: 'Shortside Upper',     row_seat: 'Row BEST | Seats 11, 22' },
  { order_number: '286967930', ticket_quantity: 2, category: 'Longside Upper',      row_seat: 'Row win | Seats 11, 22' },
  { order_number: '286970904', ticket_quantity: 2, category: 'Shortside Upper',     row_seat: 'Row BEST | Seats 1, 2' },
  { order_number: '286971784', ticket_quantity: 2, category: 'Shortside Upper 123', row_seat: 'Row 398 | Seats 2, 3' },
  { order_number: '287022070', ticket_quantity: 2, category: 'Longside Upper',      row_seat: 'Row BESTVIEW | Seats 11, 17' },

  // 6 newer orders (inserted by us — also missing category/row_seat)
  { order_number: '287005342', ticket_quantity: 3, category: 'Longside Lower Central 17', row_seat: 'Row LOWROW | Seats 1, 3, 5' },
  { order_number: '287022218', ticket_quantity: 3, category: 'Longside Lower',      row_seat: 'Row bestseats | Seats 33, 44, 55' },
  { order_number: '287022623', ticket_quantity: 4, category: 'Shortside Upper',     row_seat: 'Row BESTUCANGET | Seats 11, 14, 18, 22' },
  { order_number: '287022661', ticket_quantity: 3, category: 'Shortside Upper',     row_seat: 'Row WIN | Seats 15, 17, 19' },
  { order_number: '287030851', ticket_quantity: 2, category: 'Shortside Upper',     row_seat: 'Row WIN | Seats 11, 13' },
  { order_number: '287030859', ticket_quantity: 2, category: 'Shortside Upper',     row_seat: 'Row AmazingLocation | Seats 99, 111' },
];

let updated = 0;
for (const u of updates) {
  const row = db.prepare('SELECT id, category, row_seat, ticket_quantity FROM orders WHERE order_number = ?').get(u.order_number);
  if (!row) { console.log(`${u.order_number}: NOT FOUND`); continue; }

  db.prepare('UPDATE orders SET category = ?, row_seat = ?, ticket_quantity = ? WHERE order_number = ?')
    .run(u.category, u.row_seat, u.ticket_quantity, u.order_number);
  console.log(`✅ ${u.order_number}: ${u.ticket_quantity}× ${u.category} | ${u.row_seat}`);
  updated++;
}

console.log(`\nUpdated ${updated}/11 orders`);

// Verify
console.log('\n=== Final state ===');
const all = db.prepare(
  "SELECT order_number, ticket_quantity, category, row_seat, buyer_name FROM orders WHERE order_number IN (?,?,?,?,?,?,?,?,?,?,?) ORDER BY order_number"
).all('286966684','286967930','286970904','286971784','287005342','287022070','287022218','287022623','287022661','287030851','287030859');
all.forEach(r => console.log(`  ${r.order_number} | ${r.ticket_quantity}× | ${r.category} | ${r.row_seat}`));
