const assert = require('node:assert');
const { parseTicombo } = require('../services/gmail-importer');

// Real "Tickets sold!" email (Bruno Mars, 2026-07-26), as getPlainText() delivers it:
// HTML-only body -> tags stripped to single spaces, &nbsp; entities left intact.
const SUBJECT = 'Congratulations!!! Your tickets are sold for Bruno Mars - The Romantic Tour';
const BODY = [
  'ticombo Tickets sold! Mobile Tickets Transaction ID: 0ksGWS3fyrkb',
  'Jul 28, 2026 Bruno Mars - The Romantic Tour Wembley Stadium, Wembley, United Kingdom',
  '2 tickets Category:&nbsp; Pitch Standing Total Ticket Price:&nbsp; €189.00',
  'A guest user bought your tickets Category:&nbsp; Pitch Standing Free Seating',
  'Order Summary Sunday, 26 Jul 2026 Order #: 1iWmCojyOc',
  'Event Type Quantity Currency Price Bruno Mars - The Romantic Tour m-tickets 2 €189.00',
  'Subtotal €378.00 Service fee €113.40 Delivery fee €0.00',
  'Total €491.40 Service Fee* -€113.40 Total (payout) €378.00',
  'Latest delivery date: Monday, 27 Jul 2026, 15:46 (Asia/Jerusalem)',
].join(' ');

const o = parseTicombo(SUBJECT, BODY);
assert.ok(o, 'sold email must parse');

// Revenue = seller payout, NOT the €491.40 the buyer paid and NOT the €189 unit price.
assert.strictEqual(o.total_amount, 378.00);
assert.strictEqual(o.order_number, '1iWmCojyOc');   // alphanumeric, not StubHub's digits
assert.strictEqual(o.ticket_quantity, 2);
assert.strictEqual(o.category, 'Pitch Standing');
assert.strictEqual(o.sales_channel, 'Ticombo');
// Event date "Jul 28, 2026" (28/07 is a Tuesday) — not the "26 Jul" order date.
assert.strictEqual(o.game_datetime, 'Tue, 28/07/2026, 00:00');
assert.strictEqual(o.game_date.getMonth(), 6);
assert.strictEqual(o.game_date.getDate(), 28);

// Event line carrying a time keeps it (French Open shape).
const timed = parseTicombo(
  'Congratulations!!! Your tickets are sold for Friday 1/2 Final 1 Session',
  'Transaction ID: RRsdGb9BDLAy Jun 5, 2026, 14:30 CET Stade Roland Garros 2 tickets ' +
  'Category:&nbsp; Court Total Ticket Price:&nbsp; €100.00 Order #: OXLcyQm0kk ' +
  'Total €260.00 Total (payout) €200.00');
assert.strictEqual(timed.game_datetime, 'Fri, 05/06/2026, 14:30');
assert.strictEqual(timed.total_amount, 200.00);

// Non-sale Ticombo mail (cancellation, payout, listing approved) must never become an order.
assert.strictEqual(parseTicombo('An order has been canceled', BODY), null);
assert.strictEqual(parseTicombo('Ticombo: Payout Request Approved', BODY), null);

// A GBP payout is refused rather than stored as if it were EUR.
assert.strictEqual(
  parseTicombo(SUBJECT, BODY.replace('Total (payout) €378.00', 'Total (payout) £378.00')),
  null);

// Missing payout line -> refuse, never fall back to the buyer-facing total.
assert.strictEqual(parseTicombo(SUBJECT, BODY.replace('Total (payout) €378.00', '')), null);

console.log('ticombo-parser.test.js: all assertions passed');
