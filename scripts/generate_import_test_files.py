#!/usr/bin/env python3
"""Generate synthetic item-import test files for the intake import workflow.

Uses the official template (12 columns: Description, Category, Brand, Type,
Color, Size, Gender/Age, Year, Price, Used, Donate if Unsold, Quantity) as the
base so the header/format always matches what `item_import.parse_upload`
expects, and writes several variant workbooks for manual testing:

  1. small-batch      — a normal, small intake (single quantities)
  2. multi-quantity   — size-run / bulk rows with quantities 1..25
  3. all-fields       — every column populated, incl. case variants that
                        exercise category/type canonicalization
  4. edge-cases       — boundary-VALID rows (cents pricing -> ceil, price 0,
                        blank quantity, Used=no, blank Donate, fuzzy brand)
  5. with-errors      — good rows mixed with intentionally INVALID rows to
                        exercise the per-row error report

All rows in files 1-4 are expected to import cleanly; file 5's expected
import/error split is printed at generation time.

Usage:
    backend/.venv/bin/python scripts/generate_import_test_files.py \
        [--template ~/Downloads/import-template.xlsx] [--out-dir ~/Downloads]
"""

import argparse
from pathlib import Path

import openpyxl

DEFAULT_TEMPLATE = Path.home() / "Downloads" / "import-template.xlsx"
DEFAULT_OUT_DIR = Path.home() / "Downloads"

Row = tuple  # 12-tuple matching the template columns

# ── data ──────────────────────────────────────────────────────────────────────

SMALL_BATCH: list[Row] = [
    ("Alpine skis w/ bindings", "Skis", "Rossignol", "Alpine Ski", "Red", "140cm", "Kids'", 2018, 75, "Yes", None, 1),
    ("Ski boots mondo 22.5", "Boots", "Salomon", "Alpine Boot", "Black", "22.5", "Kids'", 2019, 40, "Yes", None, 1),
    ("Ski poles 100cm", "Poles", "Fischer", "Poles", "Blue", "100cm", "Kids'", None, 10, "Yes", None, 1),
    ("Ski helmet", "Helmet", "Giro", "Helmet", "White", "S", "Kids'", 2021, 25, "Yes", None, 1),
    ("Goggles", "Goggles", "Oakley", "Goggles", None, "One Size", "Unisex", 2022, 30, "Yes", None, 1),
    ("Snowboard boots", "Boots", "Burton", "Snowboard Boot", "Gray", "8", "Men's", 2017, 35, "Yes", None, 1),
]

MULTI_QUANTITY: list[Row] = [
    ("Nordic skis waxless 150cm", "Nordic Skis", "Fischer", "Nordic Ski", "White", "150cm", "Unisex", 2016, 30, "Yes", None, 1),
    ("Nordic skis waxless 160cm", "Nordic Skis", "Fischer", "Nordic Ski", "White", "160cm", "Unisex", 2016, 30, "Yes", None, 2),
    ("Nordic poles 120cm", "Poles", "Fischer", "Poles", None, "120cm", "Kids'", None, 8, "Yes", None, 3),
    ("Nordic boots size 35", "Boots", "Alpina", "Nordic Boot", "Black", "35", "Kids'", None, 15, "Yes", None, None),  # blank qty -> 1
    ("Alpine skis w/ bindings 110cm", "Skis", "Atomic", "Alpine Ski", "Blue", "110cm", "Kids'", 2015, 45, "Yes", None, 5),
    ("Alpine skis w/ bindings 120cm", "Skis", "Atomic", "Alpine Ski", "Blue", "120cm", "Kids'", 2015, 45, "Yes", None, 8),
    ("Ski helmets assorted", "Helmet", "Giro", "Helmet", "Assorted", "Assorted", "Kids'", None, 20, "Yes", "No", 10),
    ("Snowboard boots used rental fleet", "Boots", "Burton", "Snowboard Boot", "Black", "Assorted", "Kids'", 2014, 18, "Yes", None, 25),
]

