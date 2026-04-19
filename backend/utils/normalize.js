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
  'arsenal fc vs sporting cp': 'Arsenal VS Sporting Lisbon 15/04/2026',
  'arsenal fc vs sporting cp - champions league 2025-2026': 'Arsenal VS Sporting Lisbon 15/04/2026',
  'arsenal vs sporting cp': 'Arsenal VS Sporting Lisbon 15/04/2026',
  'arsenal fc vs fulham fc': 'Arsenal vs Fulham',
  'brentford fc vs west ham united fc': 'Brentford vs West Ham',
  'brentford fc vs crystal palace fc': 'Brentford vs Crystal Palace',
  'tottenham hotspur vs nottingham forest fc': 'Tottenham Hotspur vs Nottingham Forest FC',
  'liverpool fc vs galatasaray': 'Liverpool FC vs Galatasaray',
  'carabao cup final 2026 - arsenal fc vs manchester city fc': 'Manchester City VS Arsenal CARABAO CUP 22 03 2026',
  'arsenal vs bayer leverkusen': 'Arsenal vs Bayer Leverkusen 17 03 2026',
  'manchester city fc vs southampton fc - fa cup - semi-final': 'Manchester City vs Southampton - FA Cup Semi-Final',
  'everton fc vs liverpool fc': 'Everton vs Liverpool',
  'liverpool fc vs everton fc': 'Liverpool vs Everton',
};

/**
 * Normalize a raw game name (from StubHub or FTN email) to the canonical DB name.
 * Steps:
 *   1. Strip date/time suffix " | Day, DD/MM/YYYY, HH:MM"
 *   2. Check hardcoded GAME_NAME_MAP (fastest, most reliable)
 *   3. Fuzzy-match against existing canonical names in DB orders table
 *
 * @param {string} rawName - raw game name, possibly with date suffix and FC/AFC suffixes
 * @param {object} db      - DatabaseSync instance (optional — fuzzy match skipped if omitted)
 * @returns {string} canonical game name
 */
function normalizeGameName(rawName, db) {
  if (!rawName) return rawName;
  // Step 1: strip date/time suffix " | Day, DD/MM/YYYY, HH:MM"
  let name = rawName.replace(/\s*\|.*$/, '').trim();
  // Step 2: hardcoded mapping (fastest, most reliable)
  const mapped = GAME_NAME_MAP[name.toLowerCase()];
  if (mapped) return mapped;
  // Step 3: fuzzy-match against existing canonical names in DB
  if (db) {
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
