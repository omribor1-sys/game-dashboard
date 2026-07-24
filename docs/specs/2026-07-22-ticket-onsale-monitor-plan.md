# Ticket On-Sale Monitor — Work Plan

**Date:** 2026-07-22
**Goal:** Every day, scan a curated list of club/ticket sites and detect when a **new match's
tickets open for sale** (or a members-presale flips to general sale). Write the on-sale
date/status into the Season Fixtures board (`tickets_onsale_at` / `tickets_status`), and alert
via **Telegram + email**.
**Priority:** English Premier League clubs first, then other leagues.
**Relationship:** extension of `gameyield-intelligence` (which today monitors *price*) — this adds
*on-sale/availability* monitoring. Writes results into `game-dashboard`'s `fixtures` table
(the ticket fields already built).

---

## What we're detecting (and why it's hard)

For Omri's business the money event is the **primary sale** — when he can buy near face value from
the club, before resale. So the monitor targets **official club ticketing sites** first, not resale
(StubHub is where he *sells*).

Signals to catch per club:
1. A **new fixture appears** on the club's ticket page (wasn't there yesterday).
2. A fixture's **status changes**: `announced` → `members presale` → **`general sale`** (the key
   transition — general sale = no membership needed).
3. **On-sale date/time published** (e.g. "General sale Fri 12:00").

Hard parts (must design for):
- Club sites are **JS-heavy** and often behind **login/membership** (e.g. eticketing.co.uk needs an
  account). Some show on-sale info only after login → the scanner needs a real browser and may need
  Omri's session/cookies.
- Every club's site is different → no single parser. Need per-site rules OR an LLM extraction step.
- "Members only" vs "general sale" is a *condition on the page*, not a field — needs reading.

---

## Sites to scan (answer to "which sites")

