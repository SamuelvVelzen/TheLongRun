# The Long Run

Personal run tracker. **React + TanStack Start**, **Cloudflare D1**, deployed to **Cloudflare Workers**.

## Stack

- **TanStack Start** (React 19, Vite, SSR, file-based routing, server functions)
- **Cloudflare D1** — SQLite bound into the Worker (local Miniflare while developing)
- **Cloudflare Workers** via `@cloudflare/vite-plugin` + Wrangler
- Maps: Leaflet (loaded from CDN); charts/sparklines are hand-rolled SVG

Activities are typed (**run / walk / ride / swim**) with sport-appropriate headline metrics
(pace/km, km/h, /100m). Add them via the **Log run** form or **Import GPX** (parses the track and
computes distance / pace / HR / elevation / per-km splits). The dashboard has a sport toggle
(defaults to running). Automatic **Strava sync** is the planned next step.

No filesystem at runtime — runs, GeoJSON route tracks, and context docs are all D1 tables.

## Quick start (local)

```bash
npm install
npm run login                 # same Cloudflare account that owns the D1 database
npm run d1:apply:local        # creates the local SQLite file if needed
npm run d1:pull               # optional: copy remote D1 into local
npm run dev
```

Open the URL Vite prints (default http://localhost:3000).

The local DB lives in `.wrangler/state` (gitignored). It does not travel with the repo.
`npm run d1:pull` writes a backup to `.wrangler/d1-backup.sql` then loads it locally.

Useful D1 commands:

```bash
npm run d1:counts:local
npm run d1:counts:remote
npm run d1:exec:remote -- --command="SELECT slug, date FROM runs ORDER BY date DESC LIMIT 10"
```

## Project layout

```
src/
  routes/            TanStack routes: __root, index (dashboard), timeline,
                     log, runs.$slug, context, goals (→ redirect)
  components/        React: RouteMap, RoutesHeatmap, SplitsPanel, TrendsSection,
                     Sparkline, DateRangeFilter
  lib/               framework-agnostic logic: splits, trends, format, plan,
                     date-range, hr-zones, markdown, leaflet, map-chrome, types
  lib/server/        db (D1), runs, routes, route-analytics, context, weather,
                     functions (createServerFn wrappers = the data layer / RPC)
  app.css            global styles     components.css   ported component styles
migrations/          D1 schema (applied with npm run d1:apply:local / :remote)
schema.sql           same schema, for reading
```

## Data model (D1)

| Table | Holds |
|-------|-------|
| `runs` | one row per run |
| `routes` | `id` + GeoJSON track + downsampled `polyline` for heatmaps |
| `context` | goals, shoes, plan.json, profile, injury, gear, race strategy |
| `planned_routes` | BRouter exports (not activity GPS) |
| `planned_route_links` | plan-day / activity attachments |

## How data flows

Route `loader`s call **server functions** (`src/lib/server/functions.ts`), which run only on
the server and query D1. Mutations (create / update / delete run, save context) are POST server
functions called from the components, followed by `router.invalidate()`.

The D1 binding `DB` comes from `wrangler.jsonc`. Add activities via the **Log run** form or
**Import GPX** (sign-in required in production). GET loaders are public; POST server functions
check the session cookie.

## Deploy → `longrun.vanvelzen.dev`

Push to `main`. Cloudflare builds and deploys the Worker automatically. Do not deploy from
this machine. See **GOLIVE.md**. The Worker already has the D1 binding; no database URL.
Viewing is public; edits go through Cloudflare Access on `/login`, then a 30-day session cookie.

## Weather

Free [Open-Meteo](https://open-meteo.com/) (no key). Location: centroid of the run's stored route,
else `DEFAULT_LAT`/`DEFAULT_LON`, else any stored route, else `52.35, 5.63` (NL).
