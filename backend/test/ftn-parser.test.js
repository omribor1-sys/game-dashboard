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
