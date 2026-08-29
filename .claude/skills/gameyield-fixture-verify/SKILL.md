---
name: gameyield-fixture-verify
description: Use this skill whenever fixture or result data in game-dashboard needs to be trusted — after any fixtures sync, before closing a game whose result matters, when a kickoff time or score looks wrong, when a competition tab looks empty or too full, or when Omri asks "is this right?" / "תבדוק שזה נכון" / "תאמת מול מקור חיצוני". Cross-checks every stored fixture against an INDEPENDENT source that did not write it, and reports disagreements in kickoff time, final score, or existence. Read-only — it reports, it never repairs.
---

# Fixture cross-source verification

## Why this exists

Every fixture and orders bug found between 2026-08-25 and 2026-08-29 was **silent**:

| Bug | What it did | What the system reported |
|---|---|---|
| Gmail importer capped at 50 messages, no pagination | dropped the oldest sales in the window, forever | success |
| `normalizeGameName` step-3 word LIKE match | filed Crystal Palace vs Man City under "Brentford vs Crystal Palace" | success |
| same, different pair | filed Newcastle vs West Brom under "Newcastle vs West Ham" | success |
| `sportsdb-sync` prefix team match | filed Norwegian Lillestrøm under French Lille | success |

None of them raised an error. They all passed the existing checks, because **every check
compared the data to itself**. The only thing that catches this class of bug is a source
that never touched the write path.

## The rule

**A competition is verified against a source that did not write it.** Verifying UEFA data
against UEFA proves nothing.

| Competition | Written by | Verified against |
|---|---|---|
| PL | football-data.org | TheSportsDB (league 4328) |
| CL | match.uefa.com | TheSportsDB (4480) |
| UEL | match.uefa.com | TheSportsDB (4481) |
| EFL / FAC | TheSportsDB | *no independent source yet* — reported as unverified, never as passing |

## How to run it

```bash
curl -s -b cookies.txt "https://game-dashboard-omri.fly.dev/api/fixtures/verify"
```

Runs automatically at **07:10 UTC daily**, after all three syncs have written. WhatsApp
fires only when something disagrees — a clean run is silent on purpose.

To force the alert path:

```bash
curl -s -b cookies.txt -X POST "https://game-dashboard-omri.fly.dev/api/fixtures/verify/notify"
```

## What it compares

- **kickoff** — flagged above 15 minutes of drift. Providers disagree by a few minutes on
  provisional times; more than that means one side missed a reschedule.
- **final score** — only when both sides have a score. A disagreement here is serious: a
  wrong score means a wrong game was matched.
- **existence** — a fixture we hold that the other source has no record of on that day.

## Reading the output

| severity | meaning | what to do |
|---|---|---|
| `score` | the two sources disagree on a result | **stop.** Almost always means two different fixtures were matched to each other. Check the team names before trusting either. |
| `kickoff` | time drift beyond tolerance | check which source is stale; if ours is wrong, re-run that competition's sync |
| `missing` | we hold a fixture the other source lacks | usually a timezone edge (their day boundary) — confirm on the neighbouring day before acting |

## Hard rules

1. **Never let it repair.** A verifier that writes can launder a bad source into the
   database — the exact failure it exists to catch. It reports; a human decides.
2. **Never report an unverified competition as passing.** If there is no second source,
   it goes in `unverified[]` and says so. A silent gap is how the last three bugs survived.
3. **Both teams must match** to consider two fixtures the same tie. One shared team is the
   assumption that merged Newcastle/West Brom into Newcastle/West Ham.
4. **Do not add approximate name matching** to widen the match rate. Three separate bugs in
   one day came from exactly that. Add an alias to `backend/utils/team-match.js` instead.

## Files

- `backend/services/fixture-verify.js` — the checker
- `backend/utils/team-match.js` — the shared exact-match-or-alias team resolver
- `backend/routes/fixtures.js` — `GET /api/fixtures/verify`, `POST /api/fixtures/verify/notify`
- `backend/server.js` — the 07:10 UTC cron

## Related

- `gameyield-game-validator` — the same discipline for `game_name` on the orders side
- `runIntegrityCheck()` check 4b — one game_name across several kickoffs, the self-consistency
  half of this. Both are needed: 4b catches internal contradictions, this catches the case
  where our data is perfectly self-consistent and simply wrong.
