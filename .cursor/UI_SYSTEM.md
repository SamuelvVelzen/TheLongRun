# UI system (The Long Run)

## Imports

- **`npm run lint`** runs Prettier and ESLint (`eslint.config.js`): React + TypeScript recommended rules, **Tailwind CSS** (`eslint-plugin-tailwindcss`, config from `src/app.css`), `import-x/first`, and blocks legacy shim imports (`Dialog`, `Snackbar`, `PageHero` outside `ui/`).
- Use **`import { … } from '../components/ui'`** (or `./ui` under `src/components`).
- Do **not** import `PageHero`, `Dialog`, `Snackbar`, etc. from `src/components/*.tsx` shims in app code.
- The barrel exports **components and hooks only** — not `*Class` helpers. Styling helpers live inside `src/components/ui/*` and are not part of the public API.

## Shape language

| Token / class                            | Use                                                          |
| ---------------------------------------- | ------------------------------------------------------------ |
| `rounded-full`                           | Buttons, choice chips, segmented toggles, tags, status pills |
| `rounded-inset` (`--radius-inset`, 10px) | Score chips, week cells, inset file rows                     |
| `rounded-box`                            | Panels, maps, dialogs                                        |

## Page shell

1. `PageHero` (`variant="quiet"` on utility pages)
2. `PageTabs` where tabs exist (wraps `TabBar` + `SegmentedToggle fill`)
3. Stack of `Panel` / `PageSection` — avoid bare primary content on the canvas

### Mobile `PageHero`

On viewports `max-sm`, non-`home` heroes show **only the `h1`**. Kicker, lead, children, and actions are hidden in `PageHero`.

## Destructive actions

Use **`Button variant="danger"`**, **`DeleteButton`**, or **`DestructiveLink`** / **`destructiveNavLinkClass`** for delete, clear, remove, retire, and sign out. Danger styling uses **warn/red** tokens (`text-warn`, warn borders/backgrounds).

## Auth

When `!authed`, **hide** save/edit/delete/generate controls — do not only disable them. Use **`SignInPanel`** at the top of edit-heavy pages (import, gear, fuel, profile).

## Copy

Short labels and hints only. No marketing leads or paragraphs about what the AI already has in a prompt. Prefer UI affordances over explanatory prose.

## Coach debrief suggestions (fuel & body)

Saving debrief JSON runs **`saveDebrief`** on the server. It always applies feelings/plan fields you confirmed in the form. Optional arrays in the AI reply are **suggestions only**:

| Field  | Dialog                  | On confirm                                  |
| ------ | ----------------------- | ------------------------------------------- |
| `fuel` | `FuelSuggestionsDialog` | `addFuelEntries`                            |
| `body` | `BodySuggestionsDialog` | `applyBodySuggestions` → Profile body notes |

Nothing from `fuel` or `body` is written until you tick rows and choose **Save**. If both arrays are present, fuel opens first; body opens when you close fuel. Body tags: **New**, **Changed**, or **Resolved** (cleared niggle).

## Import with AI (gear, clothing, fuel, profile, goals)

Toolbar button **Import with AI** opens a dialog built on **`AiPromptFlow`**: optional extra text → generated prompt → copy → paste JSON → confirm (fuel saves on submit; gear/clothing/body notes and goal copy show a pick list like debrief body notes). Pair with **Copy kit for AI** where you only need context in chat. Prompts live in `$lib/*-prompt.ts`; JSON is parsed with `$lib/*-schema.ts` (zod). Implementations: `GearAiDialog`, `WardrobeAiDialog`, `FuelDescribeDialog`, `BodyNotesAiDialog`, `GoalCopyAiDialog`.

## Component catalog (`src/components/ui/index.ts`)

| Component                                     | Purpose                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `Actions`                                     | Right-aligned button row; `sticky` for bottom bars                             |
| `Button`                                      | Primary / ghost / danger actions                                               |
| `Checkbox`                                    | Accessible checkbox + label                                                    |
| `ChoiceChips`                                 | Single-select pill options                                                     |
| `ConfirmDialog` / `Dialog`                    | Modal; `Dialog size="medal"` for wide medal flows                              |
| `DestructiveLink` / `destructiveNavLinkClass` | Warn-styled links (e.g. sign out)                                              |
| `DeleteButton` / `EditButton`                 | Icon actions for lists                                                         |
| `IconLabelButton`                             | Toolbar ghost control: label on `sm+`, icon-only on mobile (`aria-label` kept) |
| `Dropzone`                                    | GPX / file drop target                                                         |
| `EmptyState`                                  | Muted empty message + optional CTA                                             |
| `Field`                                       | Label + control spacing                                                        |
| `FilterSheet` / `filterSummary`               | Mobile filter sheet                                                            |
| `Form` / `FormGrid` / `FormSection`           | Form layout                                                                    |
| `Grid`                                        | Standard page grid gap                                                         |
| `InsetRow`                                    | Inset list row (files, etc.)                                                   |
| `Input` / `Textarea` / `Select`               | Controls                                                                       |
| `Metric` / `Metrics`                          | Stat tiles                                                                     |
| `PageHero`                                    | Page title block                                                               |
| `PageSection`                                 | `Panel` + optional `PanelTitle`                                                |
| `PageTabs`                                    | Sticky tab bar + filled segmented control                                      |
| `Panel`                                       | Surface card; `form` prop adds form grid spacing                               |
| `PanelTitle`                                  | In-panel section heading (h3)                                                  |
| `RunRow` / `RunTitle`                         | Activity / route list rows                                                     |
| `SectionTitle`                                | Page-level h2 section with subtitle slot                                       |
| `SegmentedToggle`                             | Segmented control; `fill` for page tabs                                        |
| `SnackAction`                                 | Snackbar action button                                                         |
| `SnackbarProvider` / `useSnackbar`            | Toasts                                                                         |
| `StatusPill` / `Tag`                          | Small labels                                                                   |
| `FeelChips` / `WantedFasterChips`             | Numeric / Y-N score grids (`rounded-inset`)                                    |
| `ExplainTip` / `TipBubble`                    | Inline help                                                                    |
| `useAppForm` / field components               | TanStack Form helpers                                                          |

## Internal exceptions

Feature code may import **`buttonClass`**, **`runRowClass`**, etc. from **`src/components/ui/<module>`** only when a plain `Link` must look like a button and `Button` cannot wrap the element. Prefer `Button` when possible.

`SportFilter` uses `segItemClass` from `ui/SegmentedToggle` for multi-select sport filtering.
