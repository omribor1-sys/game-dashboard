'use strict';

const BASE = 'https://api.football-data.org/v4';

/** Returns true if an API key is configured. */
function hasApiKey() {
  return !!process.env.FOOTBALL_DATA_API_KEY;
}

/**
 * Fetch all matches for a competition + season.
 * @param {string} competitionCode e.g. 'PL'
 * @param {string} sourceSeason e.g. '2026'
 * @returns {Promise<Array>} the raw `matches[]` array (empty array if none)
 * @throws if the HTTP call fails (caller decides whether to continue)
 */
async function fetchMatches(competitionCode, sourceSeason) {
  const url = `${BASE}/competitions/${competitionCode}/matches?season=${sourceSeason}`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data ${competitionCode} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return Array.isArray(data.matches) ? data.matches : [];
}

module.exports = { hasApiKey, fetchMatches };
