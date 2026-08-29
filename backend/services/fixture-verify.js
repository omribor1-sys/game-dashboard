'use strict';

// Cross-source verification for the fixtures board.
//
// Why this exists: every fixture/orders bug found on 2026-08-25..29 was SILENT. The Gmail
// importer dropped sales past a 50-message page and reported success. The name normaliser
// filed Crystal Palace's game under Brentford and reported success. The team matcher put
// Lillestrøm under Lille and reported success. Nothing in the system disagreed with itself,
// because every check compared the data to itself.
//
// So this compares each stored fixture to an INDEPENDENT source that never touched the
// write path, and reports only disagreements:
//   • kickoff differs by more than the tolerance  → someone is stale or wrong
//   • final score differs                          → a result was misrecorded
//   • the fixture is missing from the other source → one of them dropped it
//
// It is read-only by design. It never "fixes" anything: a verifier that repairs data can
// launder a bad source into the database, which is the failure it exists to catch.

const db = require('../database');

const TSDB = 'https://www.thesportsdb.com/api/v1/json/123';
const UEFA = 'https://match.uefa.com/v5/matches';
const REQUEST_SPACING_MS = 2500;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// A kickoff is "the same" within this much drift. Providers disagree by minutes on
// provisional times; anything larger is a real reschedule one side has not picked up.
const KICKOFF_TOLERANCE_MIN = 15;

// How far around today to check. Verifying the whole season every night would burn the
// quota to re-confirm games nobody can act on any more.
const DAYS_BACK = 4;
const DAYS_AHEAD = 7;

// Each stored competition is checked against a source that did NOT write it.
// Verifying a source against itself proves nothing.
const CHECKS = [
  { code: 'PL',  written_by: 'football-data', verify_with: 'thesportsdb', tsdb_id: 4328 },
  { code: 'EFL', written_by: 'thesportsdb',   verify_with: 'uefa-none',   tsdb_id: 4570 },
  { code: 'CL',  written_by: 'uefa',          verify_with: 'thesportsdb', tsdb_id: 4480 },
  { code: 'UEL', written_by: 'uefa',          verify_with: 'thesportsdb', tsdb_id: 4481 },
];

const { normTeam } = require('../utils/team-match');

