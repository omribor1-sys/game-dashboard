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

const TEAM_SPLIT = /\s+(?:vs\.?|v)\s+/i;

/**
 * Split a game name into its team phrases, stripped of corporate suffixes only.
 * "Manchester City" and "Manchester United" MUST stay distinct — do not strip
 * City/United/Hotspur here, or the two Manchester clubs collapse into one.
 * A name with no "vs" (e.g. "Community Shield") yields a single phrase.
 */
function teamPhrases(gameName) {
  return String(gameName ?? '')
    .split(TEAM_SPLIT)
    .map(t => t.replace(/\b(FC|AFC)\b/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(t => t.length > 2);
}

/**
 * True when two game names refer to the same physical fixture, i.e. they share a
 * team. Containment is checked both ways so "Tottenham" matches "Tottenham
 * Hotspur" and "Leeds United" matches "Leeds United - FA Cup - Semi-final".
 *
 * This is the ONLY safe merge rule: a shared kickoff time is not enough, because
 * every game of a Premier League final matchday kicks off simultaneously.
 */
function sharesTeam(nameA, nameB) {
  const a = teamPhrases(nameA);
  const b = teamPhrases(nameB);
  return a.some(x => b.some(y => x === y || x.includes(y) || y.includes(x)));
}

/**
 * Normalize a raw game name (from StubHub or FTN email) to the canonical DB name.
 * Steps:
 *   1. Strip date/time suffix " | Day, DD/MM/YYYY, HH:MM" (but save it for step 2.5)
 *   2. Check hardcoded GAME_NAME_MAP (fastest, most reliable)
 *   2.5 ⭐ dedup on datetime AND a shared team — same kickoff alone is NOT enough
 *       (final matchday: all 10 PL games kick off at once).
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
    // Step 2.5: dedup on datetime + shared team ⭐
    // Rule: a team cannot play two games at the same date+time. So if an existing
    // order sits at this EXACT datetime AND shares a team with the incoming name,
    // it is the same physical game — adopt the existing name.
    //
    // Matching on datetime ALONE is wrong and corrupts revenue: on a Premier League
    // final matchday all 10 fixtures kick off simultaneously, so every new game
    // would be silently renamed to whichever one landed in the DB first.
    if (datetime) {
      const sameSlot = db.prepare(
        `SELECT DISTINCT game_name FROM orders WHERE game_datetime = ? AND deleted_at IS NULL`
      ).all(datetime);

      const twin = sameSlot.find(r => sharesTeam(name, r.game_name));
      if (twin) {
        if (twin.game_name !== name) {
          console.log(`[normalize] datetime+team dedup: "${name}" → "${twin.game_name}" (${datetime})`);
        }
        return twin.game_name;
      }

      if (sameSlot.length > 0) {
        // Concurrent but different fixture (normal on a final matchday), or a game
        // labelled so differently that no team matches — which needs a human and a
        // GAME_NAME_MAP entry. Either way: never auto-merge.
        console.log(`[normalize] "${name}" shares ${datetime} with ${sameSlot.length} other game(s) but no team — keeping separate`);
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

module.exports = { normalizeGameName, GAME_NAME_MAP, sharesTeam, teamPhrases };
