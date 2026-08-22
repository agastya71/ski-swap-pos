#!/usr/bin/env python3
"""
Transform the legacy SwapSoft CSV exports into import-ready files for the
Ski Swap POS SQLite schema (backend/app/models/*.py).

This script ONLY reads the source CSVs and writes cleaned CSVs + a report to
an output directory. It does NOT open, connect to, or write to the SQLite
database. Importing the output is a separate, explicit step (see
docs/legacy-import-assessment.md §4).

Usage:
    python3 scripts/transform_legacy_export.py <source_dir> [-o <out_dir>]

Source dir should contain:
    Swap_SellerExport.csv, Swap_IntakeExport.csv, Swap_SellerItemsExport.csv
"""
import argparse
import csv
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime

# ---- helpers ----------------------------------------------------------------

def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def truthy(v):
    """Legacy boolean-ish → '1'/'0'. 'TRUE'/'Donate' → 1; 'FALSE'/'' → 0."""
    return "1" if str(v).strip().upper() in {"TRUE", "1", "DONATE", "YES", "Y"} else "0"


def norm_date(v):
    """M/D/YYYY → YYYY-MM-DD. Empty/invalid → '' (NULL)."""
    v = (v or "").strip()
    if not v:
        return ""
    for fmt in ("%m/%d/%Y", "%-m/%-d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(v, fmt).date().isoformat()
        except ValueError:
            continue
    return ""  # unparseable → NULL


def clean(v):
    return (v or "").strip()


def first_nonempty(*vals):
    for v in vals:
        if v and v.strip():
            return v.strip()
    return ""


# ---- transforms --------------------------------------------------------------

def transform_sellers(rows, report):
    out = []
    code_seen = Counter()
    # First pass to detect duplicate codes
    for r in rows:
        code_seen[clean(r["Code"])] += 1

    for r in rows:
        rid = clean(r["ID"])
        code = clean(r["Code"])
        is_vendor = truthy(r["Retailer"])

        # Disambiguate duplicate / empty codes.
        if not code:
            code = f"LEG-{rid}"
            report["seller_code_synthesized"].append(rid)
        elif code_seen[code] > 1:
            code = f"{code}_{rid}"
            report["seller_code_disambiguated"].append(rid)

        phone = first_nonempty(r.get("Mobile_Phone"), r.get("Home_Phone"), r.get("Business_Phone"))

        # Flag misclassifications for manual review (don't silently alter).
        first = clean(r["First_Name"])
        last = clean(r["Last_Name"])
        company = clean(r["Company"])
        if is_vendor == "0" and not first and not last and company:
            report["individual_no_name_with_company"].append(
                f"ID={rid} Company={company!r} Code={code}")
        if is_vendor == "1" and not company:
            report["vendor_no_company"].append(
                f"ID={rid} {first} {last}".strip())

        out.append({
            "id": rid,
            "event_id": "",  # filled at import (active event)
            "code": code,
            "first_name": first,
            "last_name": last,
            "company": company,
            "is_vendor": is_vendor,
            "email": clean(r["Email"]),
            "phone": phone,
            "address": clean(r["Address"]),
            "city": clean(r["City"]),
            "state": clean(r["State"]),
            "zip": clean(r["Zip"]),
            "donate_unsold_default": "0",
            "donate_proceeds_default": "0",
            "created_by": "legacy_import",
        })
    return out


def transform_intakes(rows, sellers_by_id, report):
    out = []
    for r in rows:
        rid = clean(r["ID"])
        seller_id = clean(r["Seller_ID"])
        seller_name = clean(r["Seller_Name"])

        # Malformed / column-shifted row: ID holds a name, Seller_ID holds a date.
        if not rid.isdigit():
            # Reconstruct from the known shifted layout (see assessment §3.10).
            # True: Seller_Name=<rid>, Date_Entered=<seller_id>, Date_Received=<Seller_Name>,
            #       Total=<Date_Entered>, MYSL_Total=<Date_Received>, Seller_Total=<Total>,
            #       Donate_Unsold=<MYSL_Total>, Donate_Proceeds=<Seller_Total>
            true_name = rid
            # Try to find the seller by name.
            sid = ""
            for sid_guess, s in sellers_by_id.items():
                full = f"{clean(s['First_Name'])} {clean(s['Last_Name'])}".strip()
                if full.lower() == true_name.lower():
                    sid = sid_guess
                    break
            report["intake_row_repaired"].append(
                f"legacy_ID={rid!r} -> seller_id={sid or 'NOT FOUND'} name={true_name!r}")
            if not sid:
                report["intake_row_skipped"].append(rid)
                continue
            out.append({
                "id": "",  # legacy intake ID unknown for this row
                "seller_id": sid,
                "date_entered": norm_date(r["Seller_ID"]),
                "date_received": norm_date(r["Seller_Name"]),
                "donate_unsold": truthy(r["MYSL_Total"]),
                "donate_proceeds": truthy(r["Seller_Total"]),
                "total": clean(r["Date_Entered"]),
                "mysl_total": clean(r["Date_Received"]),
                "seller_total": clean(r["Total"]),
                "created_by": "legacy_import",
            })
            continue

        if seller_id not in sellers_by_id:
            report["intake_orphan_seller"].append(f"intake {rid}: seller_id={seller_id} missing")

        total = clean(r["Total"])
        out.append({
            "id": rid,
            "seller_id": seller_id,
            "date_entered": norm_date(r["Date_Entered"]),
            "date_received": norm_date(r["Date_Received"]),
            "donate_unsold": truthy(r["Donate_Unsold"]),
            "donate_proceeds": truthy(r["Donate_Proceeds"]),
            "total": total,
            "mysl_total": clean(r["MYSL_Total"]),
            "seller_total": clean(r["Seller_Total"]),
            "created_by": "legacy_import",
        })
    return out


def transform_items(rows, intakes_by_id, report):
    out = []
    for r in rows:
        rid = clean(r["ID"])
        price = clean(r["Price"])
        qty = clean(r["Quantity"])
        year = clean(r["Year"])

        sale_id = clean(r["Sale_ID"])
        status = "sold" if sale_id and sale_id != "0" else "available"
        if sale_id and sale_id != "0":
            report["items_sold_present"].append(rid)  # none expected in this export

        if price == "0":
            report["items_price_zero"].append(rid)
        if qty == "0":
            report["items_quantity_zero"].append(rid)

        if clean(r["Intake_ID"]) not in intakes_by_id:
            report["item_orphan_intake"].append(f"item {rid}: intake_id={r['Intake_ID']}")

        out.append({
            "id": rid,
            "intake_id": clean(r["Intake_ID"]),
            "seller_id": clean(r["Seller_ID"]),
            "code": f"LEG-{rid}",  # synthesized; legacy Code is 100% empty
            "category": clean(r["Category"]),
            "brand": clean(r["Brand"]),
            "type": clean(r["Type"]),
            "description": clean(r["Description"]),
            "color": clean(r["Color"]),
            "size": clean(r["Size"]),
            "uom": clean(r["UOM"]),
            "gender_age": clean(r["Gender_Age"]),
            "year": "" if year in ("", "0") else year,  # 0 sentinel -> NULL
            "used": truthy(r["Used"]),
            "price": price,
            "quantity": qty,
            "barcode_39": clean(r["Barcode_39"]),
            "label_line_2": clean(r["Label_Line_2"]),
            "label_line_3": clean(r["Label_Line_3"]),
            "donate_unsold": truthy(r["DonateUnsold"]),
            "status": status,
            "label_printed": "0",
            "is_deleted": "0",
            "vendor_item_id": clean(r["Vendor_Item_ID"]),
            "created_by": "legacy_import",
        })
    return out


def write_csv(path, fieldnames, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in rows:
            w.writerow(row)


# ---- main -------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Transform legacy SwapSoft CSVs (no DB write).")
    ap.add_argument("src_dir", help="directory with Swap_*Export.csv files")
    ap.add_argument("-o", "--out", default="legacy_transformed", help="output directory")
    args = ap.parse_args()

    src = args.src_dir
    for name in ("Swap_SellerExport.csv", "Swap_IntakeExport.csv", "Swap_SellerItemsExport.csv"):
        if not os.path.exists(os.path.join(src, name)):
            sys.exit(f"missing {name} in {src}")

    sellers_in = read_csv(os.path.join(src, "Swap_SellerExport.csv"))
    intakes_in = read_csv(os.path.join(src, "Swap_IntakeExport.csv"))
    items_in = read_csv(os.path.join(src, "Swap_SellerItemsExport.csv"))

    sellers_by_id = {clean(r["ID"]): r for r in sellers_in}
    intakes_by_id = {clean(r["ID"]): r for r in intakes_in if clean(r["ID"]).isdigit()}

    report = {
        "seller_code_synthesized": [],
        "seller_code_disambiguated": [],
        "individual_no_name_with_company": [],
        "vendor_no_company": [],
        "intake_row_repaired": [],
        "intake_row_skipped": [],
        "intake_orphan_seller": [],
        "items_sold_present": [],
        "items_price_zero": [],
        "items_quantity_zero": [],
        "item_orphan_intake": [],
    }

    sellers = transform_sellers(sellers_in, report)
    intakes = transform_intakes(intakes_in, sellers_by_id, report)
    items = transform_items(items_in, intakes_by_id, report)

    os.makedirs(args.out, exist_ok=True)
    write_csv(os.path.join(args.out, "sellers.csv"),
              ["id", "event_id", "code", "first_name", "last_name", "company",
               "is_vendor", "email", "phone", "address", "city", "state", "zip",
               "donate_unsold_default", "donate_proceeds_default", "created_by"],
              sellers)
    write_csv(os.path.join(args.out, "intakes.csv"),
              ["id", "seller_id", "date_entered", "date_received",
               "donate_unsold", "donate_proceeds", "total", "mysl_total",
               "seller_total", "created_by"], intakes)
    write_csv(os.path.join(args.out, "items.csv"),
              ["id", "intake_id", "seller_id", "code", "category", "brand",
               "type", "description", "color", "size", "uom", "gender_age",
               "year", "used", "price", "quantity", "barcode_39",
               "label_line_2", "label_line_3", "donate_unsold", "status",
               "label_printed", "is_deleted", "vendor_item_id", "created_by"],
              items)

    # report
    with open(os.path.join(args.out, "transform_report.txt"), "w", encoding="utf-8") as f:
        f.write("Legacy export transform report (no DB was touched)\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"source: {src}\n")
        f.write(f"output: {args.out}\n\n")
        f.write(f"rows in  -> sellers={len(sellers_in)} intakes={len(intakes_in)} items={len(items_in)}\n")
        f.write(f"rows out -> sellers={len(sellers)} intakes={len(intakes)} items={len(items)}\n\n")

        # intake total vs item sum check
        ext = defaultdict(int)
        for r in items_in:
            try:
                ext[clean(r["Intake_ID"])] += int(r["Extended_Price"])
            except ValueError:
                pass
        f.write("intakes where Total != sum(item Extended_Price):\n")
        for r in intakes_in:
            rid = clean(r["ID"])
            if not rid.isdigit() or not r["Total"]:
                continue
            try:
                if int(r["Total"]) != ext.get(rid, 0):
                    f.write(f"  intake {rid}: Total={r['Total']} sum_ext={ext.get(rid,0)}\n")
            except ValueError:
                pass
        f.write("\n")

        # commission ratio check
        ratios = Counter()
        for r in intakes_in:
            try:
                if r["Total"] and float(r["Total"]) != 0:
                    ratios[round(float(r["MYSL_Total"]) / float(r["Total"]), 3)] += 1
            except ValueError:
                pass
        f.write(f"MYSL/Total commission ratios observed: {dict(ratios)}\n")
        f.write("(DB event default is 0.30; legacy totals imply 0.15 — see assessment §3.7)\n\n")

        for key, vals in report.items():
            f.write(f"{key}: {len(vals)}\n")
            for v in vals[:50]:
                f.write(f"  - {v}\n")
            if len(vals) > 50:
                f.write(f"  ... and {len(vals)-50} more\n")
            f.write("\n")

    print(f"wrote {len(sellers)} sellers, {len(intakes)} intakes, {len(items)} items -> {args.out}")
    print(f"report: {os.path.join(args.out, 'transform_report.txt')}")


if __name__ == "__main__":
    main()