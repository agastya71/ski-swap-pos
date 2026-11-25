# UI verification pitfalls (read before phases U4–U6)

Findings from building and verifying phases U0–U3 of
[`ui-overhaul-ab-plan-2026-11-24.md`](./ui-overhaul-ab-plan-2026-11-24.md).
Every item below **actually happened**, and most failed *silently* — green
tests, no errors, wrong result. Each entry says what to do instead.

Guard for #1, #2 and #5b is automated: `node scripts/css-wiring-check.mjs`
(five groups), and as of the hook install below it runs before every push that
touches frontend CSS.

## Install the guard once per clone

`.git/hooks/` is not version-controlled, so the hook sources live in
`scripts/hooks/` and get copied in:

```bash
bash scripts/install-git-hooks.sh
```

The pre-push hook inspects the pushed range and only runs the check when
`frontend/src/**/*.css` (or the check script itself) changed, so unrelated
pushes cost nothing. `git push --no-verify` bypasses it.

---

## 1. `@import` after other statements is dropped silently

**Happened twice.** First when the v2 imports were appended to the end of
`frontend/src/index.css` (fixed in PR #165). Then again when a `main` → branch
merge re-ordered the file: the built CSS went from 12.05 kB to 2.40 kB with
**zero** `.ui2-*` rules while all 424 frontend tests passed.

PostCSS prints `@import must precede all other statements` and moves on. Vite
does not fail the build. Vitest stubs CSS to empty strings, so no test sees it.

**Do:** keep every `@import` above all other statements in `index.css`. After
adding or merging, confirm the built bundle actually grew:

```bash
ls -la backend/static-next/assets/*.css
grep -c 'ui2-' backend/static-next/assets/index-*.css   # must be > 0
```

## 2. A v2 stylesheet nobody imports looks exactly like working code

Rules sit in the repo reading as authoritative; the browser never receives them.

**Do:** `scripts/css-wiring-check.mjs` fails when any file matching
`/v2|ui2/i` under `frontend/src` is missing from `index.css`. It also fails if
any v2 rule is not scoped under `.ui-v2` / `.ui2-*` — unscoped rules break the
"v1 stays pixel-identical" promise the A/B plan rests on.

## 2b. A checker that reads the working tree cannot certify a commit

Writing the pre-push hook, the first version read `git diff --cached` and the
working tree — so with broken CSS sitting **unstaged**, it validated content
that was never being pushed and exited 0. The tree was broken; the hook said
fine.

**Do:** a hook must derive what it checks from the refs git hands it on stdin
(`<local ref> <local sha> <remote ref> <remote sha>`), and must refuse to run
when the files it inspects are dirty — otherwise it is vouching for something
other than the push.

## 3. `/next/` serves the v2 bundle but defaults to v1

The variant is chosen from `location.search`, and this is a **hash router**, so
the flag must precede the hash:

```
/next/?ui=v2#/pos     ✅
/next/#/pos?ui=v2     ❌ renders v1
/next/#/pos           ❌ renders v1
```

Omitting the flag produced 6 confusing probe failures and one whole checklist
run against v1.

**Do:** `css-wiring-check.mjs` flags script URLs that build a `/next/…#…` string
without `?ui=`.

## 4. `variantProps` does not fit every element

Two cases break it, both from U3 part 2:

| Helper | Use for |
|---|---|
| `variantProps(v2, cls, v1Style)` | elements with a v1 inline style worth preserving |
| `v1Only(v2, v1Style)` | `td`/`tr`/`th` — drop the inline style, let an ancestor selector supply the v2 look |
| `v2Only(v2, cls)` | previously-unstyled `<button>`s that only gain a class in v2 |

Passing `""` as the class name is meaningless — `variantProps` maps it to
`undefined`, but reach for `v1Only` instead.

## 5. Mutation-test the assertion, not just the code

`pos-css-check` caught three of my own mistakes on first run, none of which any
unit test would have:

- `var(--font-size-base)` **does not exist** — tokens stop at `-sm`/`-md`/`-lg`
  ... and there is no `-base`. The scan field rendered 16px instead of 18px, silently.
- `width: 100%` assertion was wrong (computed 765px in a 1280px viewport).
- `#cart-note-input` selector was wrong; the real id is `#cart-note`.

**Do:** after writing a CSS assertion, break the CSS and confirm it goes red.
Removing the dirty-row class turns exactly 1 test red; removing a per-field
width turns the width test red.

## 5b. An undefined CSS custom property is dropped silently

`color: var(--gray-600)` where `--gray-600` was never defined renders as
*inherited* `--gray-900`. No build error, no warning, no test failure — the
legend just came out near-black instead of gray.

Happened twice: `--font-size-base` in U3 (scan field rendered 16px not 18px) and
`--gray-600` / `--gray-800` in U4 (three separate rules). Both were caught only
by a computed-style probe, never by the test suite.

**Do:** group 4 of `scripts/css-wiring-check.mjs` now fails when any `var()`
in a v2 sheet has no definition anywhere under `frontend/src`. Add a token to
`ui-v2.css` instead of a one-off hex so the scale stays complete.

## 6. A DOM-injection harness needs its own assertion

After the checklist fixture was rewritten, all 78 assertions reported
`MISSING ELEMENT` — the injection `Runtime.evaluate` was failing silently and
the harness reported a broken stylesheet instead of a broken harness.

**Do:** check `exceptionDetails` on every evaluate, and log a positive count
(`# fixture injected (N root(s) found)`) so a failed injection cannot masquerade
as 78 missing rules.

## 7. Drive React inputs in two ticks

`input` and `keydown` dispatched in the same `evaluate` call means React's
keydown handler reads a **stale `value`**. Step 3 of the checklist "passed"
twice while adding nothing.

```js
// 1) set value + dispatch input
// 2) await sleep(~600) so React commits
// 3) dispatch keydown separately
```

**Do:** assert a *delta* (`rowsBefore + 1`), never a state that is already true
(`rows > 0`). A precondition-free assertion passes for free.

## 8. Read the wrong entity and every delta lies

The checklist read edit-history for the API-newest sale (#154) while the UI had
opened the admin's own sale (#138). Each comparison was between two different
sales — all deltas meaningless, and two steps still "passed".

**Do:** derive the id from what the UI actually shows (the editor title), then
use *that* for every API read.

## 9. Copying a SQLite `.db` without deleting `-wal`/`-shm` replays old edits

Resetting the test sandbox by copying only `test_swap_pos_2026.db` left the
previous run's `-wal` beside it; the next open replayed those edits. It looks
exactly like "the reset didn't work".

**Do:** `bash scripts/test-swap-sandbox.sh` deletes the directory first.

## 10. Verify production was not touched, every time

The checklist writes real rows. After each run:

```bash
sqlite3 backend/events/test_swap_pos_2026.db \
  "select count(*) from sale_edit"          # expect 0
sqlite3 backend/registry.db \
  "select name from event where is_active=1" # expect MyXC, not TEST
md5sum backend/static/assets/index-*.css     # expect the main build
```

## 11. Styling-only means styling-only

Converting `LookupField` to v2, I rewrote its keyboard *logic*: highlight became
id-based instead of index-based and Tab semantics changed. Caught by reading the
diff, then reverted with `git checkout` and redone.

**Do:** before calling a refactor "styling only":

```bash
git diff <file> | grep -E '^[-+].*(if \(|function |useState|return |&&|\|\|)' \
  | grep -v 'variantProps\|v1Only\|v2Only\|style=\|ui2-'
```

Only style/class lines may appear.

## 12. Prod is built from `main`; `git pull` does not deploy frontend

`backend/static/` is gitignored and served per request. A frontend change needs
`npm run build` from `main`. `backend/static/` must only ever be written by
main builds — never from a phase branch.

---

## Open items these findings feed into

- **Narrow-viewport tables (U4/U5).** At 420px the `TransactionEditor` table
  overflows its own container: editor 362px wide, table 622px, 11 elements past
  the right edge. The shell header fits exactly (`right=420`). This is expected
  debt — the shared `TableScroll`/`data-stack` pattern from U2 is still unused
  by any page. Do it in U4, where the first real tables live, **before** U5's
  admin tables (the largest set) depend on it.
- **Screenshots are never committed.** The repo is public and the active event
  is real (MyXC). Evidence is computed-style text via
  `scripts/ui-style-probe.mjs` / `pos-css-check.mjs`; the capture script refuses
  non-test events.
