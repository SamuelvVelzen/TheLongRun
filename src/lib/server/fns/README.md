# Server RPC layout

`createServerFn` definitions live in **`*.ts` files here**, re-exported from [`functions.ts`](../functions.ts).

Domain-specific **handlers and prompts** live alongside as plain modules:

| Module | Role |
|--------|------|
| [`run-orchestration.ts`](../run-orchestration.ts) | Map flags, plan route attachment, best-effort hydration |
| [`run-sort.ts`](../run-sort.ts) | Shared run ordering / import-note helpers |
| [`plan-mutations.ts`](../plan-mutations.ts) | JSON paste, plan merge, feelings apply |
| [`planned-route-draw.ts`](../planned-route-draw.ts) | Drawn pins → track, plan session matching |
| [`fuel-prompt.ts`](../fuel-prompt.ts) | Fuel log prompt assembly |
| [`export-zip.ts`](../export-zip.ts) | GPX export zip payloads |
| [`coach-brief.ts`](../coach-brief.ts) | Coach / goal brief markdown sections |
| [`debrief-prompt.ts`](../debrief-prompt.ts) | Debrief prompt assembly helpers |

Regenerate RPC files with `node scripts/split-server-fns.mjs` (after editing the monolith backup flow — prefer editing domain `fns/*.ts` directly). Dynamic `import('../auth.server')` paths must stay one level up from this folder.

After bulk splits, run `node scripts/trim-fns-imports.mjs` to drop unused imports (then `npm run build`).
