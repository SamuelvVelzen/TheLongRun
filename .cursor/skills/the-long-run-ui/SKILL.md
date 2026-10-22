---
name: the-long-run-ui
description: >-
  The Long Run (runny) UI system — imports from components/ui, page shell, shape
  tokens, destructive actions, auth gating, and the ui component catalog. Use when
  adding or changing React UI, pages, forms, dialogs, Tailwind styling, or layout
  in this repository.
---

# The Long Run UI

Follow this project's UI conventions before inventing new patterns or one-off styles.

## Source of truth

Read **`.cursor/UI_SYSTEM.md`** in full when implementing or reviewing UI. It is authoritative for imports, layout, copy tone, AI import flows, and the component catalog.

## Non-negotiables

1. **Imports** — App code uses `import { … } from '../components/ui'` (or `./ui` under `src/components`). Do not import `PageHero`, `Dialog`, `Snackbar`, etc. from legacy `src/components/*.tsx` shims.
2. **Page shell** — `PageHero` → optional `PageTabs` → `Panel` / `PageSection`. Utility pages use `PageHero variant="quiet"`.
3. **Shapes** — `rounded-full` (controls/chips), `rounded-inset` (scores/cells/inset rows), `rounded-box` (panels/maps/dialogs).
4. **Destructive** — `Button variant="danger"`, `DeleteButton`, or `DestructiveLink` / `destructiveNavLinkClass` with warn tokens.
5. **Auth** — When `!authed`, hide save/edit/delete/generate controls (not only disabled). Use `SignInPanel` on edit-heavy pages.
6. **Copy** — Short labels and hints; no marketing paragraphs.
7. **Lint** — `npm run lint` enforces ESLint + Tailwind rules; fix violations in changed files.

## When unsure

- Pick an existing component from the catalog in `UI_SYSTEM.md` before adding a new primitive.
- Internal styling helpers (`*Class`) are not exported from the ui barrel; use documented exceptions only.
