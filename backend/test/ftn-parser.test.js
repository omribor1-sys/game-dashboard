const assert = require('node:assert');
const { parseFootballTicketNet } = require('../services/gmail-importer');

// Real "tickets have been sold" email (2026-08-09), post-redesign: the order ID gained a
// "TK-" prefix and the table labels run straight into their values with no whitespace.
// The old parser returned [] for these — every FTN sale since the redesign was dropped.
const SUBJECT = 'Your tickets have been sold on FootballTicketNet - Order TK-811201938 - Arsenal vs Borussia Dortmund';
const BODY = [
  'Hello, Your tickets have been sold on FootballTicketNet. Please find the order details below.',
  'Order IDTK-811201938Event NameArsenal vs Borussia DortmundEvent Date09/08/2026 14:00',
  'Ticket Quantity2CategoryShortside Lower LevelSplit TypeSingle TicketsShipping MethodMobile Tickets',
  'Extra InformationSingle Tickets Shortside Lower Level Adult Tickets',
  'Price Per TicketGBP 98.00Total PriceGBP 196.00Buyer NameFelipe Pinto',
].join(' ');

const [o] = parseFootballTicketNet(SUBJECT, BODY);
assert.ok(o, 'TK- prefixed sale email must parse');
assert.strictEqual(o.order_number, 'TK-811201938');
assert.strictEqual(o.ticket_quantity, 2);            // "Ticket Quantity2" — no separator
assert.strictEqual(o.total_amount, 196.00);          // Total Price, not Price Per Ticket
assert.strictEqual(o.category, 'Shortside Lower Level');
assert.strictEqual(o.game_datetime, 'Sun, 09/08/2026, 14:00');
assert.strictEqual(o.sales_channel, 'FootballTicketNet');

// The pre-redesign spaced format must keep working.
const [old] = parseFootballTicketNet(
  'Your tickets have been sold on FootballTicketNet - Order 1602091 - Manchester City vs Liverpool FC',
  'Order ID 1602091 Event Name Manchester City vs Liverpool FC Event Date 04/04/2026 12:45 ' +
  'Ticket Quantity 2 Category Longside Lower Level Split Type Single Tickets ' +
  'Price Per Ticket GBP 88.00 Total Price GBP 176.00');
assert.strictEqual(old.order_number, '1602091');
assert.strictEqual(old.ticket_quantity, 2);
assert.strictEqual(old.total_amount, 176.00);
assert.strictEqual(old.category, 'Longside Lower Level');

console.log('ftn-parser: all assertions passed');

// 2026-11-27: pipe-table "sold" email (May 2026). "Event Date" must win over the
// "Just Sold on 30/05/2026 12:54" timestamp, and the total must be Total Price.
const [pipe] = parseFootballTicketNet(
  'Your tickets have been sold on FootballTicketNet - Order  1619180 - Champions League Final 2026 Live Screening Emirates',
  'Were Just Sold on 30/05/2026 12:54 - Order Number 1619180.\n| Order ID | 1619180 |\n| Event Name | X |\n' +
  '| Event Date | 30/05/2026 15:00 |\n| Ticket Quantity | 2 |\n| Category | Central Longside Upper |\n| Split Type | Single Seats |\n' +
  '| Price Per Ticket | GBP 109.00 |\n| Total Price | GBP 218.00 |');
assert.strictEqual(pipe.game_datetime, 'Sat, 30/05/2026, 15:00');
assert.strictEqual(pipe.ticket_quantity, 2);
assert.strictEqual(pipe.total_amount, 218);
assert.strictEqual(pipe.currency, 'GBP');
assert.strictEqual(pipe.category, 'Central Longside Upper');

// "approved" format (noreply@, pre-Aug 2026)
const [appr] = parseFootballTicketNet('1614509  Your order has been approved',
  'Dear X, Your Arsenal vs Fulham tickets have been sold. Event Information: Order ID: 1614509 Category: Longside Upper Level ' +
  'Ticket Type: Mobile Tickets Event: Arsenal vs Fulham Venue: Emirates Stadium, London Date: 02/05/2026 17:30:00 ' +
  '* Block: 117 - Reihe: LOWROW; Seats: 55|* Adult Tickets Number of Tickets: 2 Price per Ticket: 189.00GBP Total Proceeds: 378.00GBP');
assert.strictEqual(appr.order_number, '1614509');
assert.strictEqual(appr.total_amount, 378);
assert.strictEqual(appr.currency, 'GBP');
assert.strictEqual(appr.ticket_quantity, 2);
assert.strictEqual(appr.game_datetime, 'Sat, 02/05/2026, 17:30');
assert.strictEqual(appr.row_seat, 'Block 117 | Row LOWROW | Seats 55');
assert.strictEqual(appr.category, 'Longside Upper Level');

// provisional-sale emails are not sales
assert.strictEqual(parseFootballTicketNet('1610322 You have an order marked as provisional sale', 'Order ID: 1610322').length, 0);
console.log('ftn-parser: all asserts passed');
