'use strict';
const XLSX = require('./backend/node_modules/xlsx');
const fs = require('fs');

// ── 1. PAYPAL DATA ────────────────────────────────────────────────────────────
const wb = XLSX.readFile('C:/Users/Omri/Documents/\u05e4\u05d9\u05d9\u05e4\u05d0\u05dc/114568896.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const allRows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
const header = allRows[0];
const paypalRows = allRows.slice(1).filter(r => String(r[2]) >= '2026-03').map(r => {
  const o = {}; header.forEach((h,i) => o[h] = r[i]); return o;
});

const PAID_STATUSES = new Set(['Payment Notified','GP Payment Completed','GP Payment Sent To Payment Gateway',
  'Fund Capture','Ready To Pay','Payment Assigned To Batch']);

const paypalBySale = {};
paypalRows.forEach(r => {
  const sid = String(r.SALE_ID);
  if (!paypalBySale[sid]) paypalBySale[sid] = {
    total_paid:0, payees:new Set(), statuses:new Set(),
    event_name: r.EVENT_NAME, date: String(r.TRANSACTION_DATE).substring(0,10),
    cancelled: false
  };
  const p = paypalBySale[sid];
  if (PAID_STATUSES.has(r.SELLER_PAYMENT_STATUS_DETAIL)) p.total_paid += parseFloat(r.AMOUNT)||0;
  if (r.SELLER_PAYMENT_STATUS_DETAIL.includes('Cancel')) p.cancelled = true;
  if (r.PAYEE_NAME) p.payees.add(r.PAYEE_NAME);
  p.statuses.add(r.SELLER_PAYMENT_STATUS_DETAIL);
});

// Round totals
Object.values(paypalBySale).forEach(p => {
  p.total_paid = Math.round(p.total_paid * 100) / 100;
  p.payees = [...p.payees].join('; ');
  p.statuses = [...p.statuses].join('; ');
});

// ── 2. DB DATA (read from saved JSON) ─────────────────────────────────────────
const dbOrders = JSON.parse(fs.readFileSync('C:/Users/Omri/game-dashboard/db-orders.json', 'utf8'));

// ── 3. CROSS-REFERENCE ────────────────────────────────────────────────────────
const dbByNum = {};
dbOrders.forEach(o => { dbByNum[String(o.order_number)] = o; });

const paypalSaleIds = new Set(Object.keys(paypalBySale));
const dbNums = new Set(Object.keys(dbByNum));

const matched = [];       // in both DB and PayPal
const dbOnly = [];        // in DB, NOT in PayPal
const paypalOnly = [];    // in PayPal, NOT in DB
const amountDiff = [];    // matched but amounts differ

paypalSaleIds.forEach(sid => {
  const pp = paypalBySale[sid];
  if (dbByNum[sid]) {
    const db = dbByNum[sid];
    const diff = Math.round((pp.total_paid - db.total_amount) * 100) / 100;
    matched.push({
      order_number: sid,
      game_name: db.game_name,
      game_datetime: db.game_datetime,
      db_amount: db.total_amount,
      paypal_paid: pp.total_paid,
      diff,
      payee: pp.payees,
      paypal_status: pp.statuses,
      cancelled: pp.cancelled,
      paypal_date: pp.date
    });
    if (Math.abs(diff) > 0.05) amountDiff.push({ order_number: sid, game_name: db.game_name, db_amount: db.total_amount, paypal_paid: pp.total_paid, diff });
  } else {
    // PayPal sale not in DB
    if (!pp.cancelled || pp.total_paid > 0) {
      paypalOnly.push({
        order_number: sid,
        event_name: pp.event_name,
        paypal_paid: pp.total_paid,
        payee: pp.payees,
        paypal_status: pp.statuses,
        paypal_date: pp.date
      });
    }
  }
});

dbNums.forEach(num => {
  if (!paypalSaleIds.has(num)) {
    const db = dbByNum[num];
    dbOnly.push({
      order_number: num,
      game_name: db.game_name,
      game_datetime: db.game_datetime,
      db_amount: db.total_amount,
      buyer_email: db.buyer_email,
      created_at: db.created_at
    });
  }
});

// ── 4. SUMMARIES ──────────────────────────────────────────────────────────────
const totalPaypalPaid = matched.reduce((s,r) => s + r.paypal_paid, 0);
const totalDbMatched = matched.reduce((s,r) => s + r.db_amount, 0);
const totalDbOnly = dbOnly.reduce((s,r) => s + r.db_amount, 0);
const totalPaypalOnly = paypalOnly.reduce((s,r) => s + r.paypal_paid, 0);

// Payee breakdown
const payeeBreakdown = {};
matched.forEach(r => {
  r.payee.split('; ').forEach(p => {
    if (p) { payeeBreakdown[p] = (payeeBreakdown[p]||0) + r.paypal_paid; }
  });
});

const summary = {
  matched_count: matched.length,
  total_paypal_received: Math.round(totalPaypalPaid*100)/100,
  total_db_matched: Math.round(totalDbMatched*100)/100,
  db_only_count: dbOnly.length,
  db_only_total: Math.round(totalDbOnly*100)/100,
  paypal_only_count: paypalOnly.length,
  paypal_only_total: Math.round(totalPaypalOnly*100)/100,
  amount_discrepancies: amountDiff.length,
  payee_breakdown: payeeBreakdown
};

const result = { summary, matched, dbOnly, paypalOnly, amountDiff };
fs.writeFileSync('C:/Users/Omri/game-dashboard/reconcile-result.json', JSON.stringify(result, null, 2));
console.log('SUMMARY:', JSON.stringify(summary, null, 2));
console.log('\nDB ORDERS NOT IN PAYPAL:', dbOnly.length);
dbOnly.forEach(r => console.log(' -', r.order_number, r.game_name, '€'+r.db_amount));
console.log('\nPAYPAL ORDERS NOT IN DB (paid ones only):', paypalOnly.filter(p=>p.paypal_paid>0).length);
paypalOnly.filter(p=>p.paypal_paid>0).slice(0,20).forEach(r => console.log(' -', r.order_number, r.event_name, '€'+r.paypal_paid, '->', r.payee));
console.log('\nAMOUNT DISCREPANCIES:', amountDiff.length);
amountDiff.forEach(r => console.log(' -', r.order_number, r.game_name, 'DB:€'+r.db_amount, 'PP:€'+r.paypal_paid, 'diff:€'+r.diff));
