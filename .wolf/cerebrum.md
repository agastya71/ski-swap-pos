---
description: learned preferences, project conventions, and Do-Not-Repeat rules
budget_tokens: 2000
---
# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Consolidated 2026-09-14: full decision rationale lives in `.wolf/history/decisions-archive.md` — keep one-liners + rules only here.
> Last updated: 2026-09-14

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

- Present issues + a proposal FIRST and wait for "proceed" before external/physical actions (e.g., label prints) or merges.
- PR flow: agent commits to a feature branch, opens the PR + requests approval; the user approves (GitHub or chat); the agent merges, pulls main, re-runs the suites.
- Ship pattern: frontend changes = `npm run build` (live immediately, no restart); backend changes = one `sudo systemctl restart ski-swap-pos` (the user runs sudo).
- **Do NOT ask/suggest starting Security Phase 1 or any next phase** — no "say the word" closers, no status pings about it. Start ONLY on the user's explicit request (directive 2026-09-14).

## Key Learnings

### [2026-09-12] ZD421 label printing (CUPS)

- Prints BLANK unless every label carries explicit ^PW/^LL/^LS/^MD/^CI0 from config; #91 geometry: LABEL_LEFT_ORIGIN_DOTS=280, LABEL_RIGHT_EDGE_DOTS=850, ^LS empirically ignored for ^FT fields. ^FO anchors scalable fonts at the BASELINE (tops clip) — use ^FT (top anchor).
- CUPS queue (ZTC-ZD421-203dpi-ZPL) owns the device (no /dev/usb/lp0) → send_to_printer falls back to `lp -d <queue> -o raw`; the queue must be RAW (`sudo lpadmin -p <queue> -E -m raw`).
- #108 (2026-09-27) layout source of truth = the user's MYSL 2020 reference screenshot (event name in-band right-aligned via `^FB…,1,0,R` against the barcode, item ID centered under it via `^FB…,1,0,C`); `label_line_2/3` present → compact regime. Superseded same day by #109 print feedback: uniform 30pt everywhere (user directive), event NEVER truncated (own centered row via the FIRST_ROW slot when the band zone can't hold it at 30pt), item-ID row +6 dots clear of the bars.
- #109 (2026-09-27) MEDIA FACTS (user-confirmed): 1" tall × 3" wide = 203×610 dots. `scripts/label_ruler.py` prints numbered tick scales — read smallest/largest fully-visible number per scale to bracket the media window. Measured: top ≈12 dots below format y=0 (shift content down!), x ≈112..762 (the 2026-09-13 origin-280 window had DRIFTED ~130 dots — stale calibration, not a code bug). Re-run the ruler whenever labels clip. Config now: origin 150 / right 700 / ^LL203 / BAND_TOP 14 / pitch 27.
- #110 (2026-09-27) "barcode ends at X" means the BARS, not the quiet zone: `_barcode_x(barcode, right + 20)` lets the blank trailing quiet zone fall past the content edge so bars end exactly at `right`. The ID row's `^FB{right-bx}` block then centers exactly under the bars. Barcode content = `item.code` always (barcode_39 defaults to it at intake/import; verified 109/109 match).
- [2026-09-27] ~10-dot print-to-print media wander (two probe prints disagreed: left edge ≤129 vs >129) — root cause: loose media guide. Fix: snug the movable guide against the roll + send `~PS~JC` recalibration; after that both probes agreed exactly. Rule: margins < ~10 dots are unsafe until drift is re-confirmed gone — re-run `scripts/label_ruler.py --fine` twice after any roll/guide/media change.

### [2026-09-12] swap.db semantics

- Plain INTEGER PRIMARY KEY (no AUTOINCREMENT): ids restart at 1 after a full DELETE. Live clear while the daemon runs is safe via a 2nd sqlite connection (child-first DELETE + VACUUM); keep alembic_version; backup first.

### [2026-09-14] FastAPI routing + auth probes

- Register specific routes BEFORE parameterized ones (`/sales/mine` before `/{sale_id}`) or the int path param captures them (422).
- The auth dependency runs before path validation → this app returns 403 "Not authenticated" (not 401) for missing tokens; 403-vs-422 discriminates route-missing from route-present.

### [2026-09-11] Frontend conventions

- Buttons share `src/lib/buttons.ts` BUTTON_STYLE (white fill, navy text/border, rounded 4); nav tabs + tiny inline utility controls keep their own styles.
- Prefer role/aria-label test queries; duplicate text across totals + cards → getAllByText.

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->

