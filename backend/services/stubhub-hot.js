'use strict';

// HOT-game detection from StubHub price movement (added 2026-09-24).
//
// Odds (hot-detect.js) say which fixtures SHOULD be big. The resale price says which ones
// ARE: when the cheapest ticket on StubHub climbs, buyers are clearing the floor faster than
// sellers refill it. That is the demand signal Omri actually trades on.
//
// Source: each English club's StubHub performer page. It is server-rendered, needs no login
// and no browser, and embeds every upcoming event of that club — PL, Europe and cups alike —
// with its "from" price (ticketInfo.minPrice, buyer-facing, fees included) and listed tickets.
// One observation per event per day goes into stubhub_price_obs; a jump is today's floor
// against the floor about a week ago.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BASE = 'https://www.stubhub.ie/';

// ponytail: hardcoded 2026/27 PL clubs; edit on promotion/relegation (ids are in any
// club page's performersCollection).
const PERFORMERS = [
  ['Arsenal', 'arsenal-fc-tickets/performer/165236/'],
  ['Aston Villa', 'aston-villa-fc-tickets/performer/164990/'],
  ['Bournemouth', 'afc-bournemouth-tickets/performer/1520306/'],
  ['Brentford', 'brentford-fc-tickets/performer/1498511/'],
  ['Brighton', 'brighton-hove-albion-fc-tickets/performer/1498518/'],
  ['Chelsea', 'chelsea-fc-tickets/performer/12847/'],
  ['Coventry', 'coventry-city-fc-tickets/performer/1518987/'],
  ['Crystal Palace', 'crystal-palace-fc-tickets/performer/732598/'],
  ['Everton', 'everton-fc-tickets/performer/165237/'],
  ['Fulham', 'fulham-fc-tickets/performer/165488/'],
  ['Hull', 'hull-city-tickets/performer/732596/'],
  ['Ipswich', 'ipswich-town-fc-tickets/performer/1498510/'],
  ['Leeds', 'leeds-united-tickets/performer/1498514/'],
  ['Liverpool', 'liverpool-fc-tickets/performer/13327/'],
  ['Man City', 'manchester-city-fc-tickets/performer/165242/'],
  ['Man United', 'manchester-united-tickets/performer/7367/'],
  ['Newcastle', 'newcastle-united-fc-tickets/performer/165241/'],
  ['Nottingham Forest', 'nottingham-forest-fc-tickets/performer/1519186/'],
  ['Sunderland', 'sunderland-afc-tickets/performer/708258/'],
  ['Tottenham', 'tottenham-hotspur-tickets/performer/164987/'],
];

// A jump is only worth a flag when it is both large and measured over enough time and
// enough stock to not be one odd listing. ponytail: thresholds are a first guess with no
// history to backtest against yet; retune once stubhub_price_obs has a few weeks.
const JUMP_PCT = 25;          // from-price up at least this much vs ~7 days ago
const DAY_JUMP_PCT = 20;      // or this much vs yesterday (a sudden move)
const MIN_TICKETS = 20;       // thinner markets move on a single listing
const BASELINE_DAYS = 7;
const MIN_PAGES_OK = 16;      // below this the run is too partial to clear/re-mark flags

