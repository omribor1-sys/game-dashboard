'use strict';

// Hardcoded StubHub/FTN raw name → canonical DB name mapping.
// Add entries here whenever a new raw variant is discovered.
// Keys must be LOWERCASE and WITHOUT date suffix.
const GAME_NAME_MAP = {
  'arsenal fc vs afc bournemouth': 'Arsenal vs Bournemouth',
  'afc bournemouth vs arsenal fc': 'Bournemouth vs Arsenal',
  'manchester city fc vs arsenal fc': 'Manchester City vs Arsenal',
  'arsenal fc vs manchester city fc': 'Arsenal vs Manchester City',
  'arsenal fc vs newcastle united fc': 'Arsenal vs Newcastle United',
  'newcastle united fc vs arsenal fc': 'Newcastle United vs Arsenal',
  'newcastle united fc vs afc bournemouth': 'Newcastle vs Bournemouth',
  'chelsea fc vs manchester united': 'Chelsea vs Manchester United',
  'chelsea fc vs manchester city fc': 'Chelsea vs Manchester City',
  'tottenham hotspur fc vs brighton & hove albion fc': 'Tottenham vs Brighton',
  'tottenham hotspur vs brighton & hove albion fc': 'Tottenham vs Brighton',
  'brentford fc vs everton fc': 'Brentford vs Everton',
  'brentford fc vs fulham fc': 'Brentford vs Fulham',
  'liverpool fc vs fulham fc': 'Liverpool vs Fulham',
  'fulham fc vs aston villa fc': 'Fulham vs Aston Villa',
  'arsenal fc vs sporting cp': 'Arsenal vs Sporting Lisbon',
  'arsenal fc vs sporting cp - champions league 2025-2026': 'Arsenal vs Sporting Lisbon',
  'arsenal vs sporting cp': 'Arsenal vs Sporting Lisbon',
  'arsenal vs sporting lisbon': 'Arsenal vs Sporting Lisbon',
  'arsenal vs bayer leverkusen': 'Arsenal vs Bayer Leverkusen',
  'arsenal fc vs bayer leverkusen': 'Arsenal vs Bayer Leverkusen',
  'arsenal fc vs bayer 04 leverkusen': 'Arsenal vs Bayer Leverkusen',
  'arsenal fc vs fulham fc': 'Arsenal vs Fulham',
  'brentford fc vs west ham united fc': 'Brentford vs West Ham',
  'brentford fc vs crystal palace fc': 'Brentford vs Crystal Palace',
  'tottenham hotspur vs nottingham forest fc': 'Tottenham Hotspur vs Nottingham Forest FC',
  'liverpool fc vs galatasaray': 'Liverpool FC vs Galatasaray',
  'carabao cup final 2026 - arsenal fc vs manchester city fc': 'Manchester City vs Arsenal - Carabao Cup',
  'arsenal vs bayer leverkusen': 'Arsenal vs Bayer Leverkusen',
  'manchester city fc vs southampton fc - fa cup - semi-final': 'Manchester City vs Southampton - FA Cup Semi-Final',
  'everton fc vs liverpool fc': 'Everton vs Liverpool',
  'liverpool fc vs everton fc': 'Liverpool vs Everton',
  // FA Cup Final 16/05/2026 — was mislabelled on some StubHub listings
  'chelsea fc vs manchester city fc - fa cup - final': 'Chelsea vs Manchester City',
  'chelsea fc vs manchester city fc - fa cup final': 'Chelsea vs Manchester City',
  'chelsea vs manchester city - fa cup - final': 'Chelsea vs Manchester City',
  'chelsea vs manchester city - fa cup final': 'Chelsea vs Manchester City',
  'chelsea vs leeds united - fa cup - semi-final': 'Chelsea vs Manchester City',
  'chelsea fc vs leeds united - fa cup - semi-final': 'Chelsea vs Manchester City',
  // Tottenham vs Leeds United
  'tottenham hotspur fc vs leeds united fc': 'Tottenham vs Leeds United',
  'tottenham hotspur vs leeds united': 'Tottenham vs Leeds United',
};

