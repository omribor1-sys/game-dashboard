---
name: gameyield-gmail-import
description: >
  Use this skill for ANY Gmail import action in the game-dashboard project:
  checking the current import watermark, resetting it to re-scan old emails,
  triggering a manual import, or debugging missing orders. Trigger whenever:
  user suspects a StubHub or FTN email was missed, wants to re-import a specific
  date range, asks about the email import status, or wants to force a Gmail scan.
---

# GameYield — Gmail Import Manager

The Gmail import system uses a **watermark** (stored in the `settings` table) to avoid
re-scanning old emails. Every successful run sets the watermark to today's date. The next
run only fetches emails after that date.

This prevents the "missing cost data" loop where old re-imported orders reappear under
wrong game names.

---

## Check current watermark

```bash
flyctl ssh console --app game-dashboard-omri --command "node -e \"
const db=require('/app/backend/database');
const r=db.prepare('SELECT key,value,updated_at FROM settings WHERE key=?').get('gmail_last_checked_at');
console.log('Watermark: '+r.value+' (updated: '+r.updated_at+')');
\""
```

---

## Reset watermark (re-scan from a specific date)

Use this when the user suspects emails were missed, or wants to re-import a date range.

```bash
flyctl ssh console --app game-dashboard-omri --command "node -e \"
const db=require('/app/backend/database');
const newDate='YYYY/MM/DD';  // replace with the date to scan FROM
db.prepare('INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)').run('gmail_last_checked_at',newDate);
const r=db.prepare('SELECT value FROM settings WHERE key=?').get('gmail_last_checked_at');
console.log('Watermark set to: '+r.value);
\""
```

**Example** — re-scan from 1 June 2026:
Replace `newDate` with `'2026/06/01'`.

After resetting, trigger a manual import (below). The `orderExists()` check ensures
already-imported orders are skipped — no duplicates.

---

## Trigger manual Gmail import

```bash
flyctl ssh console --app game-dashboard-omri --command "node -e \"
const {checkEmailsAndImport}=require('/app/backend/services/gmail-importer');
checkEmailsAndImport({}).then(r=>console.log(JSON.stringify(r.stats,null,2)));
\""
```

This runs exactly what the daily cron runs — respects the watermark, marks emails as read,
updates the watermark on success.

---

## Force full re-scan (bypass watermark)

For a deep re-scan of ALL mail regardless of watermark. Use sparingly — checks all time.
The `orderExists()` guard still prevents double-importing.

```bash
flyctl ssh console --app game-dashboard-omri --command "node -e \"
const {checkEmailsAndImport}=require('/app/backend/services/gmail-importer');
checkEmailsAndImport({ignoreRead:true}).then(r=>console.log(JSON.stringify(r.stats,null,2)));
\""
```

Note: `ignoreRead:true` does NOT update the watermark — it's a one-off scan.

> ⚠️ **Do not reach for this to recover "a few missed sales."** It scans ALL mail and
> re-imports years-old FootballTicketNet orders (French Open 2025, live screenings, games
> closed long ago), which inflates revenue on closed games. Tried 2026-08-14: 29 imported,
> 24 had to be soft-deleted. Use the normal run instead — it already re-scans the 7 days
> before the watermark (`LOOKBACK_DAYS` in `gmail-importer.js`); raise that constant if you
> need to go further back. If you do run `ignoreRead`, diff `created_at = today` against the
> sales you actually expected and soft-delete the rest via `DELETE /api/orders/:id`.

**The query no longer filters on `is:unread`** (fixed 2026-08-14). A Gmail filter marks the
StubHub sale emails read and files them under `Label_6` before the 08:00 cron runs, so the
unread filter made every sale invisible — nothing imported for weeks. Dedup comes from
`orderExists()`, not read state. Do not add `is:unread` back.

---

## Typical workflow when user says "emails were missed"

1. **Check watermark** — see what date the last scan covered
2. **Reset watermark** to 1-2 days before the suspected missed date
3. **Trigger manual import** — new orders come in, duplicates are skipped
4. **Verify** — check orders for the affected game

---

## How the watermark works

| Setting | Value stored |
|---------|-------------|
| Key | `gmail_last_checked_at` |
| Format | `YYYY/MM/DD` (Gmail `after:` filter format) |
| Updated | After every successful automated run |
| Default | Set to deployment date on first install |

The Gmail query becomes: `from:stubhub subject:"You sold" is:unread after:2026/05/31`

If the cron is missed for a day, the watermark stays at the last successful run date —
so the next run catches up from where it left off. No emails are ever lost.
