'use strict';
const XLSX = require('./backend/node_modules/xlsx');
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./reconcile-result.json', 'utf8'));
const { summary, matched, dbOnly, paypalOnly, amountDiff } = data;

// ── helpers ──────────────────────────────────────────────────────────────────
const eur = n => typeof n === 'number' ? Math.round(n*100)/100 : n;

// Classify paypal-only orders
const OUR_GAMES = [
  'arsenal fc vs afc bournemouth','arsenal fc vs manchester city fc','manchester city fc vs arsenal fc',
  'arsenal fc vs sporting cp','arsenal fc vs sporting cp - champions league 2025-2026',
  'chelsea fc vs manchester united','chelsea fc vs manchester city fc',
  'brentford fc vs fulham fc','liverpool fc vs fulham fc','brentford fc vs everton fc',
  'arsenal fc vs bayer 04 leverkusen - champions league 2025-2026',
  'manchester city fc vs real madrid cf - champions league 2025-2026',
  'manchester city fc vs liverpool fc - fa cup',
  'arsenal fc vs newcastle united fc','tottenham hotspur vs nottingham forest fc',
  'carabao cup final 2026 - arsenal fc vs manchester city fc',
  'manchester city fc vs southampton fc - fa cup - semi-final',
  'chelsea fc vs newcastle united fc','brentford fc vs west ham united fc',
  'fulham fc vs afc bournemouth','brentford fc vs crystal palace fc'
];

paypalOnly.forEach(o => {
  const en = (o.event_name||'').toLowerCase();
  o.category = OUR_GAMES.some(g => en.includes(g.split(' ')[0]) && en.includes(g.split(' ').slice(-2).join(' ').split(' ')[0]))
    ? 'משחק במערכת — לא סונכרן'
    : 'משחק לא במערכת';
  // More precise categorization
  if (en.includes('arsenal') && en.includes('chelsea')) o.category = 'משחק לא במערכת';
  else if (en.includes('newcastle') && en.includes('barcelona')) o.category = 'משחק לא במערכת';
  else if (en.includes('arsenal') && en.includes('everton')) o.category = 'משחק לא במערכת';
  else if (en.includes('chelsea') && en.includes('paris')) o.category = 'משחק לא במערכת';
  else if (en.includes('fulham') && en.includes('aston villa')) o.category = 'לא מסונכרן — בדוק';
  else if (en.includes('arsenal') && (en.includes('newcastle') || en.includes('bayer') || en.includes('sporting'))) o.category = 'משחק במערכת — הזמנה חסרה';
  else if (en.includes('manchester city') && (en.includes('arsenal') || en.includes('real madrid') || en.includes('liverpool'))) o.category = 'משחק במערכת — הזמנה חסרה';
  else if (en.includes('chelsea') && (en.includes('newcastle') || en.includes('manchester united') || en.includes('manchester city'))) o.category = 'משחק במערכת — הזמנה חסרה';
  else if (en.includes('newcastle') && en.includes('manchester')) o.category = 'משחק לא במערכת';
  else o.category = 'בדוק';
});

const ourMissing = paypalOnly.filter(o => o.category === 'משחק במערכת — הזמנה חסרה');
const otherGames = paypalOnly.filter(o => o.category !== 'משחק במערכת — הזמנה חסרה');
const totalOurMissing = ourMissing.reduce((s,r) => s + r.paypal_paid, 0);

// Payee breakdown for matched
const payeeBreakdown = {};
matched.forEach(r => {
  r.payee.split('; ').filter(Boolean).forEach(p => {
    if (!payeeBreakdown[p]) payeeBreakdown[p] = {orders:0, total:0};
    payeeBreakdown[p].orders++;
    payeeBreakdown[p].total += r.paypal_paid;
  });
});

// Game-level summary for matched orders
const byGame = {};
matched.forEach(r => {
  if (!byGame[r.game_name]) byGame[r.game_name] = {orders:0, db_total:0, paypal_total:0};
  byGame[r.game_name].orders++;
  byGame[r.game_name].db_total += r.db_amount;
  byGame[r.game_name].paypal_total += r.paypal_paid;
});

