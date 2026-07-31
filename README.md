# The Long Run

Personal run tracker for Samuël. No auth. Data lives in markdown under `data/`.

## Stack

**SvelteKit + Vite + adapter-node** — forms, file uploads, and markdown storage in one deployable Node app.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173

## Deploy (Docker)

```bash
docker compose up --build
```

App on http://localhost:3000 with a persistent `the-long-run-data` volume at `/data`.

## What you get

- **Log run** — Tue/Fri/Sun form, screenshots, effort/shins/legs/energy, notes; weather auto-filled from Open-Meteo for the run date
- **Dashboard / Timeline** — race countdown, plan week, full history; map pin when a route GeoJSON is attached
- **Import FIT** — Strava routes + weather backfill on create/update when weather is empty
- **Goals + Context** — editable markdown for profile, plan, gear, and race notes

## Weather

Uses the free [Open-Meteo](https://open-meteo.com/) archive/forecast APIs (no API key). **Timezone:** `auto` (local at the query point). Location priority:

1. Centroid of the run’s route GeoJSON under `data/routes/`
2. `DEFAULT_LAT` / `DEFAULT_LON` from `.env`
3. Centroid of any existing route file
4. Hardcoded fallback `52.35, 5.63` (Harderwijk / Flevoland area — this athlete’s usual NL routes)

Fields used:

- **Temperature:** daily `temperature_2m_max` (daytime high, not mean/min)
- **Sky + humidity:** modal weather code and mean RH for **afternoon hours 12–17 local** (avoids labelling a clear afternoon run from a morning drizzle)
- **Source:** archive for past dates; forecast for today/future (forecast first was overwriting recent past with poorer values)

Stored as a short string on the run, e.g. `28°C humid / cloudy`.

Backfill empty weather, or re-fetch with `--force` (overwrites existing weather strings):

```bash
node scripts/backfill-weather.mjs
node scripts/backfill-weather.mjs --force
node scripts/backfill-weather.mjs --force --only=2026-07-21-tuesday,2026-07-22-tuesday
```

## Data layout

```
data/
  context/   profile, plan, injury, gear, shoes, goals, race strategy
  runs/      one markdown file per run
  routes/    GeoJSON tracks from FIT import
  uploads/   Apple Watch screenshots
```
