# Game Profitability Dashboard — Project Memory

## What is this project?
A full-stack web app for analyzing ticket sales profitability per sports game.
Built for Omri (omribor1@gmail.com).

## Live URLs
- **App (always on):** https://game-dashboard-omri.fly.dev
- **GitHub:** https://github.com/omribor1-sys/game-dashboard

## Tech Stack
- **Frontend:** React + Vite (`/frontend`)
- **Backend:** Node.js 24 + Express + `node:sqlite` (built-in, NO better-sqlite3) (`/backend`)
- **Hosting:** Fly.io — app name: `game-dashboard-omri`
- **Database:** SQLite at `/data/games.db` (persistent Fly.io volume)
- **Node version:** 24 (required for built-in `node:sqlite`)

## 🚫 ZERO APPROVAL POLICY — READ THIS FIRST

**Claude NEVER asks Omri for confirmation in this project. Ever.**

This applies to ALL actions:
- Inserting orders into the DB ✅ just do it
- Updating existing records ✅ just do it
- Deploying to Fly.io ✅ just do it
- Importing from StubHub ✅ just do it
- Fixing data issues ✅ just do it

Do NOT say: "Should I proceed?", "Is this correct?", "Can I update this?", "Do you want me to..."
Just execute. Report what was done AFTER it's done.

## ⚠️ CRITICAL: UK game times = UK timezone (BST/GMT)

Game times shown on StubHub for UK games are in **local UK time** (BST = UTC+1 in summer, GMT = UTC+0 in winter). Store them exactly as shown — do NOT convert to UTC or any other timezone. Example: a game at "15:00" in London is stored as "15:00", not "14:00".

## ⚠️ CRITICAL: game_datetime format — ALWAYS use 3-char day abbreviation

When inserting orders manually (from StubHub, spreadsheets, etc.), `game_datetime` MUST use this exact format:
```
"Sat, DD/MM/YYYY, HH:MM"   ✅ CORRECT
"Saturday, DD/MM/YYYY, HH:MM"  ❌ WRONG — creates duplicate game groups in dashboard
```

Day abbreviations: Mon, Tue, Wed, Thu, Fri, Sat, Sun

Before inserting, always query an existing order for the same game to copy the exact `game_datetime` string. This ensures all orders group under the same game.

## ⚠️ CRITICAL: StubHub sales scraping — FULL PROCEDURE

When checking https://www.stubhub.ie/my/sales:
1. Navigate to the page
2. Use `javascript_tool` to scroll to bottom (auto-scroll loop) until no new content loads
3. Use `get_page_text` — confirm "There are no more sales." appears at the very end
4. For EVERY order found, extract ALL these fields from the page text:
   - `order_number`
   - `game_name` (apply `normalizeGameName()` before insert)
   - `game_datetime` — query DB first to copy exact format from existing order for same game
   - `ticket_quantity` (the number before "ticket(s)")
   - `total_amount` (the "Total payout" value)
   - `buyer_name`
   - `buyer_email`
   - `category` (e.g. "Longside Upper", "Shortside Upper", "Longside Lower") — from the section line
   - `row_seat` (e.g. "Row BEST | Seats 1, 2") — from the row/seats line
   - `sales_channel` = "StubHub"
5. Check each order against DB — skip if exists, insert if missing
6. ALWAYS populate category + row_seat — never leave them null when data is available on the page

### StubHub page text format (reference):
```
Order No. 286966684 ... Arsenal FC vs Fulham FC ... 2 ticket(s) ... Shortside Upper | Row BEST | Seats 11, 22 ... Total payout€623.04 ... Buyer info: Zohaib Ratani zoeb.ratani@hotmail.com
```
- category = "Shortside Upper" (everything before " | Row")
- row_seat = "Row BEST | Seats 11, 22" (from "Row" to end of seats)

## ⚠️ RULE: Checkpoint commit BEFORE every code change

Before making ANY code change, Claude MUST run:
```bash
git add -A
git commit -m "checkpoint: before [description of upcoming change]"
git push origin main
```
This ensures there is always a "before" state to revert to.
After the change is done, commit again with a descriptive message and push.

## How to deploy changes
```bash
# 1. Build frontend
cd frontend && npm run build

# 2. Deploy to Fly.io
cd .. && flyctl deploy --app game-dashboard-omri
```

## Database tables
- `games` — game name, date, notes
- `inventory` — tickets (member_number, seat, category, buy_price, status, game_name, game_id)
- `orders` — orders (buyer_name, email, phone, game_name, game_id, order_number, sales_channel)
- `order_items` — tickets per order
- `extra_costs` — costs per game (item, amount, notes)

## Key API endpoints
- `GET /api/games` — all games (merges games table + inventory-only games)
- `GET /api/inventory/stats-by-game` — BQ/OQ/SQ/MQ/Income/Profit/Margin per game
- `POST /api/inventory/bulk-import` — upload Excel file (multer + xlsx)
- `GET /api/orders/game-names` — all game names for autocomplete
- `GET /api/orders/sales-channels` — distinct sales channels for autocomplete

