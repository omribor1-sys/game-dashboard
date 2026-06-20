'use strict';

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Convert an ISO UTC timestamp to a UK-local display string "Ddd, DD/MM/YYYY, HH:MM"
 * (Europe/London — BST/GMT handled by Intl). Returns null for falsy input.
 */
function toUkLocalString(utcIso) {
  if (!utcIso) return null;
  const d = new Date(utcIso);
  if (isNaN(d)) return null;
  // Use Intl to get Europe/London wall-clock parts.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
  // en-GB short weekday is already "Fri" etc.; normalize "24" hour to "00".
  const hour = parts.hour === '24' ? '00' : parts.hour;
  // If locale produces a non-standard weekday, fall back to DAY_ABBR via Europe/London weekday index.
  let weekday = parts.weekday;
  if (!DAY_ABBR.includes(weekday)) {
    const londonDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'narrow' })
      .formatToParts(d)
      .find(p => p.type === 'weekday');
    // compute weekday index by getting the numeric day from London's date
    const londonDate = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    weekday = DAY_ABBR[londonDate.getDay()];
  }
  return `${weekday}, ${parts.day}/${parts.month}/${parts.year}, ${hour}:${parts.minute}`;
}

/** True only when there is a real, non-null change from oldUtc to newUtc. */
function kickoffChanged(oldUtc, newUtc) {
  if (!oldUtc || !newUtc) return false;
  return new Date(oldUtc).getTime() !== new Date(newUtc).getTime();
}

/**
 * Build the SQL fragment for the home/away filter. Only meaningful with a team id.
 * @returns {{sql: string|null, params: any[]}}
 */
function homeAwayClause(homeAway, apiTeamId) {
  if (!apiTeamId) return { sql: null, params: [] };
  if (homeAway === 'home') return { sql: 'home_team_id = ?', params: [apiTeamId] };
  if (homeAway === 'away') return { sql: 'away_team_id = ?', params: [apiTeamId] };
  return { sql: '(home_team_id = ? OR away_team_id = ?)', params: [apiTeamId, apiTeamId] };
}

module.exports = { toUkLocalString, kickoffChanged, homeAwayClause, DAY_ABBR };
