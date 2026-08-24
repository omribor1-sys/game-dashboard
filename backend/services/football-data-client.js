'use strict';

const BASE = 'https://api.football-data.org/v4';

/** Returns true if an API key is configured. */
function hasApiKey() {
  return !!process.env.FOOTBALL_DATA_API_KEY;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch all matches for a competition + season.
 * Honors football-data's rate limiter (free tier = 10 req/min): if a 429 comes back,
 * it reads `Retry-After` (seconds) and retries once after waiting. This is the provider's
 * explicit recommendation — examine response headers for throttling.
 * @param {string} competitionCode e.g. 'PL'
 * @param {string} sourceSeason e.g. '2026'
 * @param {number} [_retry=0] internal retry counter
 * @returns {Promise<Array>} the raw `matches[]` array (empty array if none)
 * @throws if the HTTP call fails (caller decides whether to continue)
 */
async function apiGet(path, label, _retry = 0) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY } });

  // Rate limited → back off using Retry-After, retry once.
  if (res.status === 429 && _retry < 1) {
    const wait = Number(res.headers.get('Retry-After')) || 60;
    console.warn(`[football-data] 429 on ${label} — waiting ${wait}s then retrying`);
    await sleep(wait * 1000);
    return apiGet(path, label, _retry + 1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data ${label} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchMatches(competitionCode, sourceSeason) {
  const data = await apiGet(`/competitions/${competitionCode}/matches?season=${sourceSeason}`, competitionCode);
  return Array.isArray(data.matches) ? data.matches : [];
}

/**
 * Fetch the league table. Returns the `standings[]` blocks (TOTAL/HOME/AWAY, or one per
 * group in cup competitions); the caller keeps what it needs.
 */
async function fetchStandings(competitionCode, sourceSeason) {
  const data = await apiGet(`/competitions/${competitionCode}/standings?season=${sourceSeason}`, `${competitionCode} standings`);
  return Array.isArray(data.standings) ? data.standings : [];
}

module.exports = { hasApiKey, fetchMatches, fetchStandings, sleep };