// Hospitality / parking / women's events share the club page but are a different market.
const SKIP_NAME = /hospitality|vip|package|parking|women|legends|tour|museum/i;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** One StubHub event (page state or search API — same shape) → our row, or null if unpriced. */
function toEvent(e) {
  const ti = e.ticketInfo;
  if (!ti || !(ti.minPrice > 0) || !e.eventDateLocal) return null;
  return {
    event_id: Number(e.id),
    status: e.status,
    name: e.name,
    url: BASE + String(e.webURI || '').replace(/^\//, ''),
    // "2026-10-10T17:30:00+0100" → add the colon so every Date parser accepts it
    kickoff_utc: new Date(e.eventDateLocal.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).toISOString(),
    min_price: Number(ti.minPrice),
    tickets: Number(ti.totalTickets) || 0,
    currency: ti.currencyCode,
  };
}

/** Pull every event with a price out of one performer page's HTML. */
function parseEvents(html) {
  const start = html.indexOf('window.__INITIAL_STATE__=');
  if (start < 0) throw new Error('no __INITIAL_STATE__ (page layout changed or blocked)');
  const end = html.indexOf('</script>', start);
  const state = JSON.parse(html.slice(start + 'window.__INITIAL_STATE__='.length, end).trim().replace(/;$/, ''));

  // The page splits one club's events across several lists (all / by distance); the union
  // is the full set, and numFound says how big that set should be.
  const out = new Map();
  let numFound = null;
  for (const [k, v] of Object.entries(state)) {
    if (!k.startsWith('app.entity.events.') || !Array.isArray(v?.events)) continue;
    if (Number.isFinite(v.numFound)) numFound = Math.max(numFound ?? 0, v.numFound);
    for (const e of v.events) {
      const ev = !out.has(e.id) && toEvent(e);
      if (ev) out.set(e.id, ev);
    }
  }
  return { events: [...out.values()], numFound };
}

/**
 * "Arsenal FC vs LOSC Lille - Champions League 2026-2027" → sides + competition label,
 * or null when it is not a two-team match.
 */
function splitTeams(name) {
  const m = name.match(/^(.*?)\s+-\s+([^-]+(?:-\d{4})?)$/);
  const core = m ? m[1] : name;
  const p = core.split(/\s+vs\.?\s+/i);
  if (p.length !== 2 || !p[0].trim() || !p[1].trim()) return null;
  return { home: p[0].trim(), away: p[1].trim(), label: m ? m[2].trim() : null };
}

// ── StubHub session ─────────────────────────────────────────────────────────
// The club page only server-renders its first 30 events; the rest (and the whole list, in
// one call) come from the catalog search API the page itself uses. That API wants a Hawk
// signature, and the page hands out the Hawk credentials (id/key) in the SH_BAU cookie on
// every anonymous visit — so one page load buys a session for the whole run.
async function openSession() {
  const r = await fetch(BASE + PERFORMERS[0][1], { headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' } });
  const cookies = r.headers.getSetCookie();
  await r.text();
  const bau = cookies.find(c => c.startsWith('SH_BAU='));
  if (!bau) throw new Error('no SH_BAU cookie');
  const cred = JSON.parse(decodeURIComponent(bau.split(';')[0].slice('SH_BAU='.length)));
  if (!cred.id || !cred.key) throw new Error('SH_BAU cookie without id/key');
  return { cred, cookie: cookies.map(c => c.split(';')[0]).join('; ') };
}

function hawkHeader({ id, key }, path) {
  const crypto = require('crypto');
  const ts = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(6).toString('base64url').slice(0, 6);
  const mac = crypto.createHmac('sha256', key)
    .update(`hawk.1.header\n${ts}\n${nonce}\nGET\n${path}\nwww.stubhub.ie\n443\n\n\n`)
    .digest('base64');
  return `Hawk id="${id}", ts="${ts}", nonce="${nonce}", mac="${mac}"`;
}

const performerIdOf = (path) => path.match(/performer\/(\d+)/)[1];

async function fetchClubApi(session, path) {
  const out = [];
  let numFound = null;
  for (let start = 0; start < 500; start += 100) {
    const q = `/bfx/api/search/catalog/events/v3/?shstore=14&status=active%20%7Ccontingent`
      + `&fieldList=id%2CticketInfo%2Cname%2CeventDateLocal%2CeventInfoUrl%2Cstatus`
      + `&sourceId=0%20%7C1%20%7C4001%20%7C5001%20%7C29001&start=${start}&rows=100`
      + `&sort=eventDateLocal%20asc&eventType=Main%7CFestival%7CSeason%7CTailgate%7CHospitality`
      + `&performerId=${performerIdOf(path)}`;
    const r = await fetch('https://www.stubhub.ie' + q, { headers: {
      'User-Agent': UA, accept: 'application/json', 'Accept-Language': 'en-IE',
      Authorization: hawkHeader(session.cred, q), Cookie: session.cookie,
    } });
    if (!r.ok) throw new Error(`search API HTTP ${r.status}`);
    const body = await r.json();
    numFound = body.numFound;
    for (const e of body.events || []) { const ev = toEvent(e); if (ev) out.push(ev); }
    if (!body.events?.length || start + 100 >= numFound) break;
  }
  return { events: out, numFound };
}

/** Full event list for one club: search API first, the 30-event page as a fallback. */
async function fetchClub(session, path) {
  if (session) {
    try { return { ...(await fetchClubApi(session, path)), via: 'api' }; }
    catch (e) { console.warn('[stubhub-hot] API failed, falling back to page:', path, e.message); }
  }
  return { ...parseEvents(await fetchPage(path)), via: 'page' };
}

/** Percent change of the from-price; null when there is nothing earlier to compare with. */
function pctChange(now, base) {
  if (!(now > 0) || !(base > 0)) return null;
  return Math.round(((now - base) / base) * 1000) / 10;
}

function tierOf(pct) { return pct >= 60 ? 'elite' : pct >= 40 ? 'high' : 'notable'; }

async function fetchPage(path) {
  const r = await fetch(BASE + path, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function detectStubhubHot() {
  const db = require('../database');
  const { canonTeam } = require('../utils/team-match');

  const today = new Date().toISOString().slice(0, 10);
  const summary = { pages_ok: 0, pages_failed: [], events: 0, matched: 0, marked: 0, cleared: 0,
                    truncated: [], hot: [], unmatched_jumps: [] };

  // ── 1. collect ────────────────────────────────────────────────────────────
  const events = new Map();
  let session = null;
  try { session = await openSession(); }
  catch (e) { summary.session_error = e.message; }
  for (const [club, path] of PERFORMERS) {
    try {
      const { events: evs, numFound, via } = await fetchClub(session, path);
      summary.pages_ok++;
      // The page fallback only carries a club's next 30 events. Say so instead of
      // silently watching part of a club's season.
      if (via === 'page' && numFound != null && evs.length < numFound) summary.truncated.push(`${club} ${evs.length}/${numFound}`);
      for (const e of evs) events.set(e.event_id, e);
    } catch (e) {
      summary.pages_failed.push(`${club}: ${e.message}`);
    }
    await sleep(1500);
  }

  const upsertObs = db.prepare(`
    INSERT INTO stubhub_price_obs (event_id, obs_date, name, kickoff_utc, min_price, tickets, currency, url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id, obs_date) DO UPDATE SET
      min_price=excluded.min_price, tickets=excluded.tickets, name=excluded.name,
      kickoff_utc=excluded.kickoff_utc, url=excluded.url, currency=excluded.currency`);
  // Baseline: the newest observation at least BASELINE_DAYS old; until a week of history
  // exists, the oldest one we have (so a jump shows from day two, over a shorter window).
  const baseWeek = db.prepare(`SELECT obs_date, min_price, tickets FROM stubhub_price_obs
                               WHERE event_id=? AND obs_date<=? ORDER BY obs_date DESC LIMIT 1`);
  const baseOldest = db.prepare(`SELECT obs_date, min_price, tickets FROM stubhub_price_obs
                                 WHERE event_id=? AND obs_date<? ORDER BY obs_date ASC LIMIT 1`);
  const baseDay = db.prepare(`SELECT obs_date, min_price, tickets FROM stubhub_price_obs
                              WHERE event_id=? AND obs_date<? ORDER BY obs_date DESC LIMIT 1`);
  const weekAgo = new Date(Date.now() - BASELINE_DAYS * 864e5).toISOString().slice(0, 10);

  const candidates = db.prepare(`SELECT id, home_team, away_team, kickoff_utc, is_hot, hot_source
                                 FROM fixtures WHERE kickoff_utc BETWEEN ? AND ?`);
  const setPrice = db.prepare(`UPDATE fixtures SET sh_event_id=?, sh_url=?, sh_min_price=?, sh_tickets=?,
                               sh_change_pct=?, sh_change_days=?, sh_checked_at=? WHERE id=?`);

  // ── 2. record + measure + attach to fixtures ──────────────────────────────
  const nowIso = new Date().toISOString();
  const jumps = [];
  for (const e of events.values()) {
    if (SKIP_NAME.test(e.name) || e.currency !== 'EUR' || e.kickoff_utc <= nowIso) continue;
    const sides = splitTeams(e.name);
    if (!sides) continue;
    summary.events++;

    upsertObs.run(e.event_id, today, e.name, e.kickoff_utc, e.min_price, e.tickets, e.currency, e.url);

    const wk = baseWeek.get(e.event_id, weekAgo) || baseOldest.get(e.event_id, today);
    const yd = baseDay.get(e.event_id, today);
    const change = wk ? pctChange(e.min_price, wk.min_price) : null;
    const days = wk ? Math.round((Date.parse(today) - Date.parse(wk.obs_date)) / 864e5) : null;
    const dayChange = yd ? pctChange(e.min_price, yd.min_price) : null;

    // Both clubs equal after canonicalisation and the kickoff within 36h — never one club
    // alone (that has merged two different fixtures in this codebase before).
    const t = Date.parse(e.kickoff_utc);
    const h = canonTeam(sides.home), a = canonTeam(sides.away);
    const fx = candidates.all(new Date(t - 36 * 3600e3).toISOString(), new Date(t + 36 * 3600e3).toISOString())
      .find(r => canonTeam(r.home_team) === h && canonTeam(r.away_team) === a) || null;
    if (fx) {
      summary.matched++;
      setPrice.run(e.event_id, e.url, e.min_price, e.tickets, change, days, nowIso, fx.id);
    }

    const isJump = e.tickets >= MIN_TICKETS &&
      ((change != null && change >= JUMP_PCT) || (dayChange != null && dayChange >= DAY_JUMP_PCT));
    if (isJump) jumps.push({ e, fx, wk, yd, change, days, dayChange });
  }

  // ── 3. flags ──────────────────────────────────────────────────────────────
  // A partial run must not wipe yesterday's flags for the clubs it failed to read.
  if (summary.pages_ok < MIN_PAGES_OK) {
    summary.skipped_marking = `only ${summary.pages_ok}/${PERFORMERS.length} club pages loaded`;
  } else {
    summary.cleared = db.prepare(`UPDATE fixtures SET is_hot=0, hot_tier=NULL, hot_reason=NULL, hot_score=NULL
                                  WHERE hot_source='stubhub' AND kickoff_utc > ?`).run(nowIso).changes || 0;
    const setHot = db.prepare(`UPDATE fixtures SET is_hot=1, hot_tier=?, hot_reason=?, hot_score=?, hot_source='stubhub'
                               WHERE id=? AND is_hot=0`);
    for (const j of jumps) {
      const eur = (n) => `€${Math.round(n)}`;
      const parts = [];
      if (j.change != null && j.change >= JUMP_PCT) {
        parts.push(`from-price ${eur(j.wk.min_price)} → ${eur(j.e.min_price)} (+${j.change}% in ${j.days}d)`);
      }
      if (j.dayChange != null && j.dayChange >= DAY_JUMP_PCT) {
        parts.push(`+${j.dayChange}% since yesterday`);
      }
      const base = j.wk || j.yd;
      if (base && base.tickets) parts.push(`listed tickets ${base.tickets} → ${j.e.tickets}`);
      const reason = `StubHub: ${parts.join(', ')}`;
      const pct = Math.max(j.change ?? 0, j.dayChange ?? 0);
      const row = { name: j.e.name, kickoff_utc: j.e.kickoff_utc, from: j.e.min_price, change_pct: pct, reason, url: j.e.url };
      if (!j.fx) { summary.unmatched_jumps.push(row); continue; }
      // Manual and odds flags stay as they are; the price columns still show the jump.
      if (setHot.run(tierOf(pct), reason, pct, j.fx.id).changes) summary.marked++;
      summary.hot.push(row);
    }
  }

  console.log('[stubhub-hot]', JSON.stringify({
    pages_ok: summary.pages_ok, failed: summary.pages_failed.length, events: summary.events,
    matched: summary.matched, jumps: jumps.length, marked: summary.marked, cleared: summary.cleared,
  }));
  return summary;
}

module.exports = { detectStubhubHot, parseEvents, splitTeams, pctChange, tierOf, PERFORMERS };