// ── Build workbook ────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();

// ═══════════════════ SHEET 1: EXECUTIVE SUMMARY ══════════════════════════════
const s1 = [
  ['דו"ח התאמת PayPal ↔ StubHub   |   מרץ–אפריל 2026', '', '', ''],
  ['תאריך הפקה:', new Date().toLocaleDateString('he-IL'), '', ''],
  ['', '', '', ''],

  ['📊 סיכום כללי', '', '', ''],
  ['הזמנות StubHub במערכת (מרץ 2026+)', summary.matched_count, 'הזמנות', ''],
  ['כסף שהתקבל (PayPal) עבור הזמנות במערכת', eur(summary.total_paypal_received), '€', ''],
  ['סכום לפי DB עבור אותן הזמנות', eur(summary.total_db_matched), '€', ''],
  ['פערי סכום', eur(summary.total_paypal_received - summary.total_db_matched), '€', ''],
  ['הזמנות עם אי-התאמת סכום', summary.amount_discrepancies, '', ''],
  ['', '', '', ''],

  ['⚠️ אי-התאמות ספציפיות', '', '', ''],
  ['הזמנה 286963442 (Arsenal vs Bournemouth)', 'בוטלה בPayPal — כסף לא התקבל!', 'DB: €297.44', 'PayPal: €0'],
  ['הזמנה 286996243 (Arsenal vs Bournemouth)', 'PayPal קיבל יותר מה-DB', 'DB: €702.24', 'PayPal: €947.24'],
  ['', '', '', ''],

  ['💳 פירוט לפי מייל PayPal', '', '', ''],
  ['מייל', 'הזמנות', 'סכום שהתקבל (€)', '% מסה"כ'],
  ...Object.entries(payeeBreakdown).sort((a,b) => b[1].total - a[1].total).map(([email, d]) => [
    email, d.orders, eur(d.total), Math.round(d.total / summary.total_paypal_received * 1000)/10 + '%'
  ]),
  ['סה"כ', summary.matched_count, eur(summary.total_paypal_received), '100%'],
  ['', '', '', ''],

  ['🏟️ פירוט לפי משחק (הזמנות מותאמות)', '', '', ''],
  ['משחק', 'הזמנות', 'DB סכום (€)', 'PayPal שהתקבל (€)'],
  ...Object.entries(byGame).sort((a,b) => b[1].paypal_total - a[1].paypal_total).map(([game, d]) => [
    game, d.orders, eur(d.db_total), eur(d.paypal_total)
  ]),
  ['', '', '', ''],

  ['🔍 הזמנות PayPal שלא נמצאות ב-DB', '', '', ''],
  ['סה"כ', paypalOnly.length, '(כולל משחקים אחרים)', ''],
  ['מהם — למשחקים שיש במערכת אך לא סונכרנו', ourMissing.length, '€' + eur(totalOurMissing), '⚠️ בדוק!'],
  ['למשחקים שאינם במערכת', otherGames.length, '€' + eur(otherGames.reduce((s,r)=>s+r.paypal_paid,0)), ''],
];

const ws1 = XLSX.utils.aoa_to_sheet(s1);
ws1['!cols'] = [{wch:45},{wch:20},{wch:22},{wch:22}];
XLSX.utils.book_append_sheet(wb, ws1, '📊 סיכום');

// ═══════════════════ SHEET 2: ALL MATCHED ════════════════════════════════════
const s2header = ['מספר הזמנה','משחק','תאריך משחק','שולם (€) — DB','שולם (€) — PayPal','הפרש (€)','מייל PayPal','סטטוס PayPal','תאריך תשלום','הערה'];
const s2rows = matched
  .sort((a,b) => a.paypal_date.localeCompare(b.paypal_date))
  .map(r => [
    r.order_number,
    r.game_name,
    r.game_datetime || '',
    eur(r.db_amount),
    eur(r.paypal_paid),
    eur(r.diff),
    r.payee,
    r.paypal_status,
    r.paypal_date,
    r.cancelled ? '⚠️ בוטל' : Math.abs(r.diff) > 0.05 ? '⚠️ פער' : '✅'
  ]);
