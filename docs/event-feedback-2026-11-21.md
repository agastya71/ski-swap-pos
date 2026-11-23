# Event Feedback — 2026-11-21 (MyXC Swap)

Running inventory of checkout/intake UX concerns collected during the event.
Status legend: ☐ open · ▶ in progress · ☑ fixed · ✖ won't do.

| # | Area | Issue | Status |
|--- | --- | --- | --- |
| 1 | Checkout | Auto-focus the item **search field** when adding items | ☑ B1 (PR #149): auto-focuses + refocuses after each add/remove |
| 2 | Checkout | Full **keyboard navigation** (no mouse required) | B4 |
| 3 | Checkout | Item-lookup **dropdown covers transaction lines** below it | B4 |
| 4 | Checkout | Show **quantity** of each item in the transaction view | ☑ B1 (PR #149): lookup dropdown rows show "N left" (also in Cart) |
| 5 | Intake | Smoother **quantity adjust** flow | ☑ B2 (PR #150): per-row drafts, `=target` entry with live preview, Enter applies |
| 6 | Intake | New item: **focus Quantity** when adding | ☑ B2 (PR #150): initial focus on Qty, refocus after each add |
| 7 | Checkout | **Remove automatic 3% credit-card fee** added to CC transactions | B5 |
| 8 | Intake | **Description field: capitalize** first letter after each space | ☑ B3 (PR #151): capitalized per word while typing; existing capitals (GORE-TEX) preserved |
| 9 | Intake/Seller | **Auto-format phone number** in seller details | ☑ B3 (PR #151): live `(NNN) NNN-NNNN` on registration + edit; payload stays digits-only |
| 10 | Intake/Seller | Allow typing a **2-letter state code** (not only dropdown pick) | ☑ B3 (PR #151): type-able 2-letter input with datalist suggestions, uppercased in-field, client-side US-code gate |
| 11 | Categories | Drop the **"Ski" prefix** (Ski boots→Boots, Ski poles→Poles); likewise Clothing | B7 |
| 12 | Checkout | **Transaction ID assigned when sale starts**; cancelled IDs never reused | B6 |
| 13 | Checkout | Show item **Type alongside Category** in the transaction view | ☑ B1 (PR #149): Category · Type sub-line in dropdown rows + Cart |
| 14 | Checkout | **Sold-out error appears at top of screen**, not bottom | ☑ B1 (PR #149): all errors mirror to top banner above scan field |

Status values reference the batch in `docs/event-feedback-plan-2026-11-22.md`.
When a batch merges, replace that row's batch tag with ☑ (or ✖ if won't-do).

## Notes / decisions to make when planning

- #7: check whether the 3% is applied in backend `checkout.py` (cc_fee column exists on `sale`) vs. frontend calc; decide whether to keep the fee field but stop auto-applying, or remove entirely. Existing sales recorded with cc_fee $3.00.
- #11: check whether canonical category/type lists live in `backend/app/routers/items.py` (brands?category= endpoint) and how many existing items carry "Ski …" categories — renaming affects filters, reports, and stored item rows; may need a migration + keep old values readable.
- #12: largest backend change — affects sale creation flow, void/cancel handling, and any gapless-ID expectations; decide format (current `id` vs. prefixed display id).
- #8 conflicts slightly with how descriptions are entered today (free text); define exact rule: capitalize first letter after each space (Title-ish per word), preserving acronyms? TBD.
- #2: likely means tab order + Enter-to-add + arrow keys in dropdown; scope after a walkthrough with checkout staff.

*(User may append more items — keep numbering continuous.)*
