---
name: gameyield-game-validator
description: >
  Use this skill EVERY TIME you are about to use a game_name in any DB operation in the
  game-dashboard project — insert order, close game, rename, or update. This skill prevents
  the recurring bug where orders are stored under a slightly different name than the canonical
  name in the games table (e.g. "Arsenal vs Bayer Leverkusen" vs "Arsenal vs Bayer Leverkusen
  17 03 2026", or "Arsenal vs Sporting Lisbon" vs "Arsenal VS Sporting Lisbon 15/04/2026").
  Trigger whenever: closing a game from a spreadsheet, inserting manual orders, renaming a game,
  or any time a game name comes from an email, spreadsheet title, or user message.
  CRITICAL: Step 3 (sync orders to canonical name) MUST run before closing every game —
  this is what prevents the "missing cost data" alert from reappearing after a game is closed.
---

# GameYield — Game Name Validator + Order Sync

The most common source of data corruption in this dashboard is a game_name mismatch: orders
stored under a slightly different name than the canonical entry in the `games` table. This
causes the orders page to show "missing cost data" for a game that is already closed — even
after fixing it once, it reappears because the orders were never synced to the canonical name.

**The "missing cost data" checker uses EXACT STRING MATCH.** If `orders.game_name` differs by
even one character from `games.name`, the game appears broken forever.

## Run this BEFORE any DB write involving game_name

This includes:
- Inserting a new order (manual or from a spreadsheet)
- Closing a game (writing costs to `games` table)
- Running `UPDATE orders SET game_name = ...`
- Running `POST /api/admin/rename-game-in-orders`

---

## Step 1 — Get canonical names from DB

Run both queries every time. They take 2 seconds and prevent hours of cleanup.

```bash
flyctl ssh console --app game-dashboard-omri --command "node -e \"
const db=require('/app/backend/database');

const games=db.prepare('SELECT name FROM games ORDER BY name').all();
console.log('=== GAMES TABLE ===');
games.forEach(g=>console.log(g.name));

const orders=db.prepare('SELECT game_name, COUNT(*) as cnt FROM orders WHERE deleted_at IS NULL GROUP BY game_name ORDER BY cnt DESC').all();
console.log('=== ORDERS TABLE ===');
orders.forEach(r=>console.log(r.cnt+'x  '+r.game_name));
\""
```

---

## Step 2 — Match the incoming name

Given the raw name (from spreadsheet title, email, or user message):

| Situation | Action |
|-----------|--------|
| **Exact match** in DB | Use it directly. No need to ask. |
| **Case-insensitive match** | Use the DB casing. No need to ask. |
| **Same teams, different suffix** (date missing or different) | Ask user before proceeding — see below. |
| **Abbreviation** ("Man City" vs "Manchester City") | Find the canonical form, confirm with user. |
| **No match at all** | List the 3 closest candidates, ask user. |
| **Multiple similar matches** | List all candidates, ask user to choose. |

**Rule of thumb**: If you have any doubt, ask. One extra question is infinitely cheaper
than corrupted revenue data.

If the name is not an exact match, show this before proceeding:

```
🔍 בדיקת שם משחק:
  קלט:      "Arsenal vs Bayer Leverkusen"
  קנוני:    "Arsenal vs Bayer Leverkusen 17 03 2026"

  האם להמשיך עם השם הקנוני?
```

Wait for explicit confirmation. Do not proceed with the non-canonical name.

---

## Step 3 — ⭐ SYNC ORDERS TO CANONICAL NAME (mandatory before closing)

This is the step that prevents "missing cost data" from reappearing after a game is closed.
Even if a game is closed correctly, orders under variant names keep triggering the alert.
This step renames ALL such orders to the canonical name in one shot.

**Run this every time you close a game, right before inserting cost data:**

```bash
flyctl ssh console --app game-dashboard-omri --command "node -e \"
const db=require('/app/backend/database');
const canonical='[EXACT CANONICAL NAME FROM STEP 1]';

// Extract first word of each team to use as search tokens
// e.g. 'Arsenal vs Bayer Leverkusen 17 03 2026' -> teams = ['Arsenal','Bayer']
const baseName=canonical.replace(/\s+(\d{2}[\s\/]\d{2}[\s\/]\d{4}|CARABAO|FA CUP|Champions|Semi|Final).*$/i,'').trim();
const parts=baseName.split(/\s+vs\.?\s+/i);
const t1=parts[0].split(' ')[0];
const t2=parts[1] ? parts[1].split(' ')[0] : '';

// Find all variant names that match same teams but are not canonical
const variants=db.prepare(
  'SELECT DISTINCT game_name,COUNT(*) as cnt FROM orders WHERE game_name!=? AND game_name LIKE ? AND (game_name LIKE ? OR ?=chr(39)+chr(39)) AND deleted_at IS NULL GROUP BY game_name'
).all(canonical,'%'+t1+'%',t2 ? '%'+t2+'%' : '%','');

if(!variants.length){console.log('No variants found — orders are clean');process.exit(0);}

console.log('Variants found:');
variants.forEach(v=>console.log('  '+v.cnt+'x ['+v.game_name+']'));

// Rename all variants to canonical
variants.forEach(v=>{
  const n=db.prepare('UPDATE orders SET game_name=? WHERE game_name=? AND deleted_at IS NULL').run(canonical,v.game_name).changes;
  console.log('  renamed '+n+': ['+v.game_name+'] -> ['+canonical+']');
});
\""
```

**What this does**: finds all orders where game_name contains the same team names (first word
of each team) as the canonical name, but doesn't exactly match it. Renames them all at once.

**If it finds unexpected variants** (a different game with the same team): verify with the
user before renaming. Check `game_datetime` to distinguish two games of the same teams.

---

## Step 4 — Date suffix red flags

Many canonical names in this DB include a date: `17 03 2026`, `15/04/2026`, `22 03 2026`.

**Always ask** when:
- The incoming name has no date but the DB has one
- The dates differ between input and DB

**Never assume** a name without a date refers to the same game as a name with one.
Arsenal could play Leverkusen again — the date suffix is what makes them distinct.

---

## Step 5 — Update normalize.js for new variants

If you discovered a new raw variant not already in the map, add it immediately:

```javascript
// backend/utils/normalize.js — GAME_NAME_MAP
'raw name lowercase without date suffix': 'Canonical Name Exactly As In DB',
```

Then commit:
```bash
cd C:/Users/Omri/game-dashboard
git add backend/utils/normalize.js
git commit -m "fix: normalize [variant] -> [canonical]"
git push origin main
```

---

## Step 6 — After closing: verify no variants remain

After inserting cost data and marking the game completed, run a quick check:

```bash
flyctl ssh console --app game-dashboard-omri --command "node -e \"
const db=require('/app/backend/database');
const canonical='[EXACT CANONICAL NAME]';
const baseName=canonical.replace(/\s+(\d{2}[\s\/]\d{2}[\s\/]\d{4}|CARABAO|FA CUP|Champions|Semi|Final).*$/i,'').trim();
const t1=baseName.split(/\s+vs\.?\s+/i)[0].split(' ')[0];
const remaining=db.prepare('SELECT DISTINCT game_name,COUNT(*) as cnt FROM orders WHERE game_name!=? AND game_name LIKE ? AND deleted_at IS NULL GROUP BY game_name').all(canonical,'%'+t1+'%');
if(!remaining.length) console.log('CLEAN - no variants remain');
else remaining.forEach(r=>console.log('WARNING: '+r.cnt+'x ['+r.game_name+']'));
\""
```

If any variants remain → fix before declaring done.

---

## Known canonical names with date/competition suffixes

These are the names most likely to cause mismatches — variants come in without the suffix:

| Canonical name in DB | Common wrong variants |
|----------------------|----------------------|
| `Arsenal VS Sporting Lisbon 15/04/2026` | Arsenal vs Sporting Lisbon |
| `Arsenal vs Bayer Leverkusen 17 03 2026` | Arsenal vs Bayer Leverkusen, Arsenal vs Leverkusen |
| `Manchester City VS Real Madrid 17 03 2026` | Man City vs Real Madrid |
| `Manchester City VS Arsenal CARABAO CUP 22 03 2026` | Carabao Cup Final Arsenal Man City |
| `Manchester City vs Southampton - FA Cup Semi-Final` | Manchester City vs Southampton |
| `Manchester City VS Liverpool  - FA CUP` | Manchester City vs Liverpool |
| `Chelsea vs Manchester City` | FA Cup Final Chelsea vs Man City |

For all other games: query the DB in Step 1 to get the exact string.

---

## Why this matters

The orders page groups by `game_name`. If even one character differs (case, date suffix,
abbreviation), the order appears as a separate group with no cost data — showing "missing
cost data" for a game that is already correctly closed. Fixing it requires manual SSH.

Step 3 eliminates this permanently: every game closure automatically syncs all orders to
the canonical name, so no variant can ever survive to trigger a false positive again.
