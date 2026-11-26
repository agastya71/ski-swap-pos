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
| **U2** | Layout v2: `Layout.tsx` nav, page container, headings, empty/loading/error states; responsive table pattern (Chrome "Responsive tables" guide, CSS-only) | first visible change; screenshots generated locally, never committed |
| **U3** | POS v2 (event-critical — smallest steps, human checklist each): LookupField + dropdown, Cart, PaymentForm, ConfirmationScreen, TransactionEditor | the money screens; practice on TEST SWAP event |
| **U4** | Intake v2: IntakeForm, ItemForm, ItemList, SellerForm, search page | |
| **U5** | Admin v2: ReportsPage, TransactionsPage, SellerDetail/List, panels, modals | biggest inline-style debt here |
| **U6** | Promotion prep: default-flip decision, v1 cleanup PR, docs | separate, later |

Every PR: `npm test` + `tsc -b` + `lint` (delta on *our* files only; the 4
pre-existing main errors stay out of scope); checklist per Google eng-practices
(what/why/risk/undo).

Screenshots are captured locally with `scripts/ui-screenshots.mjs` and reviewed
side by side; they are **never committed** (`.gitignore`: `docs/screenshots-*/`).
This repo is public, so a committed screenshot would publish live seller names,
item descriptions and sale totals. The capture script therefore refuses to run
unless the active event's name contains "test", and reads credentials from
`UI_PROBE_USER` / `UI_PROBE_PASSWORD` rather than hardcoding them.

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

## Verification pitfalls

See [`ui-verification-pitfalls.md`](./ui-verification-pitfalls.md) — twelve
silent failure modes found while building U0–U3 (dropped `@import`s, `/next/`
defaulting to v1, stale-tick React events, meaningless assertions, sandbox WAL
replay). Read it before starting U4. Guarded by
`node scripts/css-wiring-check.mjs`.

## Open items (verify at execution, not blocking plan approval)

1. Exact v2 token values — offer a 2/3-screen visual sample (v1|v2) after U1.
2. ~~Whether any FE tests assert inline styles that a lift would break.~~
   **Answered by U3:** yes, in `LookupField.test.tsx` (lines 223, 224, 335,
   343) and the admin pages (`AllSellersPayouts.test.tsx:62`,
   `ReportsPage.test.tsx:76`, `SellerPayoutPanel.test.tsx:33,71`,
   `EndOfDayPage.test.tsx:47`). Pattern that worked: keep the v1 value in the
   style table, assert v1 *and* v2 in the same test. `TransactionEditor` and
   `POSPage` had no style assertions at all.
3. Hash-router + `/next` base-path interplay (vite `base: '/next/'` handles the
   built index.html; confirm deep links like `/next/#/admin` survive).

## Verdict log (fill in per phase)

| Phase | Date | Verdict | Notes |
|---|---|---|---|
| U0 | 2026-11-24 | shipped as PR #162 | /next mount + flag wiring; /next/ empty-dir no-op verified |
| U1 | 2026-11-25 | shipped as PR #163 | v2 design tokens + components/ui primitives; no v1 change |
| U2 | 2026-11-25 | shipped as PR #166 (merged into phase branch) | v2 shell via `ui-v2-shell.css` + `layoutStyles.ts`; v1 inline styles preserved verbatim (probe-verified); page-state primitives + CSS-only stacked-table pattern; shell verified at 420px |
| U3 | 2026-11-25 | shipped as PR #167 (part 1) + #168 (part 2) | POS money path: 164 inline styles across 6 files → 0. v1 tables kept verbatim in `posStyles.ts`; v2 in `pos-v2.css` + `pos-editor-v2.css`. Added `v1Only`/`v2Only` helpers for elements `variantProps` cannot express |
| — | 2026-11-25 | verification tooling | PR #169 added the TEST SWAP checklist runner + sandbox script; `scripts/css-wiring-check.mjs` guards the two silent CSS failure modes. Checklist 12/12 PASS against a sandbox copy |
| — | 2026-11-25 | guard wired | `scripts/hooks/pre-push` + `scripts/install-git-hooks.sh`: the wiring check now runs automatically before any push touching `frontend/src/**/*.css`. Fast-skips otherwise; `--no-verify` bypasses |
| — | — | — | — |
| U4 part 1 | 2026-11-25 | shipped as PR #172 | Intake identity half (IntakeForm, SellerForm, SellerSearch, ImportItemsButton, IntakeModulePage): 57 inline styles → 0. Found `--gray-600`/`--gray-800` referenced but undefined → added, plus `css-wiring-check` group 5 for that failure class. Narrow overflow 581px → 404px |
| U4 part 2 | 2026-11-25 | shipped (PR pending) | Intake items half (IntakePage, ItemForm, ItemList, ItemSearchPage): 145 inline styles → 0, so `frontend/src/intake/` is now style-free. `TableScroll` adopted: stacked for the previous-intakes table, scroll for `ItemList` (13 columns) and `ItemSearchPage` (interactive filter row inside `<thead>` — stacked mode clip-hides `thead`, so it must not be used there). v2 verified at 420px: widest element now fits the viewport (v1 is +161px over). Added `css-wiring-check` group 6 after finding 4 emitted-but-unstyled classes |

---

## U6 verdict (recorded at promotion)