ALL_FIELDS: list[Row] = [
    ("Powder skis 178cm", "skis", "ROSSIGNOL", "alpine ski", "Yellow", "178cm", "Men's", 2020, 250, "Yes", "No", 1),
    ("All-mountain skis 165cm", "SKIS", "atomic", "ALPINE SKI", "Green", "165cm", "Women's", 2021, 180, "Yes", "Yes", 1),
    ("Race GS skis 155cm", "Skis", "Head", "Alpine Ski", None, "155cm", "Unisex", 2019, 300, "Yes", None, 1),
    ("Snowboard 152cm", "Snowboards", "Burton", "snowboard", "Multi", "152cm", "Men's", 2018, 140, "Yes", "No", 1),
    ("Snowboard bindings", "Bindings", "Burton", "binding", "Black", "M", "Unisex", 2018, 60, "Yes", None, 2),
    ("Hockey skates", "Skates", "Bauer", "hockey skate", "Black", "9", "Men's", 2017, 50, "Yes", "No", 1),
    ("Ski boots mondo 26.5", "BOOTS", "Nordica", "alpine boot", "Orange", "26.5", "Men's", 2020, 120, "Yes", None, 1),
    ("Kids ski boots 18.5", "boots", "Tecnica", "alpine boot", "Pink", "18.5", "Kids'", 2022, 45, "No", "No", 1),  # new w/ tags
    ("Vintage leather ski boots", "Boots", "Hanson", "alpine boot", "Brown", "7", "Men's", 1985, 15, "Yes", "Yes", 1),
    ("Wax kit + iron", "Accessories", "Swix", "accessory", None, "One Size", "Unisex", 2010, 25, "Yes", None, 1),
]

EDGE_CASES: list[Row] = [
    # cents price -> rounded UP to whole dollars (129.99 -> 130)
    ("All-mountain skis w/ bindings (cents price)", "Skis", "Blizzard", "Alpine Ski", "Red", "170cm", "Men's", 2019, 129.99, "Yes", None, 1),
    # sub-dollar price -> ceil to 1
    ("Bargain poles (49 cents)", "Poles", "Generic", "Poles", None, "110cm", "Unisex", None, 0.49, "Yes", None, 1),
    # zero price allowed (>= 0) — free/giveaway item
    ("Free ski bag (giveaway)", "Accessories", "Generic", "bag", None, "One Size", "Unisex", None, 0, "Yes", "Yes", 1),
    # blank quantity -> defaults to 1
    ("Ski boots (blank qty)", "Boots", "Lange", "Alpine Boot", "Black", "25.0", "Men's", 2018, 90, "Yes", None, None),
    # Used = "no" -> brand-new item (used False)
    ("New goggles w/ tags", "Goggles", "Smith", "Goggles", "Blue", "One Size", "Unisex", 2024, 55, "No", None, 2),
    # blank Donate -> inherits the intake's donate_unsold election
    ("Ski gloves (donate inherits intake)", "Accessories", "Swix", "accessory", "Black", "M", "Unisex", None, 12, "Yes", None, 1),
    # fuzzy brand: 1 edit away from "Rossignol" -> closest-matched when Rossignol exists in the event
    ("Alpine skis (fuzzy brand)", "Skis", "Rossignl", "Alpine Ski", "White", "155cm", "Women's", 2016, 95, "Yes", None, 1),
    # unicode + long description
    ("Bøgren all-mountain skis — tuned & waxed, edges freshly ground, minor top-sheet scratches near the tail", "Skis", "Völkl", "Alpine Ski", "Orange", "163cm", "Men's", 2017, 150, "Yes", None, 1),
    # exact duplicate of a previous row -> imports as its own item code
    ("Ski boots (blank qty)", "Boots", "Lange", "Alpine Boot", "Black", "25.0", "Men's", 2018, 90, "Yes", None, None),
]

