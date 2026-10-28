# The Long Run

Personal run tracker. **React + TanStack Start**, **Cloudflare D1**, deployed to **Cloudflare Workers**.

## Stack

- **TanStack Start** (React 19, Vite, SSR, file-based routing, server functions)
- **Cloudflare D1** — SQLite bound into the Worker (local Miniflare while developing)
- **Cloudflare Workers** via `@cloudflare/vite-plugin` + Wrangler
- Maps: Leaflet (loaded from CDN); charts/sparklines are hand-rolled SVG

Activities are typed (**run / walk / bike / strength**) with sport-appropriate headline metrics
(pace/km, km/h). Add them via the **Log run** form or **Import GPX** (parses the track and
computes distance / pace / HR / elevation / per-km splits). The dashboard has a sport toggle
(defaults to running). Automatic **Strava sync** is the planned next step.

No filesystem at runtime — runs, GeoJSON route tracks, and context docs are all D1 tables.

## Quick start (local)

```bash
npm install
npm run setup:hooks          # once per clone — pre-push lint before push to main
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
  routes/            TanStack route modules (thin shells + loaders where needed)
  components/        UI primitives in components/ui; feature folders (coach/, debrief/, …)
  lib/               Pure domain: plan, fuel, format, types, coach/, run-detail/
  lib/server/        D1 access: runs, context stores, weather, fns/*.ts (RPC handlers)
                     functions.ts re-exports all createServerFn exports
  ARCHITECTURE.md    Layer rules and where to add endpoints
migrations/          D1 schema (npm run d1:apply:local / :remote)
```

## Data model (D1)

| Table                 | Holds                                                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| `runs`                | one row per run                                                                |
| `routes`              | `id` + GeoJSON track + downsampled `polyline` for heatmaps                     |
| `context`             | goals.json, gear inventory, plan.json, profile, injury, fueling, race strategy |
| `planned_routes`      | BRouter exports (not activity GPS)                                             |
| `planned_route_links` | plan-day / activity attachments                                                |

## How data flows

Route `loader`s call **server functions** (`src/lib/server/functions.ts`), which run only on
the server and query D1. Mutations (create / update / delete run, save context) are POST server
functions called from the components, followed by `router.invalidate()`.

The D1 binding `DB` comes from `wrangler.jsonc`. Add activities via the **Log run** form or
**Import GPX** (sign-in required in production). GET loaders are public; POST server functions
check the session cookie.

## Checks

GitHub CI runs `npm ci`, then **`npm run ci:check`** (`tsc --noEmit` + `eslint --quiet` on `src/`).

**Before you push:** run `npm run setup:hooks` once, then each `git push` runs **`npm run ci:check`** locally (no reinstall). Same as CI except `npm ci`. Skip with `git push --no-verify` only when you mean to.

Manual run anytime: `npm run ci:check`.

Full local lint (includes Prettier): `npm run lint`.

## Deploy → `longrun.vanvelzen.dev`

Push to `main`. Cloudflare builds and deploys the Worker automatically. Do not deploy from
this machine. See **GOLIVE.md**. The Worker already has the D1 binding; no database URL.
Viewing is public; edits go through Cloudflare Access on `/login`, then a 30-day session cookie.

## Weather

Free [Open-Meteo](https://open-meteo.com/) (no key). Location: GPS track centroid on import,
else the run's stored route when fetching by slug, else `DEFAULT_LAT`/`DEFAULT_LON`, else `52.35, 5.63` (NL).