/**
 * Normalize a raw game name (from StubHub or FTN email) to the canonical DB name.
 * Steps:
 *   1. Strip date/time suffix " | Day, DD/MM/YYYY, HH:MM" (but save it for step 2.5)
 *   2. Check hardcoded GAME_NAME_MAP (fastest, most reliable)
 *   2.5 ⭐ datetime-based dedup — if another game already exists at the EXACT same
 *       game_datetime, use that game's name. This prevents the same physical game from
 *       appearing twice in the dashboard under different names (e.g. different StubHub
 *       label vs normalised name).
 *   3. Fuzzy-match against existing canonical names in DB orders table
 *
 * @param {string} rawName - raw game name, possibly with date suffix and FC/AFC suffixes
 * @param {object} db      - DatabaseSync instance (optional — steps 2.5+3 skipped if omitted)
 * @returns {string} canonical game name
 */
function normalizeGameName(rawName, db) {
  if (!rawName) return rawName;
  // Step 1: strip date/time suffix " | Day, DD/MM/YYYY, HH:MM" and preserve datetime
  const suffixMatch = rawName.match(/\|\s*(\w{2,10},\s*\d{2}\/\d{2}\/\d{4},\s*\d{2}:\d{2})/);
  const datetime = suffixMatch ? suffixMatch[1].trim() : null;
  let name = rawName.replace(/\s*\|.*$/, '').trim();

  // Step 2: hardcoded mapping (fastest, most reliable)
  const mapped = GAME_NAME_MAP[name.toLowerCase()];
  if (mapped) return mapped;

  if (db) {
    // Step 2.5: datetime-based dedup ⭐
    // Rule: a team cannot play two games at the same date+time.
    // If we already have orders at this EXACT datetime, use THAT game's name,
    // regardless of the name in the new email.
    // Also: if any TEAM from the new game appears in an existing game at the same datetime,
    // it's the same physical game — use the existing name.
    if (datetime) {
      // 2.5a — exact datetime match (catches most cases)
      const dtRow = db.prepare(
        `SELECT game_name FROM orders WHERE game_datetime = ? AND deleted_at IS NULL LIMIT 1`
      ).get(datetime);
      if (dtRow) {
        console.log(`[normalize] datetime dedup: "${name}" → "${dtRow.game_name}" (same datetime: ${datetime})`);
        return dtRow.game_name;
      }

      // 2.5b — team-name + datetime conflict detection (WARNING only — no auto-merge)
      // A team cannot play two games at the same time. If we detect a conflict,
      // log it loudly so the integrity check picks it up — but do NOT auto-merge,
      // because the existing name in DB might itself be the wrong one.
      // A human must decide which name is correct via rename-game-in-orders.
      const vsParts = name.split(/\s+vs\.?\s+/i);
      if (vsParts.length >= 2) {
        const teams = vsParts.map(t => t.replace(/\s*(FC|AFC|United|City|Hotspur)\s*$/i, '').trim()).filter(t => t.length > 2);
        for (const team of teams) {
          const teamRow = db.prepare(
            `SELECT game_name FROM orders WHERE game_datetime = ? AND game_name LIKE ? AND deleted_at IS NULL LIMIT 1`
          ).get(datetime, `%${team}%`);
          if (teamRow && teamRow.game_name !== name) {
            console.warn(`[normalize] ⚠️  DUPLICATE GAME DETECTED: "${name}" conflicts with "${teamRow.game_name}" (team "${team}" at ${datetime}). Manual merge required via /api/admin/rename-game-in-orders`);
            // DO NOT auto-merge — wrong direction would corrupt data
          }
        }
      }
    }

    // Step 3: fuzzy-match against existing canonical names in DB
    const words = name.split(/\s+/).filter(w => w.length > 3 && !/^(vs|vs\.|AFC|FC|United|City)$/i.test(w));
    if (words.length >= 2) {
      const likeClause = words.slice(0, 2).map(() => 'game_name LIKE ?').join(' AND ');
      const params = words.slice(0, 2).map(w => `%${w}%`);
      const match = db.prepare(
        `SELECT game_name FROM orders WHERE ${likeClause} AND deleted_at IS NULL LIMIT 1`
      ).get(...params);
      if (match) return match.game_name;
    }
  }
  return name;
}

module.exports = { normalizeGameName, GAME_NAME_MAP };
