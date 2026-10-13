"""Renumber item codes to the numeric-only scheme (no alphanumeric codes).

One-time data migration (2026-10-12 user directive): every item whose code is
non-numeric gets a numeric code — the five-digit scheme from ``app.services.codes``
(10000, 10001, … 99999), unique within the database. Numeric codes are kept
as-is; non-numeric codes are filled with the free numbers, in item-id order
(older items get lower numbers). ``barcode_39`` stays in sync where it
duplicated the old code (mirrored at creation), so reports/labels/barcode
lookups that read either column stay consistent. A deliberately custom
barcode string is preserved untouched.

All updates are applied in ONE transaction — a failure mid-run changes nothing.

Uses stdlib ``sqlite3`` with parameterized statements (no ORM, no app imports),
so it runs on any database file, including the live one (WAL allows one
concurrent writer; the daemon is unaffected for reads).

Sales are unaffected: ``sale_item`` references ``item.id`` (FK), never the
code, and reports read ``item.code`` live at query time.

Caveat: labels ALREADY PRINTED with the old alphanumeric codes scan to codes
that no longer exist — items must be re-labeled before the event. (The label
print sets ``label_printed``; this script leaves that flag alone.)

Idempotent: run again → zero non-numeric rows remain → no-op.

Usage (any cwd; defaults to the repo's backend/swap.db):
    backend/.venv/bin/python backend/scripts/renumber_item_codes.py [--db PATH] [--dry-run]
"""

import argparse
import re
import sqlite3
import sys
from pathlib import Path

_NUMERIC_ITEM_START = 10000
_NUMERIC_ITEM_END = 99999
_digits = re.compile(r"^\d+$")

# Default database file lives next to the backend scripts' parent dir.
_DEFAULT_DB = Path(__file__).resolve().parents[1] / "swap.db"


def plan_renumber(db: sqlite3.Connection) -> list[tuple[int, str, str]]:
    """Items to renumber: [(item.id, old_code, new_code)], item-id order.

    Numeric codes are keepers; the free numbers of the 10000..99999 window go
    to every remaining item ascending, so targets never collide with each
    other or with surviving numeric codes.
    """
    rows = db.execute(
        "SELECT id, code FROM item ORDER BY id"
    ).fetchall()
    keepers = {code for (_, code) in rows if code and _digits.match(str(code))}

    free = [str(n) for n in range(_NUMERIC_ITEM_START, _NUMERIC_ITEM_END + 1)
            if str(n) not in keepers]

    changes: list[tuple[int, str, str]] = []
    for (it_id, code) in rows:
        code_str = code or ""
        if code_str and _digits.match(code_str):
            continue
        if not free:
            raise SystemExit("FATAL: numeric item-id range exhausted before this row")
        new_code = free.pop(0)
        changes.append((it_id, code_str, new_code))
    return changes


def renumber(db: sqlite3.Connection, dry_run: bool) -> int:
    """Apply the plan in one transaction; return the number of changed rows."""
    changes = plan_renumber(db)
    if not changes:
        return 0
    for it_id, old, new in changes:
        print(f"{'DRY' if dry_run else 'PLAN'}  item {it_id}: {old!r} -> {new}")
    if dry_run:
        return len(changes)
    # Parameterized updates (injection-safe by construction); one transaction.
    for it_id, old, new in changes:
        db.execute(
            "UPDATE item SET code = ?, barcode_39 = CASE "
            "WHEN barcode_39 IS NULL OR barcode_39 = '' OR barcode_39 = ? THEN ? "
            "ELSE barcode_39 END WHERE id = ?",
            (new, old, new, it_id),
        )
    db.commit()
    return len(changes)


def _int(code: str) -> int | None:
    """int() of a digit string, or None (guarded parse)."""
    try:
        return int(code)
    except ValueError:
        return None


def verify(db: sqlite3.Connection) -> None:
    """Post-run invariants; every violation aborts with a clear message."""
    ids = [i for (i,) in db.execute("SELECT id FROM item ORDER BY id").fetchall()]
    codes = [c for (c,) in db.execute("SELECT code FROM item").fetchall()]
    mirrored = db.execute(
        "SELECT COUNT(*) FROM item "
        "WHERE barcode_39 IS NOT NULL AND barcode_39 != '' AND barcode_39 != code"
    ).fetchone()[0]

    offenders = [(i, c) for (i, c) in zip(ids, codes)
                 if not (c and _digits.match(str(c)))]
    if offenders:
        raise SystemExit(f"VERIFY FAILED: non-numeric codes remain: {offenders[:10]}")

    dupes = [c for c in set(codes) if codes.count(c) > 1]
    if dupes:
        raise SystemExit(f"VERIFY FAILED: duplicate codes: {dupes[:10]}")

    below = [c for c in codes if (_v := _int(str(c))) is None or _v < _NUMERIC_ITEM_START]
    if below:
        raise SystemExit(f"VERIFY FAILED: codes outside {_NUMERIC_ITEM_START}+: {below[:10]}")

    outside = [i for (i, c) in zip(ids, codes) if (_v := _int(str(c))) is not None
               and _v > _NUMERIC_ITEM_END]
    if outside:
        raise SystemExit(f"VERIFY FAILED: item ids {outside} exceed {_NUMERIC_ITEM_END}")

    print(
        f"VERIFY: {len(codes)} items, codes {min(codes)}..{max(codes)} "
        f"numeric+unique ✓; barcode_39 != code (custom, preserved): {mirrored}"
    )


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Renumber non-numeric item codes to the 10000+ numeric scheme."
    )
    ap.add_argument("--db", default=str(_DEFAULT_DB),
                    help="SQLite file to migrate (default: backend/swap.db)")
    ap.add_argument("--dry-run", action="store_true", default=False)
    args = ap.parse_args()

    path = Path(args.db)
    if not path.is_absolute():
        path = _DEFAULT_DB.parent / path

    # Row factory: plain tuples; timeout guards against daemon write contention.
    db = sqlite3.connect(str(path), timeout=30)
    try:
        if args.dry_run:
            changes = plan_renumber(db)
            targets = [new for (_, _, new) in changes]
            nums = sorted(v for v in (_int(t) for t in targets) if v is not None)
            if len(set(targets)) != len(targets):
                raise SystemExit("PLAN FAILED: target codes are not unique")
            if nums and (nums[0] < _NUMERIC_ITEM_START or nums[-1] > _NUMERIC_ITEM_END):
                raise SystemExit("PLAN FAILED: targets outside the 10000..99999 range")
            for it_id, old, new in changes:
                print(f"DRY  item {it_id}: {old!r} -> {new}")
            print(f"DRY-RUN{' ' if changes else ': no'} would renumber {len(changes)} items"
                  + (f": {targets[0]}..{targets[-1]} (unique, in range ✓)" if changes else ""))
        else:
            changed = renumber(db, dry_run=False)
            if changed == 0:
                print("No non-numeric item codes — nothing to do.")
            verify(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()