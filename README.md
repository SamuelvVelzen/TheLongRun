# The Long Run

Personal run tracker. **React + TanStack Start**, **Neon Postgres**, deployed to **Cloudflare Workers**.

## Stack

- **TanStack Start** (React 19, Vite, SSR, file-based routing, server functions)
- **Neon** — serverless Postgres over HTTP (works in the Workers runtime)
- **Cloudflare Workers** via `@cloudflare/vite-plugin` + Wrangler
- Maps: Leaflet (loaded from CDN); charts/sparklines are hand-rolled SVG

Activities are typed (**run / walk / ride / swim**) with sport-appropriate headline metrics
(pace/km, km/h, /100m). Add them via the **Log run** form or **Import GPX** (parses the track and
computes distance / pace / HR / elevation / per-km splits). The dashboard has a sport toggle
(defaults to running). Automatic **Strava sync** is the planned next step.

No filesystem at runtime — runs, GeoJSON route tracks, and context docs are all Postgres tables.

## Quick start (local)

```bash
cp .env.example .env          # fill in DATABASE_URL (Neon pooled string)
npm install
npm run migrate               # creates tables + loads data/ into Neon (one time)
npm run dev
```

Open the URL Vite prints (default http://localhost:3000).

## Project layout

```
src/
  routes/            TanStack routes: __root, index (dashboard), timeline,
                     log, runs.$slug, context, goals (→ redirect)
  components/        React: RouteMap, RoutesHeatmap, SplitsPanel, TrendsSection,
                     Sparkline, DateRangeFilter
  lib/               framework-agnostic logic: splits, trends, format, plan,
                     date-range, hr-zones, markdown, leaflet, map-chrome, types
  lib/server/        db (Neon), runs, routes, route-analytics, context, weather,
                     functions (createServerFn wrappers = the data layer / RPC)
  app.css            global styles     components.css   ported component styles
scripts/migrate-to-neon.mjs            one-time data import
schema.sql                             table definitions (also applied by migrate)
```

## Data model (Neon)

| Table | Holds |
|-------|-------|
| `runs` | one row per run |
| `routes` | `id` + GeoJSON track (splits / HR zones / km markers in `properties`) |
| `context` | goals, shoes, plan.json, profile, injury, gear, race strategy |

## How data flows

Route `loader`s call **server functions** (`src/lib/server/functions.ts`), which run only on
the server and query Neon. Mutations (create / update / delete run, save context) are POST server
functions called from the components, followed by `router.invalidate()`.

`DATABASE_URL` is read from the `cloudflare:workers` env binding (falling back to `process.env`)
**inside** each server-function handler. Add activities via the **Log run** form or **Import GPX**.

## Deploy → `longrun.vanvelzen.dev`

See **GOLIVE.md**. Short version: create the Neon DB, `npm run migrate`, set `DATABASE_URL` as a
Wrangler secret, `npm run deploy`, add the custom domain, lock it with Cloudflare Access.

## Weather

Free [Open-Meteo](https://open-meteo.com/) (no key). Location: centroid of the run's stored route,
else `DEFAULT_LAT`/`DEFAULT_LON`, else any stored route, else `52.35, 5.63` (NL).
