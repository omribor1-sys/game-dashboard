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
async function fetchMatches(competitionCode, sourceSeason, _retry = 0) {
  const url = `${BASE}/competitions/${competitionCode}/matches?season=${sourceSeason}`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY } });

  // Rate limited → back off using Retry-After, retry once.
  if (res.status === 429 && _retry < 1) {
    const wait = Number(res.headers.get('Retry-After')) || 60;
    console.warn(`[football-data] 429 on ${competitionCode} — waiting ${wait}s then retrying`);
    await sleep(wait * 1000);
    return fetchMatches(competitionCode, sourceSeason, _retry + 1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data ${competitionCode} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return Array.isArray(data.matches) ? data.matches : [];
}

module.exports = { hasApiKey, fetchMatches, sleep };
