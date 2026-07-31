const db = require('./database');

const fixes = [
  // Arsenal vs Newcastle — 15 orders with wrong date (Arsenal vs Fulham's date)
  {
    label: 'Arsenal vs Newcastle: wrong date "Sat, 25/04/2026, 17:30" → "Wed, 22/04/2026, 20:00"',
    where: "game_datetime = 'Sat, 25/04/2026, 17:30' AND (game_name LIKE '%Newcastle%' OR game_name LIKE '%Arsenal%Newcastle%')",
    newDatetime: 'Wed, 22/04/2026, 20:00',
  },
  // Arsenal vs Newcastle — 14 orders with full day name
  {
    label: 'Arsenal vs Newcastle: "Wednesday, 22/04/2026, 20:00" → "Wed, 22/04/2026, 20:00"',
    where: "game_datetime = 'Wednesday, 22/04/2026, 20:00'",
    newDatetime: 'Wed, 22/04/2026, 20:00',
  },
  // Fulham vs Aston Villa — 4 orders with completely wrong date
  {
    label: 'Fulham vs Aston Villa: "Sat, 25/04/2026, 12:30" → "Sat, 19/04/2026, 17:30"',
    where: "game_datetime = 'Sat, 25/04/2026, 12:30' AND game_name LIKE '%Fulham%Aston%'",
    newDatetime: 'Sat, 19/04/2026, 17:30',
  },
  // Fulham vs Aston Villa — might also match reversed
  {
    label: 'Aston Villa vs Fulham: "Sat, 25/04/2026, 12:30" → "Sat, 19/04/2026, 17:30"',
    where: "game_datetime = 'Sat, 25/04/2026, 12:30' AND game_name LIKE '%Aston%Fulham%'",
    newDatetime: 'Sat, 19/04/2026, 17:30',
  },
  // Man City vs Southampton — 3 orders with full day name and no time
  {
    label: 'Man City vs Southampton: "Friday, 25/04/2026" → "Fri, 25/04/2026, 17:15"',
    where: "game_datetime = 'Friday, 25/04/2026'",
    newDatetime: 'Fri, 25/04/2026, 17:15',
  },
];

for (const fix of fixes) {
  const rows = db.prepare(`SELECT id, order_number, game_name, game_datetime FROM orders WHERE ${fix.where} AND deleted_at IS NULL`).all();
  if (rows.length === 0) {
    console.log(`[SKIP] ${fix.label} — no rows matched`);
    continue;
  }
  const result = db.prepare(`UPDATE orders SET game_datetime = ? WHERE ${fix.where} AND deleted_at IS NULL`).run(fix.newDatetime);
  console.log(`[FIXED ${result.changes}] ${fix.label}`);
  rows.forEach(r => console.log(`  → order ${r.order_number} | "${r.game_name}" | was: "${r.game_datetime}"`));
}

console.log('\n=== Verification after fixes ===');
const allGames = db.prepare("SELECT game_name, game_datetime, COUNT(*) as cnt FROM orders WHERE deleted_at IS NULL GROUP BY game_name, game_datetime ORDER BY game_name").all();
allGames.forEach(g => console.log(`  "${g.game_name}" | "${g.game_datetime}" | ${g.cnt} orders`));