- fpdf2 cell() does NOT truncate: headers overflow into neighbours (~1.7mm/char at bold 10pt; Due Seller ≥20mm); tables ≤190mm; render via one shared (header, width) column list; verify generated PDFs with pypdf extraction.
- Totals `<tfoot>` must sit OUTSIDE `<tbody>` (table > thead > tbody > tfoot) — invalid nesting triggers the browser CSS table fixup and breaks the column grid; React does not reparent it.
- pi-lens prettier-reformats files after writes — re-read verbatim content before editing a previously-touched file (stale quote-style oldText will miss).
- Backticks inside double-quoted `git commit -m` / `gh --body` strings run as command substitution — use `git commit -F` + `--body-file`.
- `mock_run.kwargs` is an auto-mock attr — use `mock_run.call_args.kwargs`.
- report_formatter needs an explicit `import openpyxl` (items.py's import does not propagate).
- `open(path,'wb')` CREATES missing files — use a parentless path to simulate a missing device in tests.
- `admin_token` transitively creates `active_event` — a "no active event" test must build its own event+user+token inline (scalar ids; create_access_token takes ints/strs).
- Test auth seeding: the client reads `auth_token` (cached) — seed via `setToken()`, not `localStorage['token']`.
- Pyright/Column idioms: `if event.is_active:` flags as error — durable fix = a real `# pyright: ignore[rule]` or restructure (str() on Columns is safe; int() trips unchecked-throwing); lens suppress marks don't survive the fallback LSP path — suppress bottom-up when needed.
- git-workflow-guard: an add/commit chain that STARTS on main is blocked even when `git checkout -b` leads the chain — run the checkout in its OWN command, then add/commit in the next.
- index.css sets a global `table { width: 100% }` — compact label/amount tables must override with inline `width: "auto"` or their right-aligned value cell lands at the extreme edge (the payout summary tables hit exactly this).

## Decision Log

<!-- Significant technical decisions with rationale. One-liners; full rationale in .wolf/history/decisions-archive.md. -->

### [2026-09-02] pi integration

- openwolf-pi adapter provides hooks (digest, anatomy hints, bash governor); debug with OPENWOLF_PI_DEBUG=1.

### [2026-09-08] systemd system daemon

- SYSTEM unit runs start.sh (migrations/repair/seed single-sourced); Restart=always; SIGINT; installer refuses :8001 collisions.

### [2026-09-08] Event deletion

- Explicit child-first cascade (FK pragma OFF); guards: no active-event delete, no caller's-own-event delete (event-scoped users → lockout).

### [2026-09-08] Event name for non-admins

- GET /events/active (any authed user, 503 when none active); fetch failures degrade silently.

### [2026-09-08] Square hidden, not deleted

- SQUARE_CARD_ENABLED=false gates the SDK panel; cardAmt forced 0; flip the constant to restore.

### [2026-09-08] ID scheme

- Seller codes name-derived + global suffix (JSMI1); item codes seller-prefix + unpadded seq via app/services/codes.py; collision bump loop; old data grandfathered; seed idempotency keyed by (event, first, last).

### [2026-09-08] pyrightconfig

- pyrightconfig.json at repo root (venvPath=backend, venv=.venv) so the pyright runner resolves backend deps.

### [2026-09-08→09] Sellers payouts

- SellerPayoutReport = SALES + UNSOLD sections + seller info block; batch endpoint + ZIP + per-seller xlsx/pdf; AllSellersPayouts owns the batch UI.

### [2026-09-10] PDF payout tables + Due Seller

- Shared column geometry (see Do-Not-Repeat); Due Seller relabel; downloads aligned to the ZIP; plain Credit Card payment (cc_transaction_id optional).

### [2026-09-12] tfoot placement

- See Do-Not-Repeat (browser table fixup breaks the grid on invalid nesting).

### [2026-09-18] Improvements batch (PRs #99–#103)

- Pyright/SQLAlchemy: `getattr(obj, "attr", default)` does NOT dodge Column typing — pyright special-cases getattr and resolves the real `Column[int]` type, so arg-type errors persist. Durable fix = per-line `# pyright: ignore[reportArgumentType]` on the reported line (multi-line constructor calls report errors at the call-start line, so per-arg ignores may not land — check where pyright attributes the error).
- fpdf2 output is COMPRESSED: `b"text" in resp.body` fails on PDFs — verify with pypdf `PdfReader(...)` + `page.extract_text()`.
- httpx TestClient responses expose `.content`/`.text`, NOT `.body` (that's the FastAPI Response before serialization).
- Numeric item ids (10000+) break the old "seller code is a prefix of item codes" POS-search convenience — test_search_no_longer_matches_seller_code documents this; flagged to the user as a possible follow-up (seller search box at POS).
- Branched git must VERIFY: after creating a branch, confirm `git branch --show-current` is non-empty AND `git rev-parse <branch>` == HEAD before committing — a chained stray `git checkout --detach` sent commits onto detached HEAD (2026-09-29) and `git push -u origin <branch>` from detached HEAD silently pushed the STALE branch ref (stale code on remote). Fix: `git branch -f <branch> <sha>` + checkout + ff-merge + push.

### [2026-09-30] Agent label geometry nudge (dx/dy)

- pi-lens `typos:unknown` flags ZPL command names (`^FO`, `^FT`) as misspellings in comments/regexes — expect FP churn on any zpl.py/test_zpl editing; mark false-positive per instance (4 marked this session).
- Label geometry nudges MUST be baked into field coordinates: `^FT`-positioned fields ignore `^LS`/`^LT` label shifts (zpl.py module docstring).
- `git add -A` in this repo sweeps unrelated untracked scaffolding (.claude/, .opencode/, OS junk, *.db-shm/-wal/bak) — always stage explicit paths.

### [2026-10-06] Label layout v4→v5 (uncommitted; renders approved pending)
- v5 user directive chain: price below the barcode band (FIRST_ROW_Y=66), donation "D" below the price (rides the ID row left column, no row cost; own pitch in text mode), event takes the price's OLD band-left slot (EVENT_ROW_Y=33) — **supersedes the 2026-09-28 "event never in the band" rule** (that rule only applied while the price sat there). Lower flow unchanged: seller@120, cat@147, desc@174 (fits again), line2/line3 fit-guarded sacrifices. Desc truncates at DESC_MAX_CHARS=30; other fields keep 28.
- Labelary view endpoint moved: `labelary.com/view.zpl` is dead (404) → `https://api.labelary.com/v1/printers/8dpmm/labels/{w}x{h}/0/` (POST raw ZPL, 3 req/s free). ZD421 render canvas: 4x1in (^PW723 ≈ 3.56" content window). Review PNGs in `.wolf/renders/` (uncommitted); render script asserts every expected slot before rendering (WORKER-RESULT gate).
- "spawn python ENOENT" in pi-lens's auto test-runner: bare `python` isn't on PATH here — run suites explicitly via `backend/.venv/bin/python -m pytest`.

### [2026-10-06] Label layout v6 (uncommitted; render-pending approval)
- v6 directive: price leaves its own row entirely — it COMPOSES with the donate flag into one field on the SELLER row's right column (SELLER_ROW_Y=120), left-justified at the barcode's x anchor bx (floored at origin+180 so a long item code can't slide the flag under the seller code); text mode splits at the content midpoint ((origin+right)//2 = 435). Composed string: "D" + exactly 4 spaces + price ("D    $125.00"); non-donate prints the price alone. The flag left the ID row (93 = ID alone, uniform unchanged); y=66 (v5 price row) sits EMPTY. Flow below y=120 unchanged: cat@147, desc@174 (30-char cap ✓ fits), line2/line3 fit-guard-dropped in barcode mode. Text-mode flow tightened: seller@80 + flag/price@80-right, cat@107, desc@134, line2@161, line3@188-dropped (line3 FITTED in v6 — test updated).
- Do-Not-Repeat reinforcement: when an edit's oldText spans a section header comment, carry the removed assignments (code_block was dropped by a v6 replace → caught by the session auto-check as undefined name); re-grep the whole test file for affected assertions after any row-math change (the stale "Adult not in zpl" text-mode test was NOT in the edit set — the suite caught it).

### [2026-10-06] DESC cap revision: 30 → 20 chars
- User revised the description truncation to DESC_MAX_CHARS=20 (was 30, set earlier the same session). Case-A render desc now "Nordica Nrgy 90 Ski " — a trailing space is legal and kept in the ^FD (renders fine). 20 chars always fits anywhere the desc can land (147/174).

### [2026-10-06] Label v7: global +4-dot label shift
- LABEL_DOWN_DOTS=4 folded into dy_eff = dy + LABEL_DOWN_DOTS in generate_zpl — EVERY field's y +4 (bars ^FO now at 18, event 37, ID 97, seller/flag+price 124, cat 151, desc 178, text-mode rows 44/84/111…). The per-print dx/dy agent nudge stacks on top. Desc row still fits (178+24=202 ≤ 203, one dot to spare) — re-check the fit guard after ANY further downward shift: line2 is the next casualty.
- Test lesson: the dx/dy relational test must compare only the surviving PREFIX of the field list (`zip(base[:len(shifted)], shifted)` + `0 < len(shifted) <= len(base)`) — a dy nudge near the canvas edge drops the bottom row via the fit guard (6 vs 5 fields), so a strict len== assert breaks on legitimate layout behavior (guard drops take the bottom only — loop breaks at the first non-fitting row).
