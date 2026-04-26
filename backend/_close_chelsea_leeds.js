const db = require('./database');
function round2(n) { return Math.round(n * 100) / 100; }

const GAME = 'Chelsea vs Leeds United - FA Cup - Semi-final';
const DATETIME = 'Sun, 26/04/2026, 15:00';
const DATE = '2026-04-26';

// 3 orders from spreadsheet — check which are missing and insert
const ordersToEnsure = [
  {
    order_number: '287007754',
    buyer_name: 'Yussef Sahraoui',
    buyer_email: 'croethler@gmail.com',
    ticket_quantity: 2,
    total_amount: 350.00, // 2 × €175.00
    sales_channel: 'StubHub',
    row_seat: 'Seats 520-25-183, 520-25-184',
  },
  {
    order_number: '287005626',
    buyer_name: 'Michelle Mondous',
    buyer_email: 'jimbo66r@googlemail.com',
    ticket_quantity: 2,
    total_amount: 225.00, // 2 × €112.50
    sales_channel: 'StubHub',
    row_seat: 'Seats 522-37-260, 522-37-261',
  },
  {
    order_number: '287005660',
    buyer_name: 'Daniel Aschenbrenner',
    buyer_email: 'vinceatwork@hotmail.com',
    ticket_quantity: 2,
    total_amount: 227.00, // 2 × €113.50
    sales_channel: 'StubHub',
    row_seat: 'Seats 522-16-245, 522-16-246',
  },
];

for (const o of ordersToEnsure) {
  const exists = db.prepare("SELECT id FROM orders WHERE order_number=? AND deleted_at IS NULL").get(o.order_number);
  if (exists) {
    console.log(`⚠️  Order ${o.order_number} already in DB — skipping`);
    continue;
  }
  db.prepare(`
    INSERT INTO orders (order_number, game_name, game_datetime, ticket_quantity, total_amount,
      buyer_name, buyer_email, sales_channel, row_seat)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(o.order_number, GAME, DATETIME, o.ticket_quantity, o.total_amount,
         o.buyer_name, o.buyer_email, o.sales_channel, o.row_seat);
  console.log(`✅ Inserted order ${o.order_number} — €${o.total_amount} (${o.buyer_name})`);
}

// Show current DB total for this game
const check = db.prepare(`SELECT COUNT(*) cnt, SUM(total_amount) rev FROM orders WHERE game_name=? AND deleted_at IS NULL`).get(GAME);
console.log(`\nDB now: ${check.cnt} orders, €${check.rev?.toFixed(2)} revenue`);

// Close the game
const total_ticket_cost = 389.76;
const eli_cost = 0;

const totalRevenue = round2(check.rev || 0);
const ticketsSold = check.cnt || 0;
const totalAllCosts = round2(total_ticket_cost + eli_cost);
const netProfit = round2(totalRevenue - totalAllCosts);
const marginPercent = totalRevenue > 0 ? round2((netProfit / totalRevenue) * 100) : 0;

const existingGame = db.prepare('SELECT id FROM games WHERE name=?').get(GAME);
if (existingGame) {
  db.prepare(`UPDATE games SET total_revenue=?,total_ticket_cost=?,eli_cost=?,total_all_costs=?,net_profit=?,margin_percent=?,tickets_sold=?,completed=1,date=COALESCE(?,date) WHERE id=?`)
    .run(totalRevenue, total_ticket_cost, eli_cost, totalAllCosts, netProfit, marginPercent, ticketsSold, DATE, existingGame.id);
} else {
  db.prepare(`INSERT INTO games (name,date,total_revenue,total_ticket_cost,eli_cost,total_all_costs,net_profit,margin_percent,tickets_sold,completed) VALUES (?,?,?,?,?,?,?,?,?,1)`)
    .run(GAME, DATE, totalRevenue, total_ticket_cost, eli_cost, totalAllCosts, netProfit, marginPercent, ticketsSold);
}

console.log(`✅ CLOSED: "${GAME}"`);
console.log(`   Revenue: €${totalRevenue} | Cost: €${totalAllCosts} | Net Profit: €${netProfit} (${marginPercent}%) | Tickets: ${ticketsSold}`);
