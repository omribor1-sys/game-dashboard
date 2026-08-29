# Status board

What closed, the decision behind it, and what is next. **No measurable facts here** — no
test counts, no row counts, no "last synced". Those go stale the day they are written; ask
the live endpoints instead (`/api/fixtures/competitions`, `/api/admin/integrity`,
`/api/fixtures/verify`, `/api/fixtures/hot-status`).

---

## Closed — 2026-08-29: trustworthy fixtures

**The package.** The fixtures board went from one data source to three, gained results and
per-game P&L, and gained a checker that compares it to somebody else.

**The decision that shaped everything else: name matching is exact-or-nothing.** Three
separate bugs in one day came from approximate club-name matching, each silently attaching
real money or real fixtures to the wrong club. Every fuzzy path is now deleted:

- `normalizeGameName` step 3 (word LIKE against existing game names) — removed entirely.
  Within one kickoff slot it was strictly weaker than step 2.5, which requires a genuinely
  shared team phrase. An unmatched name now creates a visible new group instead of a
  silent wrong merge.
- `sportsdb-sync` prefix team matching — removed. It lived for one deploy and matched
  Norwegian Lillestrøm to French Lille.
- All team resolution now goes through `backend/utils/team-match.js`: normalise, then an
  explicit alias table, then give up. Widening a match means adding an alias, never
  loosening the rule.

**Why three sources instead of paying.** football-data's free plan has no English cups and
no Europa League, and its Champions League was a season behind. API-Football's free plan is
capped at seasons 2022-2024, so it was useless for the current one. SportScore is a paid
RapidAPI product despite being described as free-and-keyless. Omri's suggestion to look at
news sites led to the answer: UEFA publish their own match feed, free and without a key.
So: football-data for leagues and tables, match.uefa.com for Europe, TheSportsDB for the
English cups. No subscription.

**Why the verifier never repairs.** A verifier that writes can launder a bad source into
the database — exactly the failure it exists to catch. It reports; a human decides. And a
competition with no independent source is reported as *unverified*, never as passing: a
silent gap is how this week's bugs survived.

**Why hot detection ranks instead of thresholds.** An absolute probability threshold marked
nothing, because a single run sees one or two fixtures per club and a hard tie makes a good
side look weak. Strength is now an average across distinct fixtures, and "strong" is a rank
within the competition, so it self-calibrates. Manual hot marks are never overwritten —
a model that overrules Omri the first time they disagree loses his trust permanently.

**Mistakes worth keeping on the record.** A broken template literal in an alert took the
whole app down for a few minutes; `node --check` now runs before every deploy. And the
verifier's own first version compared `undefined` to `undefined` and reported a clean run
while checking nothing — the same silent-success shape it was built to find.

---

## Next in the queue

1. **Watch the hot model converge.** It needs three distinct fixtures per club before it
   ranks anyone. Check `/api/fixtures/hot-status` after the next gameweek and judge the
   marks against what actually sells — the heuristic is stored with its numbers precisely
   so it can be argued with.
2. **Europa League league phase** — waiting on the UEFA draw, then it fills itself.
3. **FA Cup** — wired, empty until the first round in November, then it fills itself.
4. **A second source for the English cups.** They are currently written by TheSportsDB and
   verified by nobody. That is declared, not hidden, but it is still a gap.
