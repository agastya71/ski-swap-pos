# Legacy export → SQLite import assessment

Source files reviewed: `~/Downloads/reswapposinfo/`
- `Swap_SellerExport.csv` (741 sellers)
- `Swap_IntakeExport.csv` (59 intakes)
- `Swap_SellerItemsExport.csv` (1016 items)

> **No data was imported.** This document evaluates the exports, describes
> them, lists the discrepancies between the legacy CSV schema and the current
> SQLite schema (`backend/app/models/*.py`), and records the decisions used by
> `scripts/transform_legacy_export.py` to produce import-ready files.

## 1. File inventory

| File | Rows | Format | Notes |
|---|---|---|---|
| `Swap_SellerExport.csv` | 741 | comma, ASCII, LF | sellers (consignors + vendors) |
| `Swap_IntakeExport.csv` | 59 | comma, ASCII, LF | intake sessions; **1 row is column-shifted/garbage** |
| `Swap_SellerItemsExport.csv` | 1016 | comma, ASCII, LF | consigned items (none are sold) |
| `*.txt` (×3) | — | **tab-separated**, UTF-8 BOM, CRLF | the original export format; same logical data as the `.csv` (the `.csv` files are the comma-converted versions). The `.txt`/`.csv` differ only in delimiter/encoding; one intake row count differs because of the malformed row. **Use the `.csv` files.** |

## 2. CSV column → DB column mapping

### 2.1 Sellers (`Swap_SellerExport.csv` → `seller` table)

| CSV column | DB column | Mapping / notes |
|---|---|---|
| `ID` | `id` | preserve legacy PK (see §4 ID strategy) |
| `Code` | `code` | NOT NULL UNIQUE — 1 empty, 3 duplicates (see §3) |
| `Retailer` | `is_vendor` | TRUE→1, FALSE→0 |
| `First_Name` | `first_name` | nullable |
| `Last_Name` | `last_name` | nullable |
| `Company` | `company` | nullable |
| `Email` | `email` | 125 empty |
| `Home_Phone` / `Business_Phone` / `Mobile_Phone` / `Fax` | `phone` | **4 fields → 1**. Prefer Mobile, else Home, else Business; ignore Fax. (See §3.) |
| `Address` | `address` | 44 empty |
| `City` | `city` | 53 empty |
| `State` | `state` | 57 empty; values include MN/WI/UT/CO |
| `Zip` | `zip` | 93 empty |
| — | `event_id` | not in CSV — assign the active event at import |
| — | `donate_unsold_default` / `donate_proceeds_default` | not in CSV — default `false` |
| — | `created_at`/`updated_at`/`created_by` | not in CSV — set at import (`created_by='legacy_import'`) |

### 2.2 Intakes (`Swap_IntakeExport.csv` → `intake` table)

| CSV column | DB column | Mapping / notes |
|---|---|---|
| `ID` | `id` | preserve legacy PK; **1 row malformed** (see §3) |
| `Seller_ID` | `seller_id` | FK → seller |
| `Date_Entered` | `date_entered` | `M/D/YYYY` → `YYYY-MM-DD`; 1 empty |
| `Date_Received` | `date_received` | `M/D/YYYY` → `YYYY-MM-DD`; 1 empty |
| `Total` | `total` | float; 1 empty; **3 numeric rows disagree with sum(item Extended_Price)** (see §3) |
| `MYSL_Total` | `mysl_total` | float; **ratio = 0.15** for all 56 non-empty rows (see §3 commission) |
| `Seller_Total` | `seller_total` | float |
| `Donate_Unsold` | `donate_unsold` | TRUE/FALSE/empty → 1/0/0; 2 empty |
| `Donate_Proceeds` | `donate_proceeds` | TRUE/FALSE/empty → 1/0/0; 2 empty |
| `Seller_Name` | — | **denormalized** "Last, First" display name; not stored on intake (intake links via seller_id). Drop. |
| — | `event_id` (none — intake has no event_id; it joins via seller→event) | n/a |
| — | `created_at`/`updated_at`/`created_by` | set at import |

### 2.3 Items (`Swap_SellerItemsExport.csv` → `item` table)

