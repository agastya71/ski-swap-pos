# UI Overhaul + A/B Testing Plan — 2026-11-24

**Branch: `ui-overhaul/2026-11-24` — all overhaul work lives here. Plan-first;
no implementation until the user approves this plan.**

Supersedes `docs/ui-refresh-ab-plan-2026-11-22.md` (read it — many of its
decisions carry forward; deltas are called out below).

Standards base:
- **Chrome Modern Web Guidance** (developer.chrome.com/docs/modern-web-guidance)
  — used as a *neutral UI-quality guide*, NOT as Chrome-specific tech: we adopt
  its principles (contrast, typography scale, touch targets, focus visibility,
  responsive tables/dropdowns, form validation timing, reduced-motion, no
  content-blocking noise) without pulling in Chromium-only APIs (no view
  transitions, no anchor positioning, no :has()-gated layout as load-bearing).
  Everything must keep working in Firefox and Safari.
- **Google eng-practices** (google.github.io/eng-practices) — every overhaul PR
  is a small, self-contained CL: one purpose per PR, described in the PR body,
  reviewable in minutes; functional behavior never rides along with styling.

## A/B mechanism (unchanged from the parked plan, now with server-side stick)

Single bundle, client-side flag — one DOM, two themes:

- `lib/uiVariant.ts`: `UiVariant = "v1" | "v2"`; `?ui=v2` in the URL (before
  the hash) persists to `localStorage["ui-variant"]` and boots `v2`;
  `?ui=v1` returns; default **v1** for everyone.
- Boot in `main.tsx`: `<html class="ui-v2">` + React context.
- v2 = CSS token overrides under `.ui-v2` + (only where truly needed)
  `useUiVariant()` conditional structure.
- v1 stays pixel-identical to today.

**A/B against main (new for this plan):** because this branch serves a *variant
build* beside the production one, evaluation doesn't depend on merging:

| URL | What it serves | Who |
|---|---|---|
| `https://mysl-pos.duckdns.org/` | **main** build (untouched throughout) | all staff, event day |
| `https://mysl-pos.duckdns.org/next/` | **overhaul branch** build | testers |

FastAPI gains one static mount (`/next` → `backend/static-next/`) and
`npm run build:next` (or a plain `vite build --outDir ../backend/static-next
--base /next/`) writes the branch bundle there — **zero risk to the live POS**;
backend API is shared (same origin, same DB) and the branch carries only UI
changes. Deployment = one `npm run build:next`; undo = rebuild from main into
that dir (or delete the dir; the mount 404s harmlessly). The in-app flag
(`?ui=v2`) remains for the *final promotion* review on the main URL after a
batch merges, but day-to-day A/B runs off the two URLs above.

## Guarded constraint that shapes the work

~9k lines of TSX carry **inline `style={{}}` everywhere** (top: ReportsPage 134,
ItemList 70, TransactionEditor 59, SellerDetailPage 54, POSPage 38, Cart 28…).
Inline styles can't be re-themed from CSS without string-replacing values.
The overhaul therefore *is* a migration: lift hot inline styles to
token-driven class names page by page, keeping v1 render identical. This is
mechanical but the bulk of the effort — and it's exactly what makes a future
re-theme (or dark mode) cheap.

## Phases → PRs (small, reviewable, per eng-practices; each = PR into this branch)

| PR | Scope | Notes |
|---|---|---|
| **U0** | `/next` variant-build infra: vite `next` mode, FastAPI mount, `uiVariant.ts` + boot wiring (flag, context, root class) + tests | ships first; after this you can already see the branch at `/next/` (identical to main at first) |
| **U1** | v2 token block in `index.css` (spacing scale, 44px touch targets, consistent radii/shadows, focus-visible rings, reduced-motion) + `ui.css` primitives; `components/ui/` Button, Input, Card, Table, Modal, Toast | pure CSS + new components; v1 untouched |
| **U2** | Layout v2: `Layout.tsx` nav, page container, headings, empty/loading/error states; responsive table pattern (Chrome "Responsive tables" guide, CSS-only) | first visible change; screenshots go in PR |
| **U3** | POS v2 (event-critical — smallest steps, human checklist each): LookupField + dropdown, Cart, PaymentForm, ConfirmationScreen, TransactionEditor | the money screens; practice on TEST SWAP event |
| **U4** | Intake v2: IntakeForm, ItemForm, ItemList, SellerForm, search page | |
| **U5** | Admin v2: ReportsPage, TransactionsPage, SellerDetail/List, panels, modals | biggest inline-style debt here |
| **U6** | Promotion prep: default-flip decision, v1 cleanup PR, docs | separate, later |

Every PR: `npm test` + `tsc -b` + `lint` (delta on *our* files only; the 4
pre-existing main errors stay out of scope); screenshots of v1 vs v2 side by
side in the PR body; checklist per Google eng-practices (what/why/risk/undo).

## Evaluation protocol (per phase)

1. Tester opens `/next/` (v2) and the prod URL (v1) side by side on the TEST
   SWAP POS 2026 event (TRAI1/RIDG1 data — never MyXC real data).
2. 10-minute checklist in the PR description: one intake flow, one checkout
   (cash + card), one payout/report view; note friction on both variants.
3. Verdict per phase recorded in this doc's log table (below).

## Undo matrix

| Situation | Undo |
|---|---|
| Don't like v2 in `/next/` | just keep using prod URL; nothing to undo |
| Phase rejected | close its PR; branch history stays clean |
| Merged phase regresses | `git revert` the squash commit + `npm run build:next` |
| Prod ever gets a promoted batch that misbehaves | v1 default remains everywhere until promotion; final promotion is one PR: flip flag default → `git revert` + rebuild removes it |
| Whole initiative dropped | delete branch; prod never changed |

## Hard constraints (carried from repo rules)

- No backend semantic changes: the only backend edit in this whole plan is the
  **one-line static mount** for `/next` (U0). No schema/data/checkout changes.
- Event-day safety: nothing touches the main build until phases are validated;
  main build directory (`backend/static/`) is only ever written by main builds.
- Label printing (ZPL), reports math, Square payments: out of scope.
- `npm run build` for main stays exactly as today; the `/next` build is a
  separate outDir so the two can never collide.

## Open items (verify at execution, not blocking plan approval)

1. Exact v2 token values — offer a 2/3-screen visual sample (v1|v2) after U1.
2. Whether any FE tests assert inline styles that a lift would break — adjust
   assertions alongside while keeping v1 DOM identical.
3. Hash-router + `/next` base-path interplay (vite `base: '/next/'` handles the
   built index.html; confirm deep links like `/next/#/admin` survive).

## Verdict log (fill in per phase)

| Phase | Date | Verdict | Notes |
|---|---|---|---|
| U0 | 2026-11-24 | shipped as PR #162 | /next mount + flag wiring; /next/ empty-dir no-op verified |
| U1 | 2026-11-25 | shipped as PR #163 | v2 design tokens + components/ui primitives; no v1 change |
| — | — | — | — |
