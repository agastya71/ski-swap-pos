"""Fix float-artifact text values stored from worksheet imports.

One-time data repair (2026-11-02 user report): worksheet cells that arrived as
whole-number float artifacts (``"170.0"``, ``"55419.0"``) were stored verbatim,
so the intake/admin item lists displayed sizes and ZIPs like ``170.0``. The
import path now normalizes at the boundary (item_import._cell_text); this
script repairs rows saved BEFORE that change.

Normalized: ``item.size`` and ``seller.zip`` where the value is a pure
whole-number float artifact (``^-?\\d+\\.0+$`` → int part). Anything else
passes untouched: "179.5" (real decimal), "40 2/3" or "140cm" (non-numeric),
"05419" (leading zero — zip "05419.0" becomes "05419", never "5419").

All updates are applied per database in ONE transaction — a failure mid-run
changes nothing. Uses stdlib ``sqlite3`` with parameterized statements (no ORM,
no app imports), so it runs on any database file, including the live one (WAL
allows one concurrent writer; the daemon is unaffected for reads).

Caveat: if labels were already printed with a ``.0`` size on them, the label
itself still shows the artifact — reprint those (label_printed rows are
unaffected by this script).

Idempotent: run again → zero matching rows remain → no-op.

Usage (any cwd):
    backend/.venv/bin/python backend/scripts/fix_float_text_fields.py [--dry-run]
"""

import argparse
import re
import sqlite3
import sys
from pathlib import Path

_FLOAT_ARTIFACT = re.compile(r"^-?\d+\.0+$")

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_TARGETS = [_BACKEND_DIR / "swap.db", *_BACKEND_DIR.glob("events/*.db")]


def _normalize(value) -> str | None:
    if value is None or not isinstance(value, str):
        return None
    if not _FLOAT_ARTIFACT.fullmatch(value):
        return None
    return value[: value.index(".")]


def fix_db(path: Path, dry_run: bool) -> tuple[int, int]:
    con = sqlite3.connect(f"file:{path}?mode=rw", uri=True, timeout=15)
    cur = con.cursor()
    changes = 0
    for table, column in (("item", "size"), ("seller", "zip")):
        try:
            rows = cur.execute(
                f"SELECT id, {column} FROM {table} WHERE {column} IS NOT NULL"
            ).fetchall()
        except sqlite3.OperationalError as exc:
            print(f"  skip {table} in {path.name}: {exc}")
            continue
        pairs = [(rid, _normalize(val)) for rid, val in rows]
        pairs = [(rid, new) for rid, new in pairs if new is not None]
        table_changes = 0
        for rid, new in pairs:
            if dry_run:
                print(f"  would fix {path.name} {table} id={rid} → {new!r}")
            else:
                cur.execute(
                    f"UPDATE {table} SET {column} = ? WHERE id = ?",
                    (new, rid),
                )
            table_changes += 1
        changes += table_changes
        print(f"  {path.name} {table}.{column}: {table_changes} row(s)")
    if not dry_run:
        con.commit()
    con.close()
    return changes, 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Strip float artifacts from item.size / seller.zip.")
    ap.add_argument("--dry-run", action="store_true", help="report without updating")
    args = ap.parse_args()
    total = 0
    for path in _TARGETS:
        if not path.exists():
            continue
        total += fix_db(path, args.dry_run)[0]
    if total == 0:
        print("No float-artifact values found — nothing to do.")
    return 0


if __name__ == "__main__":
    sys.exit(main())