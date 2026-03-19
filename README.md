# Game Profitability Dashboard

A full-stack web app to analyze ticket sales profitability per sports game.
Upload Excel/CSV files → get a beautiful, mobile-friendly P&L dashboard.

---

## Installation

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. Install frontend dependencies
cd ../frontend
npm install
```

---

## Running (Development)

Open **two terminals**:

**Terminal 1 — Backend (port 3001):**
```bash
cd backend
npm run dev
```

**Terminal 2 — Frontend (port 5173):**
```bash
cd frontend
npm run dev
```

Open your browser at: **http://localhost:5173**

---

## Access from Mobile (same WiFi)

1. Find your local IP address:
   - Windows: run `ipconfig` → look for **IPv4 Address** (e.g. `192.168.1.42`)
   - Mac/Linux: run `ifconfig` or `ip addr`

2. On your phone (same WiFi network), open:
   ```
   http://192.168.1.42:5173
   ```
   *(replace with your actual IP)*

---

## How to Add a Game

1. Click **"Add Game"** in the sidebar or on the dashboard
2. Drag & drop (or click to upload) your Excel/CSV file
3. Fill in:
   - **Game Name** — e.g. "Barcelona vs Real Madrid"
   - **Date** — the game date
   - **Sheet/Tab Name** — the sheet to parse (e.g. "CUSTOMER SERVICE")
4. Optionally add extra costs (transport, marketing, etc.)
5. Click **"Upload & Analyze"**

The app will parse your file and redirect you to the game detail page.

---

## Excel File Format

The app expects a sheet with these columns:
- `NAME` — ticket holder name (rows with no NAME are skipped)
- `LAST NAME`, `EMAIL`, `SEAT` — optional info columns
- `price` — buy price
- `PRICE EUR` — sell price in EUR
- `STATUS` — sales channel (e.g. "CLIENT STUBHUB", "FTN SOLD")
- `NOTE` — any issues or notes

Special summary rows (detected by NAME column value):
- `TOTAL` → total revenue
- `TOTAL COST` / `TOTAL COSTS` → total ticket costs
- `ELI` / `ELI COST` → ELI's cut
- `TOTAL PROFIT` → parsed but recalculated by the app

GBP values are automatically converted at **1 GBP = 1.16 EUR**.

---

## Deployment (Free Hosting)

### Option A: Railway

1. Push this project to a GitHub repository
2. Go to [railway.app](https://railway.app) and create a new project from your repo
3. Add two services: one for `backend/`, one for `frontend/`
4. Set environment variables:
   - Backend: `PORT=3001`
   - Frontend: update `vite.config.js` proxy target to your backend Railway URL
5. Deploy — Railway gives you a public HTTPS URL

### Option B: Render

1. Push to GitHub
2. Go to [render.com](https://render.com)
3. Create a **Web Service** for the backend:
   - Root directory: `backend`
   - Build command: `npm install`
   - Start command: `node server.js`
4. Create a **Static Site** for the frontend:
   - Root directory: `frontend`
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
   - Set environment variable: `VITE_API_URL=https://your-backend.onrender.com`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Routing | React Router v6 |
| Charts | Chart.js + react-chartjs-2 |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| File parsing | xlsx library |
| File uploads | multer |

---

## Project Structure

```
game-dashboard/
├── backend/
│   ├── server.js          # Express app entry point
│   ├── database.js        # SQLite setup & schema
│   ├── routes/
│   │   └── games.js       # All /api/games endpoints
│   └── utils/
│       └── parser.js      # Excel/CSV parsing logic
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Router + sidebar layout
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx    # Main overview
│   │   │   ├── UploadGame.jsx   # Upload form
│   │   │   └── GameDetail.jsx   # Per-game detail (3 tabs)
│   │   └── components/
│   │       ├── MetricCard.jsx
│   │       ├── BarChart.jsx
│   │       └── PLTable.jsx
│   └── vite.config.js
└── README.md
```
