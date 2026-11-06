"""Regression: numeric-looking worksheet cells must not gain float artifacts.

Spreadsheet text/float cells arrive verbatim (``"120.0"``, ``"55419.0"``); the
worksheet import stored them as-is, so the intake/admin item lists displayed
sizes and ZIPs like ``170.0`` / ``55419.0`` (user report 2026-11-02). Import
cells now normalize to the text the person sees: whole numbers drop the
``.0`` artifact, real decimals and leading-zero text pass through untouched.
"""

import io

import openpyxl


def _vendor_worksheet_bytes(zip_raw, size_rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.append(["Company", "Trailhead Ski Co."])
    labels = ["Last", "First", "Address", "City", "State", "Zip", "Phone 1", "Phone 2", "Email"]
    values = ["", "", "1 Main St", "Burlington", "VT", zip_raw, "8025551212", "", "x@y.com"]
    for label, value in zip(labels, values):
        ws.append([label, value])
    ws.append([None])
    ws.append(["Quantity", "Category", "Brand", "Description", "Size", "Sell Price"])
    for i, size in enumerate(size_rows):
        ws.append([1, "Skis", "Salomon", f"skis row {i}", size, 100])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_float_artifact_size_and_zip_normalize(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    data = _vendor_worksheet_bytes(
        zip_raw="55419.0",
        size_rows=["170.0", "179.5", "40 2/3", 120, "05419.0"],
    )
    r = client.post(
        "/items/import-worksheet",
        files={
            "file": (
                "vendor.xlsx",
                data,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["imported"] == 5, body["errors"]
    seller = next(
        s
        for s in client.get("/sellers", headers=headers).json()
        if s["code"] == body["seller_code"]
    )
    assert seller["zip"] == "55419"
    items = client.get(f"/intakes/{body['intake_id']}", headers=headers).json()["items"]
    sizes = [it["size"] for it in items]
    assert sizes == ["170", "179.5", "40 2/3", "120", "05419"], sizes


def test_numeric_zip_and_size_cells_still_clean(client, active_event, admin_token):
    """Numeric cells (int or float from any producer) also normalize cleanly."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    data = _vendor_worksheet_bytes(zip_raw=55419.0, size_rows=[150.0, 179.5])
    r = client.post(
        "/items/import-worksheet",
        files={
            "file": (
                "vendor.xlsx",
                data,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    seller = next(
        s
        for s in client.get("/sellers", headers=headers).json()
        if s["code"] == body["seller_code"]
    )
    assert seller["zip"] == "55419"
    items = client.get(f"/intakes/{body['intake_id']}", headers=headers).json()["items"]
    assert [it["size"] for it in items] == ["150", "179.5"]


def test_cell_text_helper():
    from app.services.item_import import _cell_text

    assert _cell_text("55419.0") == "55419"          # float artifact → plain digits
    assert _cell_text("05419.0") == "05419"          # leading zero preserved
    assert _cell_text("179.5") == "179.5"            # real decimal untouched
    assert _cell_text("40 2/3") == "40 2/3"          # non-numeric verbatim
    assert _cell_text("140cm") == "140cm"            # unit suffix verbatim
    assert _cell_text(120.0) == "120"                # float cell — whole number
    assert _cell_text(179.5) == "179.5"              # float cell — decimal kept
    assert _cell_text(170) == "170"
    assert _cell_text("  170.0  ") == "170"
    assert _cell_text("  ") is None
    assert _cell_text(None) is None
    assert _cell_text("170.00") == "170"             # any number of trailing zeros
    assert _cell_text("-5.0") == "-5"
    assert _cell_text(True) == "True"                # booleans untouched (legacy behavior)
    assert _cell_text("") is None