| CSV column | DB column | Mapping / notes |
|---|---|---|
| `ID` | `id` | preserve legacy PK |
| `Seller_ID` | `seller_id` | FK |
| `Intake_ID` | `intake_id` | FK |
| `Code` | `code` | **100% empty** — must synthesize (see §3) |
| `Category` | `category` | 40 empty |
| `Brand` | `brand` | 44 empty; trailing spaces present (trim) |
| `Description` | `description` | 58 empty |
| `Size` | `size` | 135 empty |
| `UOM` | `uom` | **100% empty** |
| `Type` | `type` | 174 empty |
| `Price` | `price` | NOT NULL; **4 rows = 0** (see §3) |
| `Color` | `color` | **100% empty** |
| `Used` | `used` | all `FALSE` → 0 |
| `Gender_Age` | `gender_age` | **100% empty** |
| `Year` | `year` | all `0` → store as **NULL** (0 is a sentinel) |
| `Barcode_39` | `barcode_39` | values like `-2183` (negative of ID); keep as-is |
| `Label_Line_2` | `label_line_2` | 40 empty |
| `Label_Line_3` | `label_line_3` | 36 empty |
| `Quantity` | `quantity` | **13 rows = 0** (see §3); 386 rows > 1 |
| `Extended_Price` | — | **not an item field** — belongs to `sale_item.extended_price`. All `Sale_ID=0` here, so no sale items to create (see §3). |
| `Vendor_Item_ID` | `vendor_item_id` | **100% empty** |
| `DonateUnsold` | `donate_unsold` | `'Donate'`→1, empty→0 (290 donate, 726 not) |
| `Sale_ID` | — | **not an item field** — would map to `sale_item.sale_id`. **All rows = 0 → no sales in this dataset.** (See §3.) |
| — | `status` | not in CSV — derive: `Sale_ID>0`→`sold`, else `available`. Here all → `available`. (Donated/returned not representable.) |
| — | `label_printed` | not in CSV — default `false` |
| — | `is_deleted` | not in CSV — default `false` |
| — | `created_at`/`updated_at`/`created_by` | set at import |

## 3. Discrepancies & data-quality issues

### Schema-level (legacy vs SQLite)