const ws2 = XLSX.utils.aoa_to_sheet([s2header, ...s2rows]);
ws2['!cols'] = [{wch:14},{wch:32},{wch:22},{wch:14},{wch:16},{wch:10},{wch:30},{wch:25},{wch:12},{wch:10}];
XLSX.utils.book_append_sheet(wb, ws2, '✅ הזמנות מותאמות');

// ═══════════════════ SHEET 3: DISCREPANCIES ══════════════════════════════════
const s3header = ['מספר הזמנה','משחק','DB (€)','PayPal (€)','הפרש (€)','הסבר'];
const s3rows = [
  ['286963442','Arsenal vs Bournemouth', 297.44, 0, -297.44, 'הוזמנה בוטלה בPayPal — כסף לא התקבל! יש לסגור/לבטל הזמנה זו במערכת'],
  ['286996243','Arsenal vs Bournemouth', 702.24, 947.24, 245, 'PayPal קיבל €245 יותר מה-DB. ייתכן שחלק שולם לeli וחלק לomri. בדוק פיצול תשלום.'],
];
const ws3 = XLSX.utils.aoa_to_sheet([s3header, ...s3rows]);
ws3['!cols'] = [{wch:14},{wch:28},{wch:12},{wch:12},{wch:12},{wch:65}];
XLSX.utils.book_append_sheet(wb, ws3, '⚠️ אי-התאמות');

// ═══════════════════ SHEET 4: PAYPAL ONLY ════════════════════════════════════
const s4header = ['מספר הזמנה','שם אירוע (PayPal)','שולם (€)','מייל PayPal','סטטוס','תאריך','קטגוריה'];
const s4rows = paypalOnly
  .filter(r => r.paypal_paid > 0)
  .sort((a,b) => a.paypal_date.localeCompare(b.paypal_date))
  .map(r => [r.order_number, r.event_name, eur(r.paypal_paid), r.payee, r.paypal_status, r.paypal_date, r.category]);
const ws4 = XLSX.utils.aoa_to_sheet([s4header, ...s4rows]);
ws4['!cols'] = [{wch:14},{wch:55},{wch:12},{wch:32},{wch:35},{wch:12},{wch:28}];
XLSX.utils.book_append_sheet(wb, ws4, '🔍 PayPal ללא DB');

// ═══════════════════ SHEET 5: MISSING SYNC ═══════════════════════════════════
const s5header = ['מספר הזמנה','שם אירוע (PayPal)','שולם (€)','מייל PayPal','תאריך','סטטוס'];
const s5rows = ourMissing
  .sort((a,b) => a.paypal_date.localeCompare(b.paypal_date))
  .map(r => [r.order_number, r.event_name, eur(r.paypal_paid), r.payee, r.paypal_date, r.paypal_status]);
const s5total = [['','סה"כ', eur(totalOurMissing), '', '', '']];
const ws5 = XLSX.utils.aoa_to_sheet([s5header, ...s5rows, ...s5total]);
ws5['!cols'] = [{wch:14},{wch:55},{wch:12},{wch:32},{wch:12},{wch:35}];
XLSX.utils.book_append_sheet(wb, ws5, '🚨 הזמנות חסרות');

// ── Save ──────────────────────────────────────────────────────────────────────
const outPath = 'C:/Users/Omri/Documents/PayPal-StubHub-Reconciliation-Apr2026.xlsx';
XLSX.writeFile(wb, outPath);
console.log('✅ Saved:', outPath);
console.log('\n=== KEY NUMBERS ===');
console.log('Total PayPal received (matched orders):', eur(summary.total_paypal_received), '€');
console.log('DB orders not in PayPal:', summary.db_only_count, '(zero — all paid!)');
console.log('Discrepancies:', summary.amount_discrepancies);
console.log('Missing orders (our games, not synced):', ourMissing.length, '— total:', eur(totalOurMissing), '€');
console.log('\nPayee breakdown:');
Object.entries(payeeBreakdown).sort((a,b)=>b[1].total-a[1].total).forEach(([e,d]) => {
  console.log(' ', e, ':', eur(d.total), '€ (', d.orders, 'orders)');
});