function ymdWindow() {
  const out = [];
  const now = Date.now();
  for (let d = -DAYS_BACK; d <= DAYS_AHEAD; d++) {
    out.push(new Date(now + d * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'game-dashboard-verify/1.0', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Independent view of one competition-day, keyed so it can be matched to our rows.
async function externalDay(check, ymd) {
  if (!check.tsdb_id) return null;
  const data = await fetchJson(`${TSDB}/eventsday.php?d=${ymd}&l=${check.tsdb_id}`);
  const events = Array.isArray(data.events) ? data.events : [];
  return events.map(e => ({
    home: e.strHomeTeam, away: e.strAwayTeam,
    kickoff: e.strTimestamp
      ? new Date(e.strTimestamp.replace(' ', 'T') + 'Z')
      : (e.dateEvent ? new Date(`${e.dateEvent}T${e.strTime && e.strTime !== '00:00:00' ? e.strTime : '00:00:00'}Z`) : null),
    home_score: e.intHomeScore === null || e.intHomeScore === '' ? null : Number(e.intHomeScore),
    away_score: e.intAwayScore === null || e.intAwayScore === '' ? null : Number(e.intAwayScore),
  }));
}

// Two fixtures are the same tie when BOTH sides match. One shared team is not enough —
// that is precisely the assumption that merged Newcastle/West Brom into Newcastle/West Ham.
function sameTie(a, b) {
  const ah = normTeam(a.home), aa = normTeam(a.away);
  const bh = normTeam(b.home), ba = normTeam(b.away);
  if (!ah || !aa || !bh || !ba) return false;
  const near = (x, y) => x === y || (x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x)));
  return near(ah, bh) && near(aa, ba);
}

/**
 * Compare stored fixtures against an independent source.
 * @returns {{checked:number, mismatches:Array, unverified:Array, errors:string[], byCompetition:Object}}
 */
async function verifyFixtures() {
  const days = ymdWindow();
  const from = `${days[0]}T00:00:00Z`;
  const to = `${days[days.length - 1]}T23:59:59Z`;

  const report = { window: { from, to }, checked: 0, mismatches: [], unverified: [], errors: [], byCompetition: {} };

  for (const check of CHECKS) {
    if (!check.tsdb_id || check.verify_with === 'uefa-none') {
      // No second source for this competition yet — say so out loud rather than let it
      // look verified. Silent gaps are how the last three bugs survived.
      report.unverified.push(`${check.code}: no independent source configured (written by ${check.written_by})`);
      continue;
    }

    const ours = db.prepare(`
      SELECT id, home_team, away_team, kickoff_utc, home_score, away_score, status
      FROM fixtures
      WHERE competition_code = ? AND kickoff_utc BETWEEN ? AND ?
      ORDER BY kickoff_utc
    `).all(check.code, from, to);

    const stats = { code: check.code, ours: ours.length, matched: 0, mismatched: 0, missing_remote: 0 };

    // group our rows by day so each day costs exactly one external request
    const byDay = new Map();
    for (const f of ours) {
      const d = String(f.kickoff_utc).slice(0, 10);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(f);
    }

    for (const [ymd, rows] of byDay) {
      let remote;
      try {
        remote = await externalDay(check, ymd);
      } catch (e) {
        report.errors.push(`${check.code} ${ymd}: ${e.message}`);
        await sleep(REQUEST_SPACING_MS);
        continue;
      }
      await sleep(REQUEST_SPACING_MS);
      if (!remote) continue;

      // ⚠️ "The source returned nothing" is NOT "the fixture does not exist".
      // First run of this checker reported 67/67 fixtures missing, because an empty
      // response — TheSportsDB answers {"events":null} when it is throttled, and also
      // when it simply has no 2026/27 Champions League at all — was being counted as 67
      // disagreements. A verifier that cries wolf every morning is worse than none: it
      // trains you to ignore the one morning it is right. No data means UNVERIFIED.
      if (remote.length === 0) {
        report.unverified.push(
          `${check.code} ${ymd}: ${check.verify_with} returned no events for a day we hold ${rows.length} fixture(s)`
        );
        stats.unverified_days = (stats.unverified_days || 0) + 1;
        stats.unverified_fixtures = (stats.unverified_fixtures || 0) + rows.length;
        continue;
      }

      for (const f of rows) {
        report.checked++;
        const twin = remote.find(r => sameTie(f, r));
        if (!twin) {
          // The other source may simply file it on the neighbouring day in its own
          // timezone; only flag when it is absent from the whole competition-day.
          stats.missing_remote++;
          report.mismatches.push({
            competition: check.code, severity: 'missing',
            fixture: `${f.home_team} vs ${f.away_team}`,
            ours: f.kickoff_utc, theirs: null,
            detail: `not found in ${check.verify_with} on ${ymd}`,
            // What the other source DID return that day. Without this a "missing" verdict
            // is unactionable — you cannot tell a real gap from the two sources simply
            // spelling the clubs differently.
            remote_sample: remote.slice(0, 4).map(r => `${r.home} vs ${r.away}`),
          });
          continue;
        }

        let ok = true;
        if (twin.kickoff && f.kickoff_utc) {
          const driftMin = Math.abs(new Date(f.kickoff_utc) - twin.kickoff) / 60000;
          if (driftMin > KICKOFF_TOLERANCE_MIN) {
            ok = false;
            report.mismatches.push({
              competition: check.code, severity: 'kickoff',
              fixture: `${f.home_team} vs ${f.away_team}`,
              ours: f.kickoff_utc, theirs: twin.kickoff.toISOString(),
              detail: `kickoff differs by ${Math.round(driftMin)} min`,
            });
          }
        }

        const bothScored = f.home_score !== null && twin.home_score !== null;
        if (bothScored && (f.home_score !== twin.home_score || f.away_score !== twin.away_score)) {
          ok = false;
          report.mismatches.push({
            competition: check.code, severity: 'score',
            fixture: `${f.home_team} vs ${f.away_team}`,
            ours: `${f.home_score}-${f.away_score}`,
            theirs: `${twin.home_score}-${twin.away_score}`,
            detail: 'final score differs',
          });
        }

        if (ok) stats.matched++; else stats.mismatched++;
      }
    }

    // Second guard, one level up: if a competition produced not a single confirmed
    // fixture, the pairing itself is broken (wrong league id, a source that does not
    // carry this season, an IP being throttled) — not N separate data bugs. Withdraw
    // its findings and say the competition is unverified.
    if (stats.ours > 0 && stats.matched === 0) {
      report.diagnostics = report.diagnostics || [];
      report.diagnostics.push(...report.mismatches.filter(m => m.competition === check.code).slice(0, 3));
      report.mismatches = report.mismatches.filter(m => m.competition !== check.code);
      report.unverified.push(
        `${check.code}: could not verify ANY of ${stats.ours} fixtures against ${check.verify_with} — treat the pairing as broken, not the data`
      );
      stats.pairing_broken = true;
    }

    report.byCompetition[check.code] = stats;
  }

  console.log('[fixture-verify]', JSON.stringify({
    checked: report.checked, mismatches: report.mismatches.length,
    unverified: report.unverified.length, errors: report.errors.length,
  }));
  return report;
}

// Which competitions could not be verified last run. A competition that has never been
// verifiable (TheSportsDB has no 2026/27 Champions League) must not page Omri every
// morning — but a competition that verified yesterday and does not today is exactly the
// silent gap this whole checker exists to surface. So: alert on the CHANGE, not the state.
function unverifiedCodes(report) {
  return [...new Set(Object.entries(report.byCompetition)
    .filter(([, s]) => s.pairing_broken)
    .map(([code]) => code))].sort();
}

function newlyUnverified(report) {
  const now = unverifiedCodes(report);
  let before = [];
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='verify_unverified_codes'").get();
    if (row && row.value) before = JSON.parse(row.value);
  } catch (_) {}
  try {
    db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at)
                VALUES ('verify_unverified_codes', ?, CURRENT_TIMESTAMP)`).run(JSON.stringify(now));
  } catch (_) {}
  return now.filter(c => !before.includes(c));
}

/** One-line-per-problem Hebrew summary for WhatsApp. Empty string when everything agrees. */
function formatAlert(report) {
  const broke = newlyUnverified(report);
  const brokeLine = broke.length
    ? `⚠️ אימות נשבר: ${broke.join(', ')} — אף משחק לא אומת מול המקור החיצוני`
    : '';
  if (!report.mismatches.length) return brokeLine;
  const head = `🔍 אימות לוח משחקים: ${report.mismatches.length} אי-התאמות מתוך ${report.checked} משחקים שנבדקו`;
  const lines = report.mismatches.slice(0, 10).map(m => {
    if (m.severity === 'missing') return `• ${m.competition} ${m.fixture} — לא נמצא במקור השני`;
    if (m.severity === 'score') return `• ${m.competition} ${m.fixture} — תוצאה: אצלנו ${m.ours}, אצלם ${m.theirs}`;
    return `• ${m.competition} ${m.fixture} — ${m.detail}`;
  });
  const more = report.mismatches.length > 10 ? `\n(ועוד ${report.mismatches.length - 10})` : '';
  return `${head}\n${lines.join('\n')}${more}`;
}

module.exports = { verifyFixtures, formatAlert, sameTie, unverifiedCodes, CHECKS };