**Promotion approved 2026-11-25.** The default variant is flipped to **v2**;
`?ui=v1` is the permanent escape hatch (it clears the stored choice, same
mechanism `?ui=v2` used to opt in). v1 stays in the bundle — the variants
remain one build — so reverting is a one-line change plus `npm run build`.

What was verified before the flip, across U2–U6:

- frontend 525/525 · backend 574/574 (CI-identical commands)
- `css-wiring-check` 6/6 — 404 emitted classes all styled, 572 rules scoped,
  every `var()` defined, `/next/` links always carry `?ui=`
- `pos-css-check` 315/315 against the built sheet
- shell probe: v2 fits a 420px viewport exactly (widest shell edge 420/420);
  v1 overflowed to 819px — the responsiveness that motivated the overhaul
- narrow-page debt fell 581px → 404px (fits) from U4's TableScroll work

Known residue, accepted: `.ui2-ghost-btn` stays 36px by design (header tab
bar) and page-body overflow at narrow widths was fixed where it mattered
(intake, transactions) — remaining long tables scroll inside their wrapper.

## Superseded predecessor (deleted 2026-11-25)

`docs/ui-refresh-ab-plan-2026-11-22.md` — the earlier A/B draft this plan replaced — was removed now that U0–U6 shipped. Its still-relevant ideas (parallel variant build, `?ui=` flag, phase discipline) were carried here when this doc was written; nothing else in it survived review.

Also closed out with U7 (2026-11-25): the last measured narrow-width defect — the v2 admin tables (`ui2-settings-table--wide`, sessions, report data tables, transaction tables, editor lines table) overflowed at 420px (+144px, widest `ui2-settings-table--wide`). Fixed with a generic `.ui2-scroll-x` wrapper (plain unstyled div in v1, so v1 stays pixel-identical); overflow scan at 420/768/1280 now passes for every route in both variants' reachable states.

## Material pass, PR 1 (2026-11-26, branch `ui-material-m1`)

The v2 token sheet was re-skinned to **Material Design 3**, replacing the
"neutral v2" look in place (still one build, `?ui=v1` unchanged as the escape
hatch). Scope of PR 1: tokens + self-hosted Roboto + primitives/shell state
layers + MD3 press ripple. Deliberately NOT MUI — the class-driven v2 system
stays in control; Emotion-based components would not know `?ui=v1`.

- Tokens (`frontend/src/ui-v2.css`): `--radius` 8→12px (MD3 large, cards/modals),
  `--radius-sm` 6→9999px (MD3 "full" pill, buttons/chips), new `--radius-md`
  28px (dialogs) and `--radius-field` 6px (inputs — MD3 does not pill inputs;
  18 input/panel blocks re-pointed by selector classification), MD3 elevation
  ladder (`--shadow-1/2/3`; legacy `--shadow-1` name keeps its role on cards/toasts,
  dialogs use `--shadow-3`), MD3 color roles (`--md-primary` = ski-navy seed,
  container/tonal/state-layer tokens), Roboto @font-face (self-hosted woff2 in
  `frontend/public/fonts/`, 400/500/700, no CDN).
- Typeface application: `.ui-v2 body` carries the literal Roboto-first stack —
  routing through `var(--font)` does not work because `.ui-v2` and index.css
  `:root` are the SAME element and index.css's later `:root` re-declaration
  would win (verified via computed style; var-on-`--font` also cannot see the
  .ui-v2 redefinition from the body element at all).
- Ripple (`frontend/src/lib/ripple.ts` + tests, 5): one delegated pointerdown
  listener, injected only under `.ui-v2`, skips disabled/aria-disabled targets
  and the `ui2-reduced-motion` flag, spans sized 2×larger-axis centered at the
  press point, removed on animationend. **Chromium quirk found:**
  `animation-duration: var(--custom-prop)` computes to `0s` in Chrome (verified
  vs a literal twin in CDP) — the ripple pins a literal 0.15s duration and the
  pitfall note says why everything else may keep `var(--transition)`.
- Buttons (`frontend/src/components/ui/primitives.css`): filled (primary),
  tonal (secondary = `--md-primary-container`), text/danger; MD3 38% disabled
  opacity; hover = elevation-1 + state layer, active = press state layer.
  Cards gained elevation-1; toasts elevation-2; modals radius 28px + elevation-3.
  Shell navlinks/role-badge stay pill-shaped via the same tokens.
- Probe re-baseline (`scripts/pos-css-check.mjs`): 9 assertions deliberately
  moved to MD3 values (radius 8→12px ×4, ghost/outline buttons → pill,
  secondary button → container color, modal elevation string) plus 3 new MD3
  assertions (font stack leads with Roboto, primary pill radius, tonal
  secondary) = **322 assertions**. Mutation-checked: de-pilling `#im-ghost`
  fails the probe exactly as expected.

Gates (branch): FE 532/532 (+5 ripple), tsc clean, eslint = the pre-existing
4+1, `css-wiring-check` 6/6, `pos-css-check` 322/322, shell probe PASS,
ripple CDP probe (span created, animates 0.15s, self-removes, inert in v1
and under the reduced-motion flag).

PR 2 (planned): the stragglers — nav/header active-tint polish, chip shape on
`ui2-role-badge`-adjacent surfaces if desired, and any values the user's pixel
review flags.
