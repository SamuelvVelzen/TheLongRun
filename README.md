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

- **Log run** — Tue/Fri/Sun form, screenshots, effort/shins/legs/energy, notes
- **Dashboard / Timeline** — race countdown, plan week, full history
- **Goals + Context** — editable markdown for profile, plan, gear, and race notes

## Data layout

```
data/
  context/   profile, plan, injury, gear, shoes, goals, race strategy
  runs/      one markdown file per run
  uploads/   Apple Watch screenshots
```