# File 5: (row_values_or_None, expected_outcome) — None field = leave blank.
# Expected: rows 2 and 11 import; rows 3-10 are each rejected with a per-row
# error in the import result report.
WITH_ERRORS: list[tuple[Row | None, str]] = [
    (("Good skis — imports fine", "Skis", "Rossignol", "Alpine Ski", None, "160cm", "Men's", 2018, 100, "Yes", None, 1), "IMPORTED"),
    (None, "ERROR: missing Description"),
    (None, "ERROR: missing Price"),
    (None, "ERROR: missing Brand"),
    (("Quantity not a number", "Skis", "Atomic", "Alpine Ski", None, "150cm", None, None, 50, "Yes", None, "two"), "ERROR: Invalid Quantity"),
    (("Negative quantity", "Skis", "Atomic", "Alpine Ski", None, "150cm", None, None, 50, "Yes", None, -3), "ERROR: Invalid Quantity"),
    (("Zero quantity", "Skis", "Atomic", "Alpine Ski", None, "150cm", None, None, 50, "Yes", None, 0), "ERROR: Invalid Quantity"),
    (("Price not a number", "Skis", "K2", "Alpine Ski", None, "150cm", None, None, "free", "Yes", None, 1), "ERROR: Invalid Price"),
    (("Negative price", "Skis", "K2", "Alpine Ski", None, "150cm", None, None, -10, "Yes", None, 1), "ERROR: Invalid Price"),
    (("Good boots — also imports", "Boots", "Salomon", "Alpine Boot", None, "27.5", "Men's", 2019, 80, "Yes", None, 1), "IMPORTED"),
]


def _row(desc, category, brand, type_, color, size, gender, year, price, used, donate, qty):
    """Build a 12-tuple, substituting None for blank slots (error-file helper)."""
    return (desc, category, brand, type_, color, size, gender, year, price, used, donate, qty)


# ── generation ────────────────────────────────────────────────────────────────

def write_variant(template: Path, out_path: Path, rows: list[Row]) -> None:
    """Copy the template (header + format) and append the given data rows."""
    wb = openpyxl.load_workbook(template)
    ws = wb.active
    if ws is None:
        raise SystemExit(f"Template {template} has no active sheet")
    if ws.max_row > 1:
        ws.delete_rows(2, ws.max_row - 1)  # drop any stray data rows
    for row in rows:
        if len(row) != 12:
            raise ValueError(f"row must have 12 columns: {row!r}")
        ws.append(list(row))
    wb.save(out_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", type=Path, default=DEFAULT_TEMPLATE,
                        help="Base template (default: %(default)s)")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR,
                        help="Where to write the test files (default: %(default)s)")
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    variants: dict[str, list[Row]] = {
        "import-test-1-small-batch.xlsx": SMALL_BATCH,
        "import-test-2-multi-quantity.xlsx": MULTI_QUANTITY,
        "import-test-3-all-fields.xlsx": ALL_FIELDS,
        "import-test-4-edge-cases.xlsx": EDGE_CASES,
    }

    for name, rows in variants.items():
        out = args.out_dir / name
        write_variant(args.template, out, rows)
        print(f"wrote {out}  ({len(rows)} data rows)")

    # Error-report variant: None fields are left blank; errors are intentional.
    err_rows: list[Row] = []
    for values, _expected in WITH_ERRORS:
        if values is None:
            blank = _row(None, None, None, None, None, None, None, None, None, None, None, None)
            if len(err_rows) == 1:  # row 3: missing Description (everything else valid)
                blank = _row(None, "Skis", "Rossignol", "Alpine Ski", None, "160cm", "Men's", 2018, 100, "Yes", None, 1)
            elif len(err_rows) == 2:  # row 4: missing Price
                blank = _row("Skis with no price", "Skis", "Rossignol", "Alpine Ski", None, "160cm", "Men's", 2018, None, "Yes", None, 1)
            elif len(err_rows) == 3:  # row 5: missing Brand
                blank = _row("Skis with no brand", "Skis", None, "Alpine Ski", None, "160cm", "Men's", 2018, 100, "Yes", None, 1)
            err_rows.append(blank)
        else:
            err_rows.append(values)
    out = args.out_dir / "import-test-5-with-errors.xlsx"
    write_variant(args.template, out, err_rows)
    imported = sum(1 for _, e in WITH_ERRORS if e == "IMPORTED")
    print(f"wrote {out}  ({len(err_rows)} data rows; expect {imported} imported, "
          f"{len(err_rows) - imported} row errors: rows 3-10 of the sheet)")

    print(f"\nBase template: {args.template}")
    print("Import via: Intake module → open an intake → Import Items (xlsx upload).")


if __name__ == "__main__":
    main()