## Pages / Routes
- `/` — Dashboard (shows all games + profit summary)
- `/inventory` — All Inventory (games table with BQ/OQ/SQ/MQ/Income/Inventory/Profit/Margin)
- `/inventory?view=GAMENAME` — flat ticket list for a specific game
- `/inventory/bulk-import?game=...` — bulk import Excel tickets
- `/orders` — Orders management
- `/game/:id` — Game detail page
- `/upload` — Add new game

## Sidebar structure
- Dashboard
- Add Game (Analytics)
- All Inventory
- Orders

## Important design decisions
1. **node:sqlite** — NOT better-sqlite3 (avoids native compilation issues on Fly.io)
2. **Inventory-only games** — games added via bulk import exist only in `inventory` table (no entry in `games` table). The GET /api/games endpoint merges both sources.
3. **SmartSearch** — custom autocomplete component in Orders for Game and Sales Channel fields
4. **Bulk import** — parses Excel filename for game name/date (format: `GameName DD_MM_YYYY.xlsx`)
5. **Fly.io volume** — SQLite DB lives at `/data/games.db` (persistent across deploys)

## Monitoring & Snapshot System

### Daily Cron Schedule
| Time (UTC) | Job | Description |
|---|---|---|
| 01:00 | `createSnapshot('daily')` | Local DB copy → `/data/backups/` (14 days kept) |
| 02:00 | `backupToDrive()` | Google Drive backup (daily) |
| 07:45 | `runIntegrityCheck()` | Data validation → WhatsApp alert |
| 08:00 | `checkEmailsAndImport()` | Gmail import (last 24h only) |
| 19:00 | Daily WhatsApp report | Orders summary |

### Snapshot System (`backend/services/snapshot.js`)
- Auto-snapshot before every Gmail import (`pre-gmail-import`)
- Auto-snapshot before every StubHub sync that has data to write (`pre-stubhub-sync`)
- Manual: `POST /api/admin/snapshots` with `{ "label": "before-fix" }`
- List: `GET /api/admin/snapshots`
- Storage: `/data/backups/YYYY-MM-DD_HH-MM_label.db` (14 most recent kept)
- **To restore:** SSH into Fly.io and copy a backup file to `/data/games.db`

### Integrity Check (`backend/services/integrity-check.js`)
- `GET /api/admin/integrity` — returns JSON report
- `POST /api/admin/integrity/notify` — runs check + sends WhatsApp
- Checks:
  1. Duplicate active order_numbers (CRITICAL)
  2. Confirmed orders with €0 amount (CRITICAL)
  3. SQ > BQ per game — impossible case (CRITICAL)
  4. Orders with game_name not in inventory (WARNING — expected for orders-only games)
- Returns: `{ ok, issues[], warnings[], stats, revenue_summary[] }`

### To restore a snapshot (admin only)
```bash
flyctl ssh console --app game-dashboard-omri
cp /data/backups/2026-04-03_01-00_daily.db /data/games.db
# Then restart the app
flyctl apps restart game-dashboard-omri
```

