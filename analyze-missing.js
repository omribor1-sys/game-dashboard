'use strict';
const fs = require('fs');
const reconcile = JSON.parse(fs.readFileSync('C:/Users/Omri/game-dashboard/reconcile-result.json','utf8'));

const { matched, paypalOnly, amountDiff } = reconcile;

// StubHub completed orders (Omri's account, scraped April 19 2026)
const stubhub = [
  {orderNum:'286956987',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sunday, 19 Apr 2026',tickets:2,payout:612.48},
  {orderNum:'286976333',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sunday, 19 Apr 2026',tickets:2,payout:621.28},
  {orderNum:'287000298',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sunday, 19 Apr 2026',tickets:2,payout:668.80},
  {orderNum:'287005722',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sunday, 19 Apr 2026',tickets:2,payout:586.08},
  {orderNum:'287006058',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sunday, 19 Apr 2026',tickets:2,payout:572.00},
  {orderNum:'287006143',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sunday, 19 Apr 2026',tickets:2,payout:589.60},
  {orderNum:'287010999',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sunday, 19 Apr 2026',tickets:2,payout:635.36},
  {orderNum:'287006186',gameName:'Everton FC vs Liverpool FC',gameDate:'Sunday, 19 Apr 2026',tickets:1,payout:280.72},
  {orderNum:'286943161',gameName:'Chelsea FC vs Manchester United',gameDate:'Saturday, 18 Apr 2026',tickets:1,payout:396.00},
  {orderNum:'286956500',gameName:'Chelsea FC vs Manchester United',gameDate:'Saturday, 18 Apr 2026',tickets:3,payout:1008.48},
  {orderNum:'286959989',gameName:'Chelsea FC vs Manchester United',gameDate:'Saturday, 18 Apr 2026',tickets:2,payout:672.32},
  {orderNum:'286994748',gameName:'Chelsea FC vs Manchester United',gameDate:'Saturday, 18 Apr 2026',tickets:3,payout:625.68},
  {orderNum:'286995365',gameName:'Chelsea FC vs Manchester United',gameDate:'Saturday, 18 Apr 2026',tickets:2,payout:381.92},
  {orderNum:'286999695',gameName:'Chelsea FC vs Manchester United',gameDate:'Saturday, 18 Apr 2026',tickets:2,payout:448.80},
  {orderNum:'287010778',gameName:'Chelsea FC vs Manchester United',gameDate:'Saturday, 18 Apr 2026',tickets:1,payout:171.60},
  {orderNum:'286947932',gameName:'Tottenham Hotspur vs Brighton & Hove Albion FC',gameDate:'Friday, 17 Apr 2026',tickets:2,payout:218.08},
  {orderNum:'286977302',gameName:'Tottenham Hotspur vs Brighton & Hove Albion FC',gameDate:'Friday, 17 Apr 2026',tickets:2,payout:211.36},
  {orderNum:'287000226',gameName:'Newcastle United FC vs AFC Bournemouth',gameDate:'Friday, 17 Apr 2026',tickets:2,payout:147.84},
  {orderNum:'286920928',gameName:'Brentford FC vs Fulham FC',gameDate:'Saturday, 18 Apr 2026',tickets:2,payout:218.08},
  {orderNum:'286929258',gameName:'Brentford FC vs Fulham FC',gameDate:'Saturday, 18 Apr 2026',tickets:2,payout:218.08},
  {orderNum:'286935712',gameName:'Brentford FC vs Fulham FC',gameDate:'Saturday, 18 Apr 2026',tickets:2,payout:218.08},
  {orderNum:'286978295',gameName:'Brentford FC vs Fulham FC',gameDate:'Saturday, 18 Apr 2026',tickets:2,payout:218.08},
  {orderNum:'286995374',gameName:'Brentford FC vs Fulham FC',gameDate:'Saturday, 18 Apr 2026',tickets:2,payout:232.96},
  {orderNum:'286974823',gameName:'Arsenal FC vs Sporting CP — Champions League',gameDate:'Wednesday, 15 Apr 2026',tickets:4,payout:978.56},
  {orderNum:'286983151',gameName:'Arsenal FC vs Sporting CP — Champions League',gameDate:'Wednesday, 15 Apr 2026',tickets:2,payout:348.48},
  {orderNum:'286984452',gameName:'Arsenal FC vs Sporting CP — Champions League',gameDate:'Wednesday, 15 Apr 2026',tickets:2,payout:343.20},
  {orderNum:'286992522',gameName:'Arsenal FC vs Sporting CP — Champions League',gameDate:'Wednesday, 15 Apr 2026',tickets:2,payout:350.24},
  {orderNum:'286993976',gameName:'Arsenal FC vs Sporting CP — Champions League',gameDate:'Wednesday, 15 Apr 2026',tickets:2,payout:330.88},
  {orderNum:'286994169',gameName:'Arsenal FC vs Sporting CP — Champions League',gameDate:'Wednesday, 15 Apr 2026',tickets:1,payout:177.76},
  {orderNum:'286998302',gameName:'Arsenal FC vs Sporting CP — Champions League',gameDate:'Wednesday, 15 Apr 2026',tickets:2,payout:332.64},
  {orderNum:'286998339',gameName:'Arsenal FC vs Sporting CP — Champions League',gameDate:'Wednesday, 15 Apr 2026',tickets:1,payout:183.92},
  {orderNum:'286998630',gameName:'Arsenal FC vs Sporting CP — Champions League',gameDate:'Wednesday, 15 Apr 2026',tickets:2,payout:332.64},
  {orderNum:'286946053',gameName:'Chelsea FC vs Manchester City FC',gameDate:'Sunday, 12 Apr 2026',tickets:2,payout:533.28},
  {orderNum:'286983977',gameName:'Chelsea FC vs Manchester City FC',gameDate:'Sunday, 12 Apr 2026',tickets:2,payout:241.12},
  {orderNum:'286991879',gameName:'Chelsea FC vs Manchester City FC',gameDate:'Sunday, 12 Apr 2026',tickets:2,payout:279.84},
  {orderNum:'286982868',gameName:'Liverpool FC vs Fulham FC',gameDate:'Sunday, 12 Apr 2026',tickets:3,payout:594.00},
  {orderNum:'286915292',gameName:'Brentford FC vs Everton FC',gameDate:'Saturday, 11 Apr 2026',tickets:2,payout:167.20},
  {orderNum:'286971375',gameName:'Brentford FC vs Everton FC',gameDate:'Saturday, 11 Apr 2026',tickets:2,payout:174.24},
  {orderNum:'286995861',gameName:'Brentford FC vs Everton FC',gameDate:'Saturday, 11 Apr 2026',tickets:2,payout:297.44},
  {orderNum:'286995864',gameName:'Brentford FC vs Everton FC',gameDate:'Saturday, 11 Apr 2026',tickets:2,payout:288.64},
  {orderNum:'286928484',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:3,payout:678.48},
  {orderNum:'286929466',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:390.72},
  {orderNum:'286942825',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:410.08},
  {orderNum:'286946275',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:3,payout:440.88},
  {orderNum:'286946421',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:410.08},
  {orderNum:'286946979',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:3,payout:546.48},
  {orderNum:'286959784',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:271.04},
  {orderNum:'286963442',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:0.00},
  {orderNum:'286964633',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:334.40},
  {orderNum:'286967556',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:300.96},
  {orderNum:'286967797',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:350.24},
  {orderNum:'286971552',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:311.52},
  {orderNum:'286972078',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:1,payout:174.24},
  {orderNum:'286972638',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:348.48},
  {orderNum:'286973130',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:272.80},
  {orderNum:'286973945',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:1,payout:135.52},
  {orderNum:'286974212',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:1,payout:238.48},
  {orderNum:'286974684',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:286.88},
  {orderNum:'286975098',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:2,payout:330.88},
  {orderNum:'286976631',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wednesday, 01 Apr 2026',tickets:3,payout:578.16},
];

const eur = n => '€' + (Math.round(n*100)/100).toFixed(2);

const matchedByNum = {};
matched.forEach(r => { matchedByNum[r.order_number] = r; });
const ppOnlyByNum = {};
paypalOnly.forEach(r => { ppOnlyByNum[r.order_number] = r; });
const stubhubSet = new Set(stubhub.map(o => o.orderNum));

// ── ISSUE 1: Cancelled / €0 payout ──────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════');
console.log('ISSUE 1 — CANCELLED ORDER: Completed on StubHub, payout = €0');
console.log('════════════════════════════════════════════════════════');
stubhub.filter(o => o.payout === 0).forEach(o => {
  const db = matchedByNum[o.orderNum];
  console.log(`  Game:         ${o.gameName}`);
  console.log(`  Event date:   ${o.gameDate}`);
  console.log(`  Order No.:    ${o.orderNum}`);
  console.log(`  Tickets sold: ${o.tickets}`);
  console.log(`  DB amount:    ${eur(db ? db.db_amount : 0)}`);
  console.log(`  PayPal recd:  ${eur(db ? db.paypal_paid : 0)}`);
  console.log(`  MISSING:      ${eur(db ? db.db_amount : 0)}`);
  console.log('  → Order shows Delivery status: Delivered but payout was cancelled');
});

// ── ISSUE 2: Amount discrepancy (PayPal ≠ DB) ───────────────────────────────
console.log('\n════════════════════════════════════════════════════════');
console.log('ISSUE 2 — PAYOUT DISCREPANCY: PayPal received ≠ DB amount');
console.log('════════════════════════════════════════════════════════');
amountDiff.filter(r => r.order_number !== '286963442').forEach(r => {
  const sh = stubhubSet.has(r.order_number) ? '(also in StubHub Completed)' : '(not in StubHub Completed)';
  console.log(`  Game:       ${r.game_name}`);
  console.log(`  Order No.:  ${r.order_number}  ${sh}`);
  console.log(`  DB amount:  ${eur(r.db_amount)}`);
  console.log(`  PayPal:     ${eur(r.paypal_paid)}`);
  console.log(`  Difference: ${eur(r.diff)}  ${r.diff > 0 ? '(overpaid)' : '(underpaid)'}`);
  console.log();
});

// ── ISSUE 3: StubHub Completed but MISSING from DB ──────────────────────────
console.log('════════════════════════════════════════════════════════');
console.log('ISSUE 3 — PAID BUT NOT IN OUR SYSTEM (9 orders)');
console.log('These appear as Completed on StubHub and PayPal paid us');
console.log('but we have no record in our order database');
console.log('════════════════════════════════════════════════════════');
const missing9 = stubhub.filter(o => !matchedByNum[o.orderNum] && ppOnlyByNum[o.orderNum] && o.payout > 0);
let totalMissing9 = 0;
missing9.forEach(o => {
  const pp = ppOnlyByNum[o.orderNum];
  const diff = Math.round((pp.paypal_paid - o.payout)*100)/100;
  console.log(`  Order No.:        ${o.orderNum}`);
  console.log(`  Game:             ${o.gameName}`);
  console.log(`  Event date:       ${o.gameDate}`);
  console.log(`  Tickets:          ${o.tickets}`);
  console.log(`  StubHub payout:   ${eur(o.payout)}`);
  console.log(`  PayPal received:  ${eur(pp.paypal_paid)}`);
  if (Math.abs(diff) > 0.05) console.log(`  Diff:             ${eur(diff)}`);
  console.log();
  totalMissing9 += pp.paypal_paid;
});
console.log(`  TOTAL received for these 9 orders: ${eur(totalMissing9)}`);

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════');
console.log('GRAND TOTAL MISSING / ACTION REQUIRED');
console.log('════════════════════════════════════════════════════════');
const cancelled = matched.find(r => r.order_number === '286963442');
console.log(`  Issue 1 - Cancelled payout (owed by StubHub): ${eur(cancelled ? cancelled.db_amount : 297.44)}`);
console.log(`  Issue 2 - Overpayment received (286996243):   +€245.00`);
console.log(`  Issue 3 - 9 untracked orders (money received, needs DB import): ${eur(totalMissing9)}`);
