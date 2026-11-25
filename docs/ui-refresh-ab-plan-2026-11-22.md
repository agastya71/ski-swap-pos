# UI Refresh + A/B Testing Plan — 2026-11-22

Goal: make the SPA noticeably more intuitive and "slick", evaluated by A/B testing
against the current UI, with easy undo at every level. **Planning only — not
approved for execution yet.**

User-confirmed decisions (2026-11-22, ask_user_question):

1. **A/B switch**: URL param + persisted flag (single bundle, no backend change).
2. **Style stack**: extend the existing CSS token system + shared components —
   no new runtime dependencies, no component library.
3. **Order**: global baseline first (tokens/components/Layout → every page
   inherits), then POS, then Intake, then Admin.
4. **Cadence**: small PRs into `dev`; after each validated batch one dev→main
   promotion PR. Undo granularity = per-PR `git revert` + the variant flag.

## Non-goals

- No backend/schema changes (except none needed at all — flag lives client-side).
- No changes to checkout math, payout rules, label printing, or reports logic —
  purely presentational. Functional event-feedback batches (PR #151 open; B4–B7
  planned) continue as ordinary PRs to `main`, on their own track.
- No new runtime dependencies (bundle stays lean; event-critical POS unaffected).

---

## 1. Variant mechanism (single bundle, client-side)

New module `frontend/src/lib/uiVariant.ts`:

```ts
export type UiVariant = "v1" | "v2";
// ?ui=v2 (or ?ui=v1) → remember in localStorage["ui-variant"], return value.
// No param → read saved flag → default "v1".
```

- Decided once at boot in `main.tsx`: sets `document.documentElement.classList`
  (`ui-v2`) and React context value. Hash router unaffected.
- **URL form**: because routing is hash-based, the param goes before the hash:
  `https://mysl-pos.duckdns.org/?ui=v2#/pos`. Set once; afterwards plain URLs
  keep the saved choice. `?ui=v1` switches back. Default for everyone = **v1**
  (tests deterministic; staff unaffected until we promote).
- Components mostly share DOM; v2 styling lives in CSS under `.ui-v2` selectors
  overriding design tokens. Where v2 needs *structural* differences (e.g. a
  redesigned panel), `useUiVariant()` conditionally renders — only where needed.
- Undo ladder: (a) `?ui=v1` / clear localStorage per device; (b) promotion PR
  not merged → main still serves v1-default bundle; (c) after promotion,
  `git revert` the promotion commit + `npm run build` (frontend-only, live).

**Key technical constraint** (drives the per-page work): most of today's styling
is inline `style={{...}}`, which plain CSS cannot override (no `!important`
games). So "v2 look" requires lifting hot inline styles to token-driven
classes — that migration IS the bulk of the effort, and it must keep the v1
render pixel-equivalent. Existing FE tests + a few added style assertions guard
that; small intentional normalizations get verified by a human pass on the
TEST event data before each promotion.

## 2. Styling approach (token & component polish)

- Keep `index.css` design tokens as the v1 baseline (untouched).
- Add a `.ui-v2` token block (refined spacing scale, larger touch targets,
  consistent radii/shadows, focus-visible rings, subtle transitions, better
  empty/loading/error states) + a small `ui.css` for shared primitives.
- New `frontend/src/components/ui/` primitives: **Button, Input, Card, Table,
  Modal** (+ later Select/Dropdown). All read `var(--…)` tokens so one DOM
  serves both themes. `lib/buttons.ts` BUTTON_STYLE stays for anything not yet
  migrated.

## 3. Branch & PR flow

```
main ──► dev (created from current main)
           ▲──────── feature branches ui/dN-* (PRs target dev)
main ◄── promotion PR dev→main (one per validated batch; user approves)
```

- Functional fixes (#151 B3 currently OPEN → main; B4–B7 later) keep landing on
  `main` per the existing plan; `dev` rebases on main as those merge.
- Check at execution start: `scripts/merge-pr.sh` assumes base `main` — dev-target
  PRs likely merge via `gh pr merge --squash` (or extend the script). Verify
  before the first dev PR, no repo changes yet.

## 4. Phases (each = small PR into dev)

| PR | Scope | Risk |
|---|---|---|
| D0 | A/B infra: `uiVariant.ts`, boot wiring in `main.tsx`, root class, context; tests for param/flag/default/persist | low |
| D1 | v2 token block + `ui.css` + `components/ui/*` primitives; lift shared inline styles; tests (v1 parity + v2 look) | low–med |
| D2 | Layout v2: nav bar, footer, page container, headings, focus states | low |
| D3 | POS v2: scan field, lookup dropdown, cart/transaction view, payment form, confirmation (event-critical — smallest steps, human walkthrough each) | med |
| D4 | Intake v2: forms, ItemList, search page | low–med |
| D5 | Admin v2: tables, reports, modals | low–med |

After each validated batch: one dev→main promotion PR → rebuild → verify live
(bundle hash + spot-check `/`, POS, intake, admin on the test data). Suites
after every merge: `npm test`, `npx tsc -b`, `npm run lint`, backend suite
untouched but re-run when main moves.

## 5. A/B evaluation protocol

- Practice surface: `TEST SWAP POS 2026` event (TRAI1/RIDG1 data) — evaluate
  without touching MyXC swap data.
- Per batch, a short human checklist (admin/user executes, ~10 min): complete
  one intake flow, one checkout (cash + card), one payout/report view — on v1,
  then on v2; note friction/bugs. Checklist goes in the batch PR description.
- v1 must stay default on main until the *cumulative* verdict per area.
- Retirement (later, separate PR): flip default to v2, delete v1 CSS paths,
  remove the flag.

## 6. Undo matrix

| Situation | Undo |
|---|---|
| User dislikes v2 on a device | `?ui=v1` or clear localStorage |
| Batch not validated | don't approve its promotion PR; main never sees it |
| Promotion merged, regression found | `git revert` the squash commit on main + rebuild (live immediately, no restart) |
| Whole initiative abandoned | dev branch deleted; main only ever took promoted batches; final revert removes flag (v1 default already) |

## 7. Guardrails / conventions (from repo rules)

- Frontend tests: MSW handlers, role/aria queries, `getAllByText` for dupes,
  seed auth via `setToken()`; v2-specific tests set the flag/localStorage.
- `npm run build` = live (FastAPI serves `backend/static/` from disk, no
  restart). No backend restart needed anywhere in this plan.
- Pre-existing lint errors (4 + 1 warning, untouched files) stay out of scope.
- Hash-router test gotchas (set `window.location.hash`, strip leading `/`) apply.

## 8. Open items to verify at execution start (not blocking plan approval)

1. `scripts/merge-pr.sh` base-branch behavior for dev-target PRs.
2. Exact v2 token values (present a short visual sample — 2-3 screens rendered
   both ways — before D1 merges, no label-printer involvement).
3. Whether any FE tests assert inline styles that D1's lift would break (adjust
   assertions alongside, keeping v1 DOM identical).

**Not starting any of this until explicit go-ahead.**
