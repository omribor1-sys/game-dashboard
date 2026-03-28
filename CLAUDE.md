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

## User preferences
- Hebrew UI preferred for communication
- Parallel work encouraged ("תעבוד במקביל")
- Keep sidebar clean — only top-level items
- MQ (missing quantity) shown in red when > 0
- Design: dark sidebar, clean cards, color-coded stats
