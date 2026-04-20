'use strict';
const XLSX = require('./backend/node_modules/xlsx');
const fs = require('fs');

// ── StubHub Completed orders (scraped from browser) ──────────────────────────
const stubhubOrders = [
  {orderNum:'286956987',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sun 19 Apr 2026',tickets:2,payout:612.48,saleDate:'Wed 25 Mar 2026'},
  {orderNum:'286976333',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sun 19 Apr 2026',tickets:2,payout:621.28,saleDate:'Sat 04 Apr 2026'},
  {orderNum:'287000298',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sun 19 Apr 2026',tickets:2,payout:668.80,saleDate:'Fri 17 Apr 2026'},
  {orderNum:'287005722',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sun 19 Apr 2026',tickets:2,payout:586.08,saleDate:'Sat 18 Apr 2026'},
  {orderNum:'287006058',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sun 19 Apr 2026',tickets:2,payout:572.00,saleDate:'Sun 19 Apr 2026'},
  {orderNum:'287006143',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sun 19 Apr 2026',tickets:2,payout:589.60,saleDate:'Sun 19 Apr 2026'},
  {orderNum:'287010999',gameName:'Manchester City FC vs Arsenal FC',gameDate:'Sun 19 Apr 2026',tickets:2,payout:635.36,saleDate:'Sat 18 Apr 2026'},
  {orderNum:'287006186',gameName:'Everton FC vs Liverpool FC',gameDate:'Sun 19 Apr 2026',tickets:1,payout:280.72,saleDate:'Sun 19 Apr 2026'},
  {orderNum:'286943161',gameName:'Chelsea FC vs Manchester United',gameDate:'Sat 18 Apr 2026',tickets:1,payout:396.00,saleDate:'Mon 23 Mar 2026'},
  {orderNum:'286956500',gameName:'Chelsea FC vs Manchester United',gameDate:'Sat 18 Apr 2026',tickets:3,payout:1008.48,saleDate:'Tue 24 Mar 2026'},
  {orderNum:'286959989',gameName:'Chelsea FC vs Manchester United',gameDate:'Sat 18 Apr 2026',tickets:2,payout:672.32,saleDate:'Tue 31 Mar 2026'},
  {orderNum:'286994748',gameName:'Chelsea FC vs Manchester United',gameDate:'Sat 18 Apr 2026',tickets:3,payout:625.68,saleDate:'Thu 16 Apr 2026'},
  {orderNum:'286995365',gameName:'Chelsea FC vs Manchester United',gameDate:'Sat 18 Apr 2026',tickets:2,payout:381.92,saleDate:'Fri 17 Apr 2026'},
  {orderNum:'286999695',gameName:'Chelsea FC vs Manchester United',gameDate:'Sat 18 Apr 2026',tickets:2,payout:448.80,saleDate:'Fri 17 Apr 2026'},
  {orderNum:'287010778',gameName:'Chelsea FC vs Manchester United',gameDate:'Sat 18 Apr 2026',tickets:1,payout:171.60,saleDate:'Sat 18 Apr 2026'},
  {orderNum:'286947932',gameName:'Tottenham Hotspur vs Brighton & Hove Albion FC',gameDate:'Fri 17 Apr 2026',tickets:2,payout:218.08,saleDate:'Sun 22 Mar 2026'},
  {orderNum:'286977302',gameName:'Tottenham Hotspur vs Brighton & Hove Albion FC',gameDate:'Fri 17 Apr 2026',tickets:2,payout:211.36,saleDate:'Sat 04 Apr 2026'},
  {orderNum:'287000226',gameName:'Newcastle United FC vs AFC Bournemouth',gameDate:'Fri 17 Apr 2026',tickets:2,payout:147.84,saleDate:'Sat 18 Apr 2026'},
  {orderNum:'286920928',gameName:'Brentford FC vs Fulham FC',gameDate:'Sat 18 Apr 2026',tickets:2,payout:218.08,saleDate:'Fri 13 Mar 2026'},
  {orderNum:'286929258',gameName:'Brentford FC vs Fulham FC',gameDate:'Sat 18 Apr 2026',tickets:2,payout:218.08,saleDate:'Sat 14 Mar 2026'},
  {orderNum:'286935712',gameName:'Brentford FC vs Fulham FC',gameDate:'Sat 18 Apr 2026',tickets:2,payout:218.08,saleDate:'Wed 18 Mar 2026'},
  {orderNum:'286978295',gameName:'Brentford FC vs Fulham FC',gameDate:'Sat 18 Apr 2026',tickets:2,payout:218.08,saleDate:'Sat 04 Apr 2026'},
  {orderNum:'286995374',gameName:'Brentford FC vs Fulham FC',gameDate:'Sat 18 Apr 2026',tickets:2,payout:232.96,saleDate:'Fri 17 Apr 2026'},
  {orderNum:'286974823',gameName:'Arsenal FC vs Sporting CP',gameDate:'Wed 15 Apr 2026',tickets:4,payout:978.56,saleDate:'Thu 02 Apr 2026'},
  {orderNum:'286983151',gameName:'Arsenal FC vs Sporting CP',gameDate:'Wed 15 Apr 2026',tickets:2,payout:348.48,saleDate:'Mon 07 Apr 2026'},
  {orderNum:'286984452',gameName:'Arsenal FC vs Sporting CP',gameDate:'Wed 15 Apr 2026',tickets:2,payout:343.20,saleDate:'Sat 11 Apr 2026'},
  {orderNum:'286992522',gameName:'Arsenal FC vs Sporting CP',gameDate:'Wed 15 Apr 2026',tickets:2,payout:350.24,saleDate:'Mon 13 Apr 2026'},
  {orderNum:'286993976',gameName:'Arsenal FC vs Sporting CP',gameDate:'Wed 15 Apr 2026',tickets:2,payout:330.88,saleDate:'Tue 14 Apr 2026'},
  {orderNum:'286994169',gameName:'Arsenal FC vs Sporting CP',gameDate:'Wed 15 Apr 2026',tickets:1,payout:177.76,saleDate:'Tue 14 Apr 2026'},
  {orderNum:'286998302',gameName:'Arsenal FC vs Sporting CP',gameDate:'Wed 15 Apr 2026',tickets:2,payout:332.64,saleDate:'Wed 15 Apr 2026'},
  {orderNum:'286998339',gameName:'Arsenal FC vs Sporting CP',gameDate:'Wed 15 Apr 2026',tickets:1,payout:183.92,saleDate:'Tue 14 Apr 2026'},
  {orderNum:'286998630',gameName:'Arsenal FC vs Sporting CP',gameDate:'Wed 15 Apr 2026',tickets:2,payout:332.64,saleDate:'Wed 15 Apr 2026'},
  {orderNum:'286946053',gameName:'Chelsea FC vs Manchester City FC',gameDate:'Sun 12 Apr 2026',tickets:2,payout:533.28,saleDate:'Fri 20 Mar 2026'},
  {orderNum:'286983977',gameName:'Chelsea FC vs Manchester City FC',gameDate:'Sun 12 Apr 2026',tickets:2,payout:241.12,saleDate:'Sun 12 Apr 2026'},
  {orderNum:'286991879',gameName:'Chelsea FC vs Manchester City FC',gameDate:'Sun 12 Apr 2026',tickets:2,payout:279.84,saleDate:'Sun 12 Apr 2026'},
  {orderNum:'286982868',gameName:'Liverpool FC vs Fulham FC',gameDate:'Sun 12 Apr 2026',tickets:3,payout:594.00,saleDate:'Fri 10 Apr 2026'},
  {orderNum:'286915292',gameName:'Brentford FC vs Everton FC',gameDate:'Sat 11 Apr 2026',tickets:2,payout:167.20,saleDate:'Wed 18 Mar 2026'},
  {orderNum:'286971375',gameName:'Brentford FC vs Everton FC',gameDate:'Sat 11 Apr 2026',tickets:2,payout:174.24,saleDate:'Thu 02 Apr 2026'},
  {orderNum:'286995861',gameName:'Brentford FC vs Everton FC',gameDate:'Sat 11 Apr 2026',tickets:2,payout:297.44,saleDate:'Fri 10 Apr 2026'},
  {orderNum:'286995864',gameName:'Brentford FC vs Everton FC',gameDate:'Sat 11 Apr 2026',tickets:2,payout:288.64,saleDate:'Fri 10 Apr 2026'},
  {orderNum:'286928484',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:3,payout:678.48,saleDate:'Sun 15 Mar 2026'},
  {orderNum:'286929466',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:390.72,saleDate:'Tue 17 Mar 2026'},
  {orderNum:'286942825',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:410.08,saleDate:'Sun 22 Mar 2026'},
  {orderNum:'286946275',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:3,payout:440.88,saleDate:'Sat 21 Mar 2026'},
  {orderNum:'286946421',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:410.08,saleDate:'Sun 22 Mar 2026'},
  {orderNum:'286946979',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:3,payout:546.48,saleDate:'Sun 22 Mar 2026'},
  {orderNum:'286959784',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:271.04,saleDate:'Tue 31 Mar 2026'},
  {orderNum:'286963442',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:0.00,saleDate:'Mon 30 Mar 2026'},
  {orderNum:'286964633',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:334.40,saleDate:'Wed 01 Apr 2026'},
  {orderNum:'286967556',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:300.96,saleDate:'Thu 02 Apr 2026'},
  {orderNum:'286967797',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:350.24,saleDate:'Fri 03 Apr 2026'},
  {orderNum:'286971552',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:311.52,saleDate:'Fri 03 Apr 2026'},
  {orderNum:'286972078',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:1,payout:174.24,saleDate:'Fri 03 Apr 2026'},
  {orderNum:'286972638',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:348.48,saleDate:'Sun 05 Apr 2026'},
  {orderNum:'286973130',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:272.80,saleDate:'Mon 06 Apr 2026'},
  {orderNum:'286973945',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:1,payout:135.52,saleDate:'Tue 07 Apr 2026'},
  {orderNum:'286974212',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:1,payout:238.48,saleDate:'Wed 08 Apr 2026'},
  {orderNum:'286974684',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:286.88,saleDate:'Thu 09 Apr 2026'},
  {orderNum:'286975098',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:2,payout:330.88,saleDate:'Thu 09 Apr 2026'},
  {orderNum:'286976631',gameName:'Arsenal FC vs AFC Bournemouth',gameDate:'Wed 01 Apr 2026',tickets:3,payout:578.16,saleDate:'Sat 04 Apr 2026'},
];

// ── Load reconcile data ───────────────────────────────────────────────────────
const recData = JSON.parse(fs.readFileSync('C:/Users/Omri/game-dashboard/reconcile-result.json','utf8'));
const { matched, dbOnly, paypalOnly, summary } = recData;

const stubhubSet = new Set(stubhubOrders.map(o => o.orderNum));
const stubhubByNum = {};
stubhubOrders.forEach(o => { stubhubByNum[o.orderNum] = o; });

const matchedByNum = {};
matched.forEach(r => { matchedByNum[r.order_number] = r; });

const paypalOnlyByNum = {};
paypalOnly.forEach(r => { paypalOnlyByNum[r.order_number] = r; });

const eur = n => typeof n === 'number' ? Math.round(n*100)/100 : n;

// ── Analysis ─────────────────────────────────────────────────────────────────
// 1. StubHub completed AND in DB (matched) — should be 51
const completedInDB = stubhubOrders.filter(o => matchedByNum[o.orderNum]);

// 2. StubHub completed but NOT in DB — in paypalOnly (9)
const completedPaypalOnly = stubhubOrders.filter(o => !matchedByNum[o.orderNum] && paypalOnlyByNum[o.orderNum]);

// 3. StubHub completed, cancelled (payout = 0)
const completedCancelled = stubhubOrders.filter(o => o.payout === 0);

// 4. DB+PayPal matched but NOT in StubHub Completed — other account or future games
const matchedNotCompleted = matched.filter(r => !stubhubSet.has(r.order_number));

// 5. Amount comparison for orders in both
const priceDiffs = completedInDB.map(o => {
  const db = matchedByNum[o.orderNum];
  return {
    orderNum: o.orderNum,
    game: o.gameName.replace(' FC','').replace(' FC',''),
    stubhub_payout: o.payout,
    paypal_received: db.paypal_paid,
    db_amount: db.db_amount,
    diff_pp_vs_sh: eur(db.paypal_paid - o.payout)
  };
}).filter(r => Math.abs(r.diff_pp_vs_sh) > 0.05);

// ── Game-level revenue summary ────────────────────────────────────────────────
const gameMap = {
  'Arsenal FC vs AFC Bournemouth': 'Arsenal vs Bournemouth',
  'Manchester City FC vs Arsenal FC': 'Man City vs Arsenal',
  'Chelsea FC vs Manchester United': 'Chelsea vs Man United',
  'Tottenham Hotspur vs Brighton & Hove Albion FC': 'Tottenham vs Brighton',
  'Newcastle United FC vs AFC Bournemouth': 'Newcastle vs Bournemouth',
  'Brentford FC vs Fulham FC': 'Brentford vs Fulham',
  'Arsenal FC vs Sporting CP': 'Arsenal vs Sporting CP',
  'Chelsea FC vs Manchester City FC': 'Chelsea vs Man City',
  'Liverpool FC vs Fulham FC': 'Liverpool vs Fulham',
  'Brentford FC vs Everton FC': 'Brentford vs Everton',
  'Everton FC vs Liverpool FC': 'Everton vs Liverpool',
};
const normalize = g => gameMap[g] || g;

// Build per-game table combining StubHub + all DB data
const allGames = {};
// From StubHub completed
stubhubOrders.forEach(o => {
  const g = normalize(o.gameName);
  if (!allGames[g]) allGames[g] = {stubhub_orders:0, stubhub_tickets:0, stubhub_payout:0, paypal_matched:0, db_matched:0, missing_from_db:0};
  allGames[g].stubhub_orders++;
  allGames[g].stubhub_tickets += o.tickets;
  allGames[g].stubhub_payout += o.payout;
  const db = matchedByNum[o.orderNum];
  if (db) { allGames[g].paypal_matched += db.paypal_paid; allGames[g].db_matched += db.db_amount; }
  const pp = paypalOnlyByNum[o.orderNum];
  if (pp) allGames[g].missing_from_db += pp.paypal_paid;
});

// ── BUILD WORKBOOK ────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();

// ═══════════ SHEET 1: EXECUTIVE SUMMARY ══════════════════════════════════════
const totalStubhubPayout = eur(stubhubOrders.reduce((s,o)=>s+o.payout,0));
const totalPaypalForCompleted = eur(completedInDB.reduce((s,o)=>s+matchedByNum[o.orderNum].paypal_paid,0));
const totalMissingFromDB = eur(completedPaypalOnly.reduce((s,o)=>s+paypalOnlyByNum[o.orderNum].paypal_paid,0));

const s1 = [
  ['דוח מלא: StubHub Completed ↔ PayPal ↔ DB   |   מרץ–אפריל 2026', '', '', ''],
  ['תאריך הפקה:', new Date().toLocaleDateString('he-IL'), '', ''],
  ['', '', '', ''],
  ['📊 סיכום ראשי', '', '', ''],
  ['הזמנות StubHub בסטטוס Completed (חשבון Omri)', stubhubOrders.length, '', ''],
  ['כרטיסים שנמכרו (Completed)', stubhubOrders.reduce((s,o)=>s+o.tickets,0), 'כרטיסים', ''],
  ['סה"כ PayOut מ-StubHub (Completed)', totalStubhubPayout, '€', ''],
  ['', '', '', ''],
  ['✅ הזמנות שנמצאו גם ב-DB וגם ב-PayPal', completedInDB.length, '', ''],
  ['   PayPal שהתקבל עבורן', totalPaypalForCompleted, '€', ''],
  ['   StubHub Payout עבורן', eur(completedInDB.reduce((s,o)=>s+o.payout,0)), '€', ''],
  ['   הפרש PayPal vs StubHub', eur(totalPaypalForCompleted - completedInDB.reduce((s,o)=>s+o.payout,0)), '€', ''],
  ['', '', '', ''],
  ['⚠️ הזמנות Completed ב-StubHub — חסרות מ-DB', completedPaypalOnly.length, '(שולמו בPayPal!)', ''],
  ['   סה"כ תשלום שהתקבל', totalMissingFromDB, '€', '⚠️ יש לוסיף ל-DB'],
  ['', '', '', ''],
  ['❌ הזמנה בוטלה (Payout=0)', completedCancelled.length, '286963442', 'Arsenal vs Bournemouth'],
  ['', '', '', ''],
  ['📋 הזמנות שב-DB+PayPal אך לא ב-StubHub Completed (חשבון Omri)', matchedNotCompleted.length, '', ''],
  ['   (חשבון Eli או משחקים עתידיים)', '', '', ''],
  ['   סה"כ PayPal שהתקבל', eur(matchedNotCompleted.reduce((s,r)=>s+r.paypal_paid,0)), '€', ''],
  ['', '', '', ''],
  ['💰 סה"כ PayPal שהתקבל (כל 108 הזמנות מותאמות)', eur(summary.total_paypal_received), '€', ''],
];
const ws1 = XLSX.utils.aoa_to_sheet(s1);
ws1['!cols'] = [{wch:55},{wch:16},{wch:25},{wch:30}];
XLSX.utils.book_append_sheet(wb, ws1, '📊 סיכום');

// ═══════════ SHEET 2: STUBHUB COMPLETED ORDERS ═══════════════════════════════
const s2header = ['מספר הזמנה','שם משחק (StubHub)','תאריך משחק','כרטיסים','Payout (€)','תאריך מכירה','PayPal שהתקבל (€)','DB סכום (€)','הפרש PP-SH','סטטוס'];
const s2rows = stubhubOrders.map(o => {
  const db = matchedByNum[o.orderNum];
  const pp = paypalOnlyByNum[o.orderNum];
  const paypalAmt = db ? db.paypal_paid : (pp ? pp.paypal_paid : 0);
  const dbAmt = db ? db.db_amount : 0;
  const diff = eur(paypalAmt - o.payout);
  let status = '';
  if (o.payout === 0) status = '❌ בוטל';
  else if (db) status = Math.abs(diff) < 0.5 ? '✅' : '⚠️ פער';
  else if (pp) status = '⚠️ חסר ב-DB';
  else status = '🔍 בדוק';
  return [o.orderNum, o.gameName, o.gameDate, o.tickets, o.payout, o.saleDate, paypalAmt, dbAmt, diff, status];
});
const ws2 = XLSX.utils.aoa_to_sheet([s2header, ...s2rows]);
ws2['!cols'] = [{wch:14},{wch:42},{wch:16},{wch:10},{wch:14},{wch:16},{wch:18},{wch:14},{wch:12},{wch:16}];
XLSX.utils.book_append_sheet(wb, ws2, '✅ StubHub Completed');

// ═══════════ SHEET 3: MISSING FROM DB ════════════════════════════════════════
const s3header = ['מספר הזמנה','שם אירוע','כרטיסים','StubHub Payout (€)','PayPal שהתקבל (€)','תאריך מכירה','הערה'];
const s3rows = completedPaypalOnly.map(o => {
  const pp = paypalOnlyByNum[o.orderNum];
  return [o.orderNum, o.gameName, o.tickets, o.payout, pp ? pp.paypal_paid : 0, o.saleDate, 'יש לייבא לDB'];
});
s3rows.push(['', 'סה"כ', '', eur(completedPaypalOnly.reduce((s,o)=>s+o.payout,0)), totalMissingFromDB, '', '']);
const ws3 = XLSX.utils.aoa_to_sheet([s3header, ...s3rows]);
ws3['!cols'] = [{wch:14},{wch:45},{wch:10},{wch:18},{wch:18},{wch:16},{wch:16}];
XLSX.utils.book_append_sheet(wb, ws3, '⚠️ חסרים ב-DB');

// ═══════════ SHEET 4: NOT IN STUBHUB COMPLETED ═══════════════════════════════
const byGame4 = {};
matchedNotCompleted.forEach(r => {
  const g = r.game_name;
  if(!byGame4[g]) byGame4[g] = {orders:0, paypal:0, db:0};
  byGame4[g].orders++;
  byGame4[g].paypal += r.paypal_paid;
  byGame4[g].db += r.db_amount;
});
const s4header = ['משחק','הזמנות','PayPal שהתקבל (€)','DB סכום (€)','הסבר'];
const s4rows = Object.entries(byGame4).sort((a,b)=>b[1].orders-a[1].orders).map(([g,d]) => {
  const note = ['Arsenal vs Newcastle United','Arsenal vs Fulham','Brentford vs Crystal Palace','Brentford vs West Ham','Fulham vs Bournemouth','Manchester City vs Southampton - FA Cup Semi-Final','Tottenham Hotspur vs Nottingham Forest FC','Manchester City VS Liverpool   - FA CUP'].includes(g)
    ? 'משחק עתידי' : 'ייתכן חשבון Eli / לא הושלם עדיין';
  return [g, d.orders, eur(d.paypal), eur(d.db), note];
});
s4rows.push(['סה"כ', matchedNotCompleted.length, eur(matchedNotCompleted.reduce((s,r)=>s+r.paypal_paid,0)), '', '']);
const ws4 = XLSX.utils.aoa_to_sheet([s4header, ...s4rows]);
ws4['!cols'] = [{wch:42},{wch:10},{wch:20},{wch:16},{wch:35}];
XLSX.utils.book_append_sheet(wb, ws4, '📋 לא ב-StubHub Completed');

// ═══════════ SHEET 5: REVENUE TABLE PER GAME ═════════════════════════════════
// Combine StubHub data + all matched orders for full picture
const allMatchedByGame = {};
matched.forEach(r => {
  const g = r.game_name;
  if(!allMatchedByGame[g]) allMatchedByGame[g] = {orders:0, tickets_sold:0, paypal_total:0, db_total:0};
  allMatchedByGame[g].orders++;
  allMatchedByGame[g].paypal_total += r.paypal_paid;
  allMatchedByGame[g].db_total += r.db_amount;
});
// Add PayPal-only (completed in StubHub but missing from DB)
completedPaypalOnly.forEach(o => {
  const pp = paypalOnlyByNum[o.orderNum];
  if(!pp) return;
  const g = normalize(o.gameName);
  const gAlt = Object.keys(allMatchedByGame).find(k => k.toLowerCase().includes(g.toLowerCase().split(' ')[0]));
  const key = gAlt || g;
  if(!allMatchedByGame[key]) allMatchedByGame[key] = {orders:0, tickets_sold:0, paypal_total:0, db_total:0};
  allMatchedByGame[key].orders++;
  allMatchedByGame[key].paypal_total += pp.paypal_paid;
});

const s5header = ['משחק','הזמנות','PayPal שהתקבל (€)','StubHub Payout (€)','הזמנות ב-Completed'];
const stubhubByGame = {};
stubhubOrders.forEach(o => {
  const g = o.gameName;
  if(!stubhubByGame[g]) stubhubByGame[g] = {orders:0, payout:0};
  stubhubByGame[g].orders++;
  stubhubByGame[g].payout += o.payout;
});

const s5rows = Object.entries(allMatchedByGame)
  .sort((a,b)=>b[1].paypal_total-a[1].paypal_total)
  .map(([g,d]) => {
    // Find matching StubHub game
    const shGame = Object.keys(stubhubByGame).find(sg =>
      normalize(sg).toLowerCase() === g.toLowerCase() ||
      sg.toLowerCase().includes(g.toLowerCase().split(' ')[0]) ||
      g.toLowerCase().includes(normalize(sg).toLowerCase().split(' ')[0])
    );
    const sh = shGame ? stubhubByGame[shGame] : {orders:0, payout:0};
    return [g, d.orders, eur(d.paypal_total), eur(sh.payout), sh.orders + ' מתוך ' + d.orders];
  });
s5rows.push(['סה"כ', matched.length + completedPaypalOnly.length,
  eur(matched.reduce((s,r)=>s+r.paypal_paid,0) + completedPaypalOnly.reduce((s,o)=>{const pp=paypalOnlyByNum[o.orderNum];return s+(pp?pp.paypal_paid:0);},0)),
  eur(totalStubhubPayout), '60 Completed']);
const ws5 = XLSX.utils.aoa_to_sheet([s5header, ...s5rows]);
ws5['!cols'] = [{wch:45},{wch:10},{wch:22},{wch:22},{wch:20}];
XLSX.utils.book_append_sheet(wb, ws5, '💰 הכנסות לפי משחק');

// ── Save ──────────────────────────────────────────────────────────────────────
const outPath = 'C:/Users/Omri/Documents/StubHub-Reconciliation-Full-Apr2026.xlsx';
XLSX.writeFile(wb, outPath);
console.log('✅ Saved:', outPath);
console.log('\n=== KEY NUMBERS ===');
console.log('StubHub Completed:', stubhubOrders.length, 'orders');
console.log('  In DB+PayPal:', completedInDB.length);
console.log('  PayPal paid but missing from DB:', completedPaypalOnly.length, '— €' + totalMissingFromDB);
console.log('  Cancelled (€0):', completedCancelled.length);
console.log('DB+PayPal NOT in StubHub Completed:', matchedNotCompleted.length, '(Eli account / future games)');
console.log('Total StubHub payout:', totalStubhubPayout, '€');
console.log('Total PayPal received (all 108 matched):', eur(summary.total_paypal_received), '€');