## WhatsApp notifications
- Service: `backend/services/whatsapp-notifier.js`
- Provider: Twilio (HTTP API, no SDK dependency)
- Env vars needed: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_TO`
- Triggered by: daily cron import + manual `/api/admin/check-emails` endpoint
- Test endpoint: `POST /api/admin/test-whatsapp`
- Set via: `flyctl secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_WHATSAPP_FROM=whatsapp:+14155238886 TWILIO_WHATSAPP_TO=whatsapp:+972XXXXXXXXX`

## StubHub email parser notes
- StubHub changed format: day names are now full "Saturday" not "Sat"
- Fixed: regex now uses `\w{2,10}` and normalises to 3-char abbr via `DAY_ABBR[parsedDate.getDay()]`
- The "Tickets in hand" date (4 days before game) looks like "Tue, DD/MM/YYYY, 00:00" — must NOT match before the game date
- Primary regex requires `Europe/` timezone suffix to identify game date line
- Fallback for cases where Europe/ isn't in body

## Database migrations (run automatically on startup)
```js
try { db.exec("ALTER TABLE games ADD COLUMN notes TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE inventory ADD COLUMN member_number TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE orders ADD COLUMN order_number TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE orders ADD COLUMN sales_channel TEXT"); } catch (_) {}
```

## Excel bulk import format
- Sheet name: `Tickets`
- Columns: `MEMBER NUMBER` → member_number, `SEAT` → seat, `CAT` → category, `PRICE IN EUR` → buy_price, `NOTE` → notes

## Git backup
Auto-backup script: `backup.ps1`
Remote: https://github.com/omribor1-sys/game-dashboard

## Fly.io CLI commands
```bash
flyctl deploy --app game-dashboard-omri          # deploy
flyctl logs --app game-dashboard-omri            # view logs
flyctl ssh console --app game-dashboard-omri     # SSH into server
```

## ⚠️ DATA INTEGRITY RULES — CRITICAL — DO NOT VIOLATE

### What automated processes MAY do (pre-approved):
| Action | Source | Allowed |
|--------|--------|---------|
| INSERT new order | gmail-import, stubhub-sync | ✅ YES |
| UPDATE game_name — remove date suffix ` \| Day, DD/MM/YYYY` | any | ✅ YES |
| UPDATE category — fix newline bug | any | ✅ YES |
| UPDATE buyer_name = 'UTC' → NULL | any | ✅ YES |
| UPDATE buyer_name NULL → real name (from StubHub page) | stubhub-sync | ✅ YES |
| UPDATE row_seat NULL → value | stubhub-sync | ✅ YES |
| UPDATE inventory status Reserved/Available → Sold | manual or explicit sync | ✅ YES (with audit log) |

### What automated processes MAY NEVER do:
| Action | Reason |
|--------|--------|
| Change `total_amount` on existing order | Financial data — immutable |
| Change `buy_price` or `sell_price` on inventory | Financial data — immutable |
| Change `buyer_email` on existing order | Identity data — immutable |
| Delete any order or inventory record | Irreversible |
| Change `game_datetime` if already set correctly | Date data — only fix if clearly wrong |
| Change inventory status Sold → Available/Reserved | Cannot "un-sell" automatically |

### Audit log
Every automated change is logged to `audit_log` table:
- Source: which process made the change
- Field: which field changed
- Old/new value: exact values before and after
- Timestamp: when it happened

### Daily WhatsApp report
Triggered daily at 22:00 via `POST /api/admin/daily-report`
Shows: total orders, upcoming games, all automated changes in last 24h

## Revenue Calculation — Source of Truth

**RULE: orders.total_amount > inventory.sell_price**

- `orders.total_amount` = real confirmed payment from buyer (StubHub/FTN email)
- `inventory.sell_price` = estimated/target price (may be wrong, used only as fallback)
- When orders exist for a game → use `SUM(orders.total_amount)` as revenue
- When no orders exist → fall back to `SUM(inventory.sell_price WHERE status='Sold')`
- NEVER use `Math.max(inventory_income, orders_income)` — orders always win

### Before making any DB change in code, ask:
1. Is this change in the "allowed" list above?
2. Is it logged to audit_log?
3. If changing financial data — STOP and ask the user first

## ⚠️ CRITICAL: Closing games from spreadsheets — EXACT RULES

### 1. All costs are ALREADY IN EUR — NEVER convert GBP
Spreadsheets have a "price in euro" column and a "TOTAL COST" summary — these are **already in EUR (€)**.
Do NOT fetch exchange rates. Do NOT multiply by any GBP→EUR factor. Just use the number as-is.
- ✅ TOTAL COST: €389.76 → use €389.76
- ❌ WRONG: "price column shows £389.76, let me convert..." — NO. It's already EUR.

### 2. ONLY show/close PAST games — upcoming games are INVISIBLE until they pass
- Orders-only games appear in the dashboard ONLY after the game date has passed
- NEVER close a game that hasn't happened yet
- NEVER add cost data for a future game
- Wait until the game passes AND the user sends a cost summary screenshot
- Examples of upcoming (DO NOT touch): Arsenal vs Fulham (02/05), Brentford vs West Ham (02/05), Chelsea vs Nottingham Forest (04/05), Fulham vs Bournemouth (09/05), Brentford vs Crystal Palace (17/05)

### 3. Order numbers — copy character by character, NEVER guess
When inserting orders manually from a spreadsheet, copy `order_number` EXACTLY as shown.
A single wrong digit (e.g. 286002519 instead of 286992519) creates a duplicate that corrupts revenue.
Always verify: query DB FIRST — if order already exists (email-imported), SKIP insertion.

### 4. Before closing a game — check for duplicates
Run a quick query: `SELECT order_number, total_amount FROM orders WHERE game_name LIKE '%X%'`
Compare with the spreadsheet's order list. If DB has MORE orders than spreadsheet → duplicates exist.
Soft-delete wrong orders (set `deleted_at`) BEFORE closing the game.

### 5. Revenue for closing = from DB (actual payouts), not spreadsheet sell prices
The spreadsheet "SOLD" column shows listed sell price. Actual StubHub payouts (in DB from emails) may differ by cents.
Use the DB total (after removing duplicates), not the spreadsheet ORDERS total.
If difference > €5 → investigate; if difference < €5 → DB amount is correct, use it.

### 6. Spreadsheet → close-game workflow (always in this order)
1. Read TOTAL COST from spreadsheet (already EUR)
2. Read order numbers from spreadsheet
3. Query DB: which orders already exist? Skip those. Insert only missing ones.
4. Verify no duplicates (DB count = spreadsheet count)
5. Run close script with total_ticket_cost from spreadsheet, revenue auto-computed from DB

## User preferences
- Hebrew UI preferred for communication
- Parallel work encouraged ("תעבוד במקביל")
- Keep sidebar clean — only top-level items
- MQ (missing quantity) shown in red when > 0
- Design: dark sidebar, clean cards, color-coded stats
