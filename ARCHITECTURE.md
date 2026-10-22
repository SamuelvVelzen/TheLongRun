# Architecture (The Long Run / runny)

## Layers

| Layer | Location | Rules |
|-------|----------|--------|
| Pure domain | [`src/lib/*`](src/lib/) | No DB, no `createServerFn`, safe for forms and shared types |
| Server persistence | [`src/lib/server/*.ts`](src/lib/server/) | D1, files, weather, GPS — imported only from server code |
| Context stores | [`goal-store.ts`](src/lib/server/goal-store.ts), [`settings-store.ts`](src/lib/server/settings-store.ts), etc. | D1 `context` table; composed via [`context.ts`](src/lib/server/context.ts) facade |
| RPC boundary | [`src/lib/server/fns/*.ts`](src/lib/server/fns/) | `createServerFn` per domain, re-exported from [`functions.ts`](src/lib/server/functions.ts) |
| Server helpers | Modules listed in [`fns/README.md`](src/lib/server/fns/README.md) | Prompt builders, plan merge, exports — imported from RPC handlers |
| UI | [`src/components/ui`](src/components/ui) + feature folders (`coach/`, `debrief/`, …) | See [`.cursor/UI_SYSTEM.md`](.cursor/UI_SYSTEM.md) |
| Routes | [`src/routes`](src/routes/) | TanStack Router — route modules only (helpers live under `$lib` or `components/`) |
| Route loaders | e.g. [`src/lib/coach/`](src/lib/coach/), [`src/lib/run-detail/`](src/lib/run-detail/) | Serializable loader data; no `createFileRoute` |

## TanStack Start note

RPC handlers live in `src/lib/server/fns/<domain>.ts`. The client imports `$lib/server/functions`; TanStack replaces handlers with RPC stubs. Use `import('../auth.server')` (not `./`) for dynamic server-only imports inside `fns/`. After large edits, run `npm run build` to confirm the client bundle does not pull D1.

Regenerate domain files: `node scripts/split-server-fns.mjs` (from a monolithic `functions.ts` backup — prefer editing `fns/*.ts` directly).

## Shared types

Client-safe RPC shapes live under `$lib/` (e.g. [`run-input.ts`](src/lib/run-input.ts), [`plan-peek.ts`](src/lib/plan-peek.ts)). Re-export from `functions.ts` when needed for older imports.

## Adding an endpoint

1. Implement logic in `src/lib/server/<feature>.ts` (or `$lib` if pure).
2. Add `createServerFn` in the matching `src/lib/server/fns/<domain>.ts` file; export it from `functions.ts`.
3. Call from a route loader or component; invalidate the router after POSTs.

## UI conventions

- Heavy maps (`RouteMap`, `RoutesHeatmap`) are lazy-loaded on dashboard and activity views.
- Coach page UI: [`src/components/coach/`](src/components/coach/); search + loader: [`src/lib/coach/`](src/lib/coach/).
