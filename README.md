# TrackMyTime

Self-hosted time tracking web app with Chrome extension. Track time by project, view a Gantt-style timeline, generate reports, and export to CSV — all running on your own hardware.

**Port: 8888**

## Features

**Timer**
- One-click start/stop from the web app or Chrome extension
- Project selector + note field before starting
- Live elapsed time display (ticking in real time)
- Manual entry for forgotten sessions

**Dashboard**
- Today / This Week / Total stats
- Entries grouped by day with daily totals
- Edit or delete any entry

**Timeline (Gantt)**
- Day view: horizontal blocks per project across a 6am–10pm axis
- Live "now" indicator line
- Hover for duration tooltip

**Projects**
- Color-coded project list
- Per-project total hours + entry count
- Archive or delete projects

**Reports**
- Date range picker
- Daily breakdown bar chart
- By-project breakdown bar chart
- One-click CSV export

**Chrome Extension**
- Start/stop timer from any tab
- Project selector + note in the popup
- Live ticking badge on the extension icon
- Configurable server URL (works on Windows pointing to Ubuntu NAS)

**Infrastructure**
- Node.js + Express backend
- SQLite via better-sqlite3 (no separate DB server)
- Docker + Docker Compose
- Systemd auto-start on reboot
- Dark mode + light mode toggle
- Fully responsive (mobile, tablet, desktop)

## One-Command Install (Ubuntu/Debian)

```bash
git clone https://github.com/sunnyrabiussunny/trackmytime.git
cd trackmytime
sudo bash install.sh
```

The script:
- Installs Docker (if not present)
- Builds and starts the Docker container on port 8888
- Installs a systemd service (auto-start on reboot)

After install, open: `http://localhost:8888`

From other devices on your network: `http://YOUR_NAS_IP:8888`

## Manual Docker Setup

```bash
git clone https://github.com/sunnyrabiussunny/trackmytime.git
cd trackmytime
mkdir -p data
docker compose up -d --build
```

Open: `http://localhost:8888`

## Chrome Extension Setup (Windows → Ubuntu NAS)

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `/extension` folder from this repo
5. Click the TrackMyTime icon in your toolbar
6. First time: set your NAS address (e.g. `http://192.168.10.103:8888`)
7. Click **Save** → now start/stop timers from any tab

The extension connects directly to your self-hosted server over your local network.

## Manage the Service

```bash
# Start
sudo systemctl start trackmytime

# Stop
sudo systemctl stop trackmytime

# Restart
sudo systemctl restart trackmytime

# View logs
docker compose logs -f

# Check status
sudo systemctl status trackmytime
```

## Update to Latest Version

```bash
cd trackmytime
git pull origin main
docker compose down
docker compose up -d --build
```

## Data

All data stored in `./data/`:

```
data/
  trackmytime.db    # SQLite database
```

Backup:
```bash
cp data/trackmytime.db data/trackmytime.db.backup
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects | List projects |
| POST | /api/projects | Create project |
| PUT | /api/projects/:id | Update project |
| DELETE | /api/projects/:id | Delete project |
| GET | /api/tasks | List tasks |
| POST | /api/tasks | Create task |
| GET | /api/entries | List entries (filter by date, project) |
| GET | /api/entries/running | Get currently running entry |
| POST | /api/entries/start | Start timer (stops any running) |
| POST | /api/entries/stop | Stop running timer |
| POST | /api/entries | Create manual entry |
| PUT | /api/entries/:id | Update entry |
| DELETE | /api/entries/:id | Delete entry |
| GET | /api/reports/daily | Daily totals |
| GET | /api/reports/by-project | Per-project totals |
| GET | /api/reports/export | CSV export |
| GET | /api/stats | Quick stats (today, week, running) |
| GET | /health | Health check |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (single file) |
| Backend | Node.js + Express |
| Database | SQLite via better-sqlite3 |
| Container | Docker + Docker Compose |
| Extension | Chrome MV3 |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 8888 | Web server port |
| DB_PATH | /app/data/trackmytime.db | Database path |

---

MIT License · Built by [Sunny Rabius Sunny](https://github.com/sunnyrabiussunny)
