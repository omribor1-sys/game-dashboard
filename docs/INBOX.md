# Inbox

Raised and not built. Nothing here is committed to — this exists so ideas do not die
between chats.

## Waiting on code

| Idea | Triage |
|---|---|
| Second source for the English cups (Carabao, FA Cup) | Real gap. They are written by TheSportsDB and verified by nobody, so the verifier reports them as unverified every run. BBC's `/sport/football/league-cup/scores-fixtures` returns 200 with the fixtures embedded in `window.__INITIAL_DATA__`, so it is parseable without a browser. **Build it with a watchdog**: an HTML scraper dies silently when a layout changes, which is this project's worst failure mode. If it ever returns zero fixtures for a day that has games, that must alert. |
| Backtest the hot model against real sales | The whole point of storing `hot_score` and `hot_reason`. Needs a few gameweeks of marks plus the sales that followed. Until then the model is a plausible guess, not a validated one. |
| Sky Sports as a third fixture source | The URL tried returned 404 but the page carries `ld+json`. Only worth it if BBC proves unreliable. |
| Odds movement as a demand signal | Currently only the price level is used. A price that moves sharply toward one side is a stronger demand signal than a static one, and The Odds API quota is barely touched (~90 of 500/month). |
| Verify orders, not just fixtures | The cross-source idea applies to the orders side too — a StubHub sale could be checked against the payment email. The three orders bugs this week were all on that side. |

## Waiting on Omri, not on code

| Item | Why it needs him |
|---|---|
| 6 games from **last season** with misfiled orders | `Chelsea vs Man United` (4 kickoffs), `Fulham vs Aston Villa` (3), `Newcastle vs Bournemouth`, `Man City vs Arsenal`, `Brentford vs Crystal Palace`, `Arsenal vs Newcastle United`. Omri ruled these out of scope. Splitting them changes the revenue of **closed** games, so it is his call, not an automatic fix. The detector is scoped to a rolling 90-day window so they no longer appear. |
| Judge the first hot marks | Only he knows whether a flagged fixture actually sold. |
| Whether the FA Cup should sit on the main tab bar | It is there now, showing 0 until November. If an empty tab is noise, it can drop into "More leagues" until it fills. |