| Tier | Source | Why |
|------|--------|-----|
| **1 — Primary (from Omri's sheet)** | Official EPL club ticketing sites (Arsenal, Spurs, etc. — the 20 hyperlinks in row 1) | Where new-match on-sale is announced; buy at face value |
| 2 — Primary others | Serie A / La Liga / Bundesliga club sites + AC Milan/Inter/Roma links already in the sheet | Same, lower priority |
| 3 — Aggregators | **Ticketmaster** (clubs/events that sell through it), **AXS** (some events) | Some sales run here |
| — Not for on-sale | **StubHub** | Resale/sell side — monitored separately for *price* in gameyield-intelligence, not for on-sale |

EPL clubs are **priority 1**. StubHub stays out of the on-sale monitor (it's the sell channel).

### Tier 1.5 — Fan communities (early-warning signal)
Fans very often post "tickets just went on general sale" **before or alongside** the official page
updates — and discuss presale codes, availability, and conditions. Per club we monitor:
- **Reddit** — the club subreddit (e.g. r/Gunners, r/coys, r/reddevils, r/LiverpoolFC, r/MCFC,
  r/chelseafc…) filtered for ticket keywords ("on sale", "general sale", "membership", "ballot").
- **X/Twitter** — club ticket-news / ITK / ticket-exchange accounts (per-club list, researched).
- **Forums** — club-specific forums and ticket-exchange threads where sales are discussed.

These are **signals, not truth** — a fan post triggers a *check* of the official club page + an
alert, never an auto-write on its own. A research task (below) compiles the per-club community list.

## Alert channels (confirmed)
- **Telegram** (immediate) + **Email** — on every new on-sale / general-sale event.
- **Fixtures board**: write `tickets_onsale_at`, set `tickets_status`, add a note in `tickets_info`,
  `tickets_source='scanner'` — respecting `manually_overridden` (never clobber a manual edit).
  Each fixture then shows the 🎟️ strip + the "🎟️ Tickets" calendar reminder we already built.

---

## Architecture

```
monitor_sources (DB)  →  daily scanner job  →  per-site extract  →  diff vs snapshot
                                                                      │
                                    new/changed on-sale event ────────┤
                                                                      ├─► match to fixtures row → write tickets_onsale_at/status
                                                                      ├─► Telegram alert
                                                                      └─► Email alert
```

**`monitor_sources` table:** `id, club_name, league, url, platform (club|ticketmaster|axs),
priority (1=EPL), needs_login (bool), parser_key, last_checked_at, last_state_hash, last_state_json,
active`.

**Scanner (`ticket-onsale-scanner`):** for each active source, ordered by priority:
1. Fetch — plain HTTP first; **headless browser** (Playwright, reuse gameyield-intelligence's setup)
   for JS/login sites. For login-gated clubs, use a stored session/cookie for Omri's account.
2. Extract the list of on-sale fixtures + status + on-sale datetime — **per-site parser** for the
   top EPL clubs; **generic keyword heuristic + Haiku LLM extraction** for the messy long tail.
3. **Diff** against `last_state_json` → emit events: `new_fixture_onsale`, `presale_to_general`,
   `onsale_date_published`.
4. Update `last_state_hash/json/last_checked_at`.

**Matcher:** map an event's teams+date to a `fixtures` row (reuse the fixtures team-normalisation).
On match → `PUT /api/fixtures/:id` with `tickets_onsale_at`, `tickets_status='on_sale'|'not_yet'`,
`tickets_info` (source + link), `tickets_source='scanner'`. No fixture match → still alert (with the
raw text) so Omri can act.

**Alerter:** Telegram (existing bot) + email; message = club, match, status, on-sale datetime, link.

**Cadence:** daily baseline (e.g. 07:00). Tighten to **2–3×/day** for priority-1 EPL clubs and around
known on-sale windows (Tue–Fri mornings). Cheap — one fetch per source.

---

## Phasing (semi-manual → automatic)

- **Phase A — MVP (change-alert, semi-manual):** load `monitor_sources` with the sheet's URLs.
  Daily job fetches each page, snapshots its ticket-section text, **diffs, and Telegram/email-alerts
  on ANY change** with the URL. Omri confirms and enters the on-sale date via the fixtures Edit modal.
  Low tech, immediate value, works even for login sites (alert = "something changed, check").
- **Phase B — structured EPL parsers + auto-write:** per-site parsers for the top EPL clubs →
  auto-fill `tickets_onsale_at/status` on the matching fixture; detect presale→general-sale.
- **Phase C — LLM + full coverage:** Haiku extraction for messy pages; Ticketmaster/AXS; other leagues;
  login-session handling for members-only pages.

---

## Learning loop — record Omri's daily process (bootstrapping)

There is a real **learning curve**: each club's site behaves differently and Omri already has a manual
daily routine. Best way to automate it correctly is to **capture that routine as ground truth**:

1. **Omri screen-records his daily monitoring in Cowork Claude** — narrating: which sites he opens, in
   what order, what he looks for on each (where the on-sale date lives, how he tells members-only from
   general sale, what he ignores).
2. From each recording we extract a **per-site "playbook"**: URL, the exact element/section to read,
   the keywords that mean "on sale", the login step if any, and the decision rule.
3. Those playbooks become the **per-site parsers** (Phase B) and the daily checklist the scanner runs.
4. Re-record whenever a club changes its site or a new edge case appears → the monitor keeps learning.

This turns a fuzzy manual habit into deterministic, auditable rules — and means the scanner mirrors
exactly how Omri already works, club by club.

## End goal
Every time a ticket sale opens (any tracked club/event) → it is **logged to the calendar**: the
fixture's `tickets_onsale_at` is set, the board shows it, the "🎟️ Tickets" reminder is one click to
Google Calendar, and a Telegram + email alert fires. Nothing slips past.

## Research task (kick off now)
Compile, per EPL club (priority 1), the **fan-community sources**: the main subreddit, the key
X/Twitter ticket/ITK accounts, and any club forum/ticket-exchange thread where ticket sales are
discussed. Output feeds the `monitor_sources` table (Tier 1.5).

## Open items / what I need from Omri
1. **The 20 EPL club URLs** — the sheet's row-1 hyperlinks couldn't be exported (workbook too large).
   Share the sheet "anyone with link → viewer" OR paste the 20 links.
2. **Login/membership**: which club sites need his account to see on-sale info? (e.g. Arsenal
   membership, eticketing.co.uk). For those, Phase A only alerts "changed"; auto-read needs his session.
3. **Email address** for the email alerts (default: omribor1@gmail.com).
4. Where the scanner lives: propose **game-dashboard** (co-located with the `fixtures` table + ticket
   fields) as a new `ticket-onsale-scanner` service, reusing gameyield-intelligence's Playwright/scrape
   patterns.

---

## Appendix — Fan-community sources per EPL club (researched 2026-07-22)

**Authoritative on-sale timing** = official club / supporter-help handle (strongest). Fan resale
accounts = scarcity signal only, NOT proof a sale opened. Handles marked *(unverified)* need a manual
check before wiring into an automated watcher — a wrong handle is worse than none.

| Club | Reddit | X/Twitter (best on-sale signal in **bold**) | Forum |
|---|---|---|---|
| Liverpool | r/LiverpoolFC | **@LFCHelp**, @LFC, @LfcTickets2U *(resale)* | RAWK (rawk.net) |
| Tottenham | r/coys | @SpursOfficial, @SpursTicketNews *(unverified)* | Spurs Community; The Fighting Cock |
| Man City | r/MCFC | **@ManCityHelp**, @ManCity | Bluemoon |
| Man United | r/reddevils | @ManUtd, @TicketManUtd *(fan on-sale alerts)* | RedCafe |
| Arsenal | r/Gunners | @Arsenal, @arsenal_tickets *(unverified/resale)* | Arsenal Mania; club Ticket Exchange |
| Chelsea | r/chelseafc | @ChelseaFC, @CFCTickets4Sale *(resale)* | Talk Chelsea; club Ticket Exchange |
| West Ham | r/Hammers | **@WestHamHelp**, @WestHam | KUMB; West Ham Online |
| Newcastle | r/NUFC | @NUFC, @NUFCSpares *(resale)* | ToonForum; NUFC Forum |
| Fulham | r/fulhamfc *(ticket-exchange flair)* | @FulhamFC | Friends of Fulham |
| Aston Villa | r/avfc | **@AVFCSupport** | VillaTalk |
| Crystal Palace | r/crystalpalace | @CPFC (no ticket-specific handle) | Holmesdale.net; official Twickets resale |
| Brighton | r/BrightonHoveAlbion | @OfficialBHAFC (no ticket-specific handle) | North Stand Chat |
| Everton | r/Everton | **@efc_fanservices**, @evertonspares *(resale)* | GrandOldTeam; ToffeeTalk |
| Wolves | r/WWFC | **@WolvesHelp** | Molineux Mix |
| Brentford | r/Brentford | @BrentfordFC | Griffin Park Grapevine |
| Nottingham Forest | r/nffc | @nffc | Vital 100% Forest; forestforum.co.uk |
| Bournemouth | r/afcbournemouth *(unverified)* | @afcbournemouth *(posts on-sale dates)* | UpTheCherries (Vital) |
| Burnley | r/BurnleyFC *(unverified)* | @BurnleyOfficial | UpTheClarets |
| Leeds United | r/LeedsUnited | **@LUFCTickets**, @lufcticketswaps *(resale)* | MOT Forum; Dirty Leeds |
| Sunderland | r/safc | @SunderlandAFC | Wearside Online |

**Filter keywords:** "general sale", "on sale (now)", "members/priority sale", "ballot", "ticket
exchange", "away tickets/allocation", "presale/access code", "price band/category", "returns",
"sold out", "postponed — new date tickets".

**Cross-club:** r/soccer (occasional). No credible cross-club "ITK ticket" account or
"r/footballtickets" exists — don't invent one; all credible accounts are single-club. Official
face-value resale partners worth watching as structured signals: **Twickets** (Crystal Palace + others),
StubHub (official partner for Everton & Tottenham). Re-verify subreddits/handles periodically
(feedspot / gummysearch) as they churn.

**Design rule:** a community hit → triggers a *check* of the official club ticket page + a "possible
on-sale" Telegram alert. Only the official page (or an official handle) authorises writing
`tickets_onsale_at` to a fixture.

## Acceptance (Phase A done when…)
- `monitor_sources` seeded with the EPL club URLs (priority 1).
- Daily job fetches each, diffs vs snapshot, and sends a Telegram + email alert on any change with the
  club + URL.
- A confirmed on-sale date entered on a fixture shows in the board's 🎟️ strip and offers the ticket
  calendar reminder.