1. **Item `Code` is entirely empty.** The DB requires `code NOT NULL UNIQUE` (it's the cashier barcode lookup key). The legacy items carry no human code; `Barcode_39` is `-<ID>`. → Synthesize a unique code per item (transform uses `LEG-<item_id>`; see §4).
2. **Items mix item fields and sale fields.** `Sale_ID` and `Extended_Price` are sale-line (`sale_item`) attributes, not item attributes. The DB separates `item` and `sale_item`. → Split: if `Sale_ID > 0`, create a `sale_item` (and a `sale` if absent). **In this export every `Sale_ID = 0`, so no sale/sale_item rows are produced.**
3. **No `Sale` export exists.** Items with `Sale_ID > 0` (none here) would reference sales not present in the dataset. → If future exports include sold items, a `Swap_SaleExport.csv` is required to populate `sale` + `sale_item`. Without it, sold items can only be marked `status='sold'` with no transaction record.
4. **Item `status`, `label_printed`, `is_deleted` are absent.** → Derive/default (`available`/`false`/`false`). Donated/returned states are **not recoverable** from this export.
5. **Seller has 4 phone columns; DB has 1 `phone`.** → Choose one (Mobile → Home → Business) or concatenate. Transform picks one and logs the choice.
6. **Intake has a denormalized `Seller_Name`** ("Last, First") not present on the DB intake (which joins via `seller_id`). → Drop.
7. **Commission rate mismatch.** Every non-empty intake has `MYSL_Total / Total = 0.15` (15% MYSL). The current DB event defaults to `commission_rate = 0.30` (30%). The intake totals are pre-computed and stored, so importing them as-is is fine **for history**, but **new sales would compute at 30%**, creating inconsistent reporting. → Either set the target event's `commission_rate` to `0.15` before import, or recompute the stored totals at the target rate (transform can recompute). The transform preserves the legacy totals and flags this for a decision.
8. **No `event_id` in any CSV.** All legacy records must be attached to a single active event at import. → Transform leaves `event_id` blank; the import step supplies the active event id (sellers get it; intakes join via seller; sales would get it).
9. **ID strategy.** Legacy PKs (seller 1038–1803, intake 4016–…, item 2183–…) are from a different sequence. The DB uses auto-increment. Two options: (a) preserve legacy IDs by inserting explicit `id` values (safe if the target DB only has seed rows with small IDs 1–17, which don't collide); (b) let the DB assign new IDs and remap all FKs (`seller_id`, `intake_id`) via an ID map. The transform preserves legacy IDs (option a) so FKs stay valid without remapping; §4 documents the alternative.

### Data-quality (within the CSVs)

10. **Malformed intake row.** One intake row is column-shifted (missing `ID` + `Seller_ID`): it reads as `ID='Stephen Bennett', Seller_ID='11/14/2025', …`. The true row is seller **Stephen Bennett (seller ID 1803)**, entered/received 11/14/2025, Total 100, MYSL 15, Seller 85, donate flags FALSE. → Transform repairs it by mapping from `Seller_Name` and the known seller id 1803, and logs the repair. (Its intake ID is unknown; items cannot link to it — none do.)
11. **3 intakes where `Total != sum(item Extended_Price)`** (numeric IDs): 4034 (180 vs 205), 4049 (1667 vs 1672), 4079 (0 vs 90). → Transform preserves the legacy `Total` but emits a warning list; the import decision is "trust stored totals" (default) vs "recompute from items."
12. **6 "individuals" have no person name but do have a `Company`** (IDs 1202 MYSL, 1205 FRED Vendor, 1239 MYX, 1284 Inventory Override, 1404 MYSL Donations, 1475 ReservedAccount). These look like **internal/special accounts mislabeled `Retailer=FALSE`**. The DB's `SellerCreate` validator requires a name for individuals. → Treat as vendors (`is_vendor=true`, company = the Company value) OR move Company into `last_name`. Transform flags these for manual review rather than silently dropping.
13. **2 "vendors" have a person name and no `Company`** (Jeff Hanson 1335, Lynne Cecil 1526). Inverse misclassification. → Flag for review; likely should be individuals.
14. **Duplicate seller `Code` = `HA2132` ×3** (Jenny Hanson 1422, Sue Harrison 1607, Gail Hansen 1619). The DB has `UNIQUE(event_id, code)`. → Disambiguate by suffixing the ID (`HA2132_1422`, etc.) or regenerating codes from ID.
15. **1 individual has an empty `Code`** (Sean Murphy, ID 1742). `code` is NOT NULL. → Synthesize (e.g., `MUR1742` or `LEG-1742`).
16. **5 individual codes are purely numeric** (e.g., Stephen Bennett `4831803`). The DB `code` is a string, so this is allowed, but it's inconsistent with the `<PREFIX><ID>` pattern. → Keep as-is (still unique).
17. **Item `Year` = 0 everywhere.** 0 is a sentinel for "unknown". The DB `year` is a nullable Integer. → Convert 0 → NULL.
18. **Item `Quantity` = 0 for 13 rows.** An item with qty 0 cannot be sold at POS. → Flag; either drop, set to 1, or keep as-is with a warning. Transform keeps but warns.
19. **Item `Price` = 0 for 4 rows.** `price` is NOT NULL but 0 breaks sale math. → Flag for review.
20. **`DonateUnsold` uses the word `'Donate'`** (not TRUE/FALSE). → Map `'Donate'`→true, empty→false.
21. **`Used` = FALSE everywhere; `Color`/`UOM`/`Gender_Age`/`Vendor_Item_ID` 100% empty.** → Import as-is (NULL/empty); consider dropping these columns from the item form if they're never used, but that's a separate schema decision.
22. **Trailing whitespace in `Brand`** (e.g., `'Salomon '`). → Trim all string fields.
23. **Date format `M/D/YYYY`** (US, unpadded). DB `date_entered`/`date_received` are `Date`. → Parse and emit `YYYY-MM-DD`.
24. **The intake export is incomplete — 4 intakes are missing.** Intake IDs `4032`, `4048`, `4063`, `4072` fall inside the exported range (4016–4082) but are absent from `Swap_IntakeExport.csv`, yet **28 items reference them** (1, 1, 13, 13 items respectively). On import those 28 items would have a dangling `intake_id` FK. Each missing intake maps to exactly one seller (1793 Michele Madigan, 1269 Gill Creel, 1814 Kari Anderson, 1819 Tim Kokes), so a stub intake can be synthesized from the items if the full export can't be recovered. The transform lists these in `transform_report.txt` under `item_orphan_intake`. → Best: obtain the complete intake export. Fallback: emit stub intake rows for the 4 missing IDs using the seller_id inferred from their items and totals summed from the items.

## 4. Remediation / transform strategy

`scripts/transform_legacy_export.py` reads the three `.csv` files and writes
**import-ready** CSVs to an output directory (`legacy_transformed/` by default)
with the DB column names. It does **not** open the database.

Decisions applied by the transform:

- **IDs preserved** (legacy `id` values written through). FKs (`seller_id`,
  `intake_id`) reference the preserved IDs, so no remap is needed. *Alternative:
  if inserting into a DB that already has high IDs, switch the script to remap
  IDs via a mapping dict.*
- **`event_id` left blank** in `sellers.csv` (`intakes`/`items` don't need it
  directly). The import step must fill it with the active event id.
- **Booleans normalized**: `TRUE`/`'Donate'`→`1`, `FALSE`/empty→`0` (donate flags
  empty→`0`); `Used` `FALSE`→`0`.
- **Dates**: `M/D/YYYY`→`YYYY-MM-DD`; empty stays empty (NULL).
- **Item `code`** synthesized as `LEG-<item_id>` (guaranteed unique). `barcode_39`
  kept verbatim.
- **Item `year`** 0→empty (NULL).
- **Item `status`** = `available` for all rows (no `Sale_ID>0`); `label_printed`
  = `0`; `is_deleted` = `0`; `created_by` = `legacy_import`.
- **Item `price`/`quantity` 0 rows** kept but listed in `transform_report.txt`.
- **Seller `phone`** = first non-empty of Mobile, Home, Business (Fax ignored).
- **Seller `code`** disambiguated: duplicates get `_<ID>` suffix; the empty-code
  seller becomes `LEG-<ID>`.
- **Misclassified sellers** (§3.12, §3.13) and the **malformed intake row**
  (§3.10) are written to `transform_report.txt` for manual review, not silently
  altered (except the intake row, which is repaired to seller 1803 and logged).
- **No `sale`/`sale_item` files** are produced (no sold items in this export).

### Running it (transform only — no import)

```bash
python3 scripts/transform_legacy_export.py ~/Downloads/reswapposinfo -o legacy_transformed
```

This produces `legacy_transformed/{sellers.csv,intakes.csv,items.csv}` plus a
`transform_report.txt` summarizing counts, skips, repairs, and the manual-review
list. Review the report, then import the cleaned CSVs into SQLite with your
tool of choice (e.g. `sqlite3` `.import`, or a small loader script) **after
creating/activating the target event and deciding the commission rate** (§3.7).

### Import order (when you do import)

1. Ensure an active event exists; decide `commission_rate` (0.15 to match
   legacy totals, or keep 0.30 and accept that historical totals won't match new
   sales).
2. `sellers` → `intakes` → `items` (FK order). Fill `event_id` on sellers.
3. Verify counts: 741 sellers, 58–59 intakes, 1016 items.
4. Run `start.sh` once so the idempotent data-repair / migrations apply.

## 5. Open questions for the operator

- Commission rate: keep the legacy 15% (set event to 0.15) or adopt 30% and
  recompute intake totals?
- The 6 internal accounts mislabeled as individuals (§3.12) and the 2 vendors
  with no company (§3.13): reclassify, or import verbatim and fix in-app?
- Items with `quantity=0` (13) or `price=0` (4): drop, fix to 1, or import as-is?
- Should legacy IDs be preserved (current default) or remapped to new DB IDs?
- The 4 missing intakes (4032/4048/4063/4072, §3.24): recover the full export, or synthesize stub intakes from their items (seller + totals known)?