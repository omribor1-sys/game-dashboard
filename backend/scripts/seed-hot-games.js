'use strict';
// Seed the initial "Hot Games" set for PL 2026/27 from the demand research
// (docs/research/2026-27-pl-demand-calendar.md). Idempotent: matches by date+home+away
// and sets is_hot/hot_tier/hot_reason. Re-runnable. More can be added during the season
// via the fixture edit modal (PUT /api/fixtures/:id) — this script does NOT clear other hots.
//
// Run on the server:  node /app/backend/scripts/seed-hot-games.js
const db = require('../database');

// [date(YYYY-MM-DD), home, away, tier(elite|high|notable), reason(English)]
const HOT = [
  // ELITE
  ['2027-05-01', 'Arsenal', 'Tottenham', 'elite', 'North London Derby on the Early May Bank Holiday weekend — the hottest ticket of the season.'],
  ['2026-12-26', 'Newcastle', 'Man City', 'elite', 'Boxing Day — peak festive demand, marquee opponent.'],
  ['2026-12-26', 'Crystal Palace', 'Arsenal', 'elite', "Boxing Day in London with Arsenal's large travelling support."],
  ['2027-05-08', 'Man City', 'Liverpool', 'elite', 'Potential title decider on the Ascension long-weekend.'],
  ['2026-12-19', 'Arsenal', 'Man United', 'elite', 'Global blockbuster the Saturday before Christmas — peak tourism.'],
  ['2026-11-28', 'Arsenal', 'Man City', 'elite', 'Title clash in London on US Thanksgiving weekend.'],
  ['2026-11-28', 'Everton', 'Liverpool', 'elite', 'Merseyside Derby on US Thanksgiving weekend.'],
  ['2026-09-13', 'Man United', 'Man City', 'elite', 'Manchester Derby.'],
  ['2027-03-20', 'Man City', 'Man United', 'elite', 'Manchester Derby (return fixture).'],
  ['2026-12-05', 'Tottenham', 'Arsenal', 'elite', 'North London Derby (Spurs home) during the festive build-up.'],
  // HIGH
  ['2026-12-26', 'Tottenham', 'Bournemouth', 'high', 'Boxing Day in London — peak festive tourism.'],
  ['2026-12-26', 'Man United', 'Nottingham', 'high', 'Boxing Day at Old Trafford.'],
  ['2026-12-19', 'Liverpool', 'Tottenham', 'high', 'Global fixture the Saturday before Christmas.'],
  ['2027-01-02', 'Man City', 'Tottenham', 'high', 'New Year round, peak London tourism.'],
  ['2027-01-02', 'Chelsea', 'Newcastle', 'high', 'New Year London fixture with two big travelling supports.'],
  ['2027-01-02', 'Arsenal', 'Ipswich Town', 'high', "New Year's fixture in London."],
  ['2027-01-06', 'Arsenal', 'Brentford', 'high', 'London derby on Epiphany (Spanish/Italian travel window).'],
  ['2027-01-06', 'Fulham', 'Tottenham', 'high', 'London derby on Epiphany.'],
  ['2027-01-06', 'Man United', 'Newcastle', 'high', 'Two big clubs meeting on Epiphany.'],
  ['2027-01-06', 'Crystal Palace', 'Chelsea', 'high', 'London derby on Epiphany.'],
  ['2027-03-13', 'Chelsea', 'Arsenal', 'high', 'London derby days after Eid al-Fitr — Gulf/Middle-East travel to London.'],
  ['2027-04-24', 'Chelsea', 'Man City', 'high', 'London marquee during Passover — Jewish-diaspora travel.'],
  ['2026-09-06', 'Arsenal', 'Chelsea', 'high', 'London top-club marquee with early-season hype.'],
  ['2026-11-21', 'Liverpool', 'Man United', 'high', 'Global blockbuster at Anfield.'],
  ['2027-02-06', 'Arsenal', 'Liverpool', 'high', 'Top-of-the-table marquee in London.'],
  ['2027-02-06', 'Man United', 'Chelsea', 'high', 'Global fixture with big London travelling support.'],
  ['2026-12-30', 'Fulham', 'Arsenal', 'high', 'Festive-block London derby.'],
  ['2027-05-08', 'Tottenham', 'Chelsea', 'high', 'London derby on the weekend of a possible title decider.'],
  // NOTABLE
  ['2026-10-24', 'Chelsea', 'Tottenham', 'notable', 'London derby.'],
  ['2026-10-31', 'Chelsea', 'Man United', 'notable', 'Global draw in London.'],
  ['2026-10-10', 'Liverpool', 'Man City', 'notable', 'Title-race magnet.'],
  ['2027-01-16', 'Tottenham', 'Leeds United', 'notable', 'US MLK weekend — London club at home.'],
  ['2027-01-16', 'Chelsea', 'Sunderland', 'notable', 'US MLK weekend — London club at home.'],
  ['2027-02-20', 'Arsenal', 'Fulham', 'notable', 'London derby in the February half-term / Presidents-Day travel window.'],
  ['2027-04-10', 'Chelsea', 'Fulham', 'notable', 'London derby in the Easter school-break window.'],
  ['2027-05-30', 'Chelsea', 'Brentford', 'notable', 'Final-day London derby + US Memorial Day / UK Spring Bank Holiday.'],
  ['2027-05-30', 'Arsenal', 'Brighton Hove', 'notable', 'Final day in London.'],
];

const find = db.prepare(
  "SELECT id FROM fixtures WHERE substr(kickoff_utc,1,10)=? AND home_team=? AND away_team=?"
);
const upd = db.prepare(
  "UPDATE fixtures SET is_hot=1, hot_tier=?, hot_reason=? WHERE id=?"
);

let ok = 0, miss = 0;
for (const [d, h, a, tier, reason] of HOT) {
  const row = find.get(d, h, a);
  if (row) { upd.run(tier, reason, row.id); ok++; }
  else { console.log('MISS:', d, h, 'vs', a); miss++; }
}
console.log(`Hot games seeded: ${ok} set, ${miss} not matched. Total hot now: ${db.prepare('SELECT COUNT(*) c FROM fixtures WHERE is_hot=1').get().c}`);
