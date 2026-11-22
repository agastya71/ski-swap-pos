# Event Feedback Work Plan — 2026-11-22

Planning for the 14 issues captured at the MyXC Swap event (2026-11-21), from
`docs/event-feedback-2026-11-21.md`. Grouped into 7 PRs by area + risk, ordered
so quick wins ship first and the risky data migration ships last.

## Decisions confirmed by user (2026-11-22, ask_user_question)

1. **#11 mapping**: standard prefix-strip — Ski Boots→Boots, Ski Poles→Poles,
   Ski Jacket→Jacket, Ski Pants→Pants, Ski→Skis. Classic/Skate Ski subtypes
   stay as-is.
2. **#12 goal**: transaction ID assigned when sale starts (first item added);
   cancelled IDs are voided and **never reused**. Not resumable-drafts scope.
3. **#7 scope**: remove the 3% fee entirely — checkout math drops it; old sale
   rows keep their cc_fee as history; reports unchanged for old data.
4. **Order**: B1→B2→B3 (quick wins) first, then B4→B5→B7→B6.

## Recon notes (from code, 2026-11-22)

- #7 (3% fee): applied in `backend/app/services/checkout.py` `compute_card_fee`
  (L30) + mirrored in `frontend/src/pos/PaymentForm.tsx` `computeCardFee`
  (fee decoded out of the terminal charge). `sale.cc_fee` col exists; live rows
  carry cc_fee $3.00. Removing changes checkout math + reports (cc_fee rides in
  mysl_total — the #145 identity fix).
- #11 (drop "Ski" prefix): canonical lists in `backend/app/services/canonical.py`
  (CATEGORIES with "Ski Boots"/"Ski Poles", type maps). Live DB has 20 "Ski Boots"
  + 12 "Ski Poles" + 4 "Ski" + 7 "Ski Jacket" + 2 "Ski Pants" + 1 "Classic Ski" +
  1 "Skate Ski"(11) + 1 "Roller Ski" rows — a rename needs a data migration +
  filter/report + label interplay check. ~58 items affected in MyXC 2026.
- #12 (tx id at sale start): sale rows are created only at finalize today
  (`create_sale_atomic`); POS builds the cart client-side until then. Needs a
  draft-sale or ID-reservation design on the backend + void-not-reuse rule.
- #2 (keyboard nav): LookupField has error state + dropdown; no global
  hotkeys today. Needs a staff walkthrough to pin exact keymap (the doc says so).
- #10 (state code): backend `_normalize_state` (schemas/seller.py L49) already
  uppercases any case → typing "mn"/"MN" would validate only if the value is in
  the accepted set; the dropdown is the frontend gate (`US_STATES` in
  `src/lib/usStates.ts`). Small change: accept free 2-letter input, validate
  against the same list, normalize.
- #14 (sold-out error position): `LookupField.tsx` L118/L159 `setError(...)`;
  error renders below the dropdown today; needs to surface at top of the
  transaction panel (aria-live for a11y).
- #1/#6 (autofocus): currently NO autoFocus on POS search or intake Quantity —
  both are one-line adds; #6 also wants Tab order verified.
- #4/#13 (qty + type in transaction view): TransactionEditor rows show code/
  desc/price; qty + type need item data already present in the lookup response.

## Batches

| Batch | Issues | Scope | Risk |
|---|---|---|---|
| B1 — checkout focus + view cols | #1, #4, #13, #14 | POS UI only | low |
| B2 — intake focus + qty UX | #5, #6 | IntakeForm/ItemForm | low |
| B3 — formatting | #8, #9, #10 | ItemForm desc, SellerForm phone/state | low |
| B4 — keyboard nav | #2 (+ #1 interplay) | POSPage hotkeys, LookupField tabs | medium |
| B5 — remove 3% fee | #7 | checkout.py, PaymentForm, reports note | medium |
| B6 — tx id at start | #12 | checkout flow redesign | high |
| B7 — category renaming | #11 | canonical.py + data migration | high |

Suggested sequence: B1 → B2 → B3 (quick wins, all low-risk UI),
then B4, then B5 (needs a money decision confirmed below), then B7 (data
migration — needs a decision on old-row mapping), then B6 (biggest design).

## Decisions needed before starting

✅ All four answered 2026-11-22 (see Decisions section at top). No open
questions remain — batches can start in order B1→B2→B3→B4→B5→B7→B6.
