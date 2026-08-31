import datetime
import pytest
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller
from tests.helpers import valid_seller_create


@pytest.fixture
def seller(db, active_event):
    s = Seller(
        event_id=active_event.id,
        code="ABC",
        first_name="Jane",
        last_name="Smith",
        is_vendor=False,
        created_by="admin",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture
def intake(db, seller):
    i = Intake(
        seller_id=seller.id,
        date_entered=datetime.date.today(),
        donate_unsold=False,
        donate_proceeds=False,
        created_by="admin",
    )
    db.add(i)
    db.commit()
    db.refresh(i)
    return i


@pytest.fixture
def item(db, intake, seller):
    it = Item(
        intake_id=intake.id,
        seller_id=seller.id,
        code="ABC-001",
        price=25.00,
        status="available",
        label_printed=False,
        created_by="admin",
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


def test_add_item_to_intake(client, admin_token, intake):
    resp = client.post(
        f"/intakes/{intake.id}/items",
        json={"price": 25.00, "description": "Ski boots size 8", "category": "boots", "brand": "Salomon"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["code"].endswith("-01")
    assert data["price"] == 25.00
    assert data["status"] == "available"
    assert data["label_printed"] is False


def test_get_item(client, admin_token, item):
    resp = client.get(f"/items/{item.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["code"] == "ABC-001"


def test_get_item_not_found(client, admin_token):
    resp = client.get("/items/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 404


def test_update_item(client, admin_token, item):
    resp = client.patch(
        f"/items/{item.id}",
        json={"price": 30.00, "description": "Updated desc"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["price"] == 30.00


def test_delete_item(client, admin_token, item):
    resp = client.delete(f"/items/{item.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 204


def test_delete_item_after_label_printed_returns_409(client, admin_token, db, item):
    item.label_printed = True
    db.commit()
    resp = client.delete(f"/items/{item.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 409


def test_delete_item_not_found(client, admin_token):
    resp = client.delete("/items/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 404


def test_get_intake_includes_items(client, admin_token, intake, item):
    resp = client.get(f"/intakes/{intake.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert len(data["items"]) == 1
    assert data["items"][0]["code"] == "ABC-001"


def test_cashier_cannot_add_item(client, cashier_token, intake):
    resp = client.post(
        f"/intakes/{intake.id}/items",
        json={"price": 5.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


# ── Lookup tests ──────────────────────────────────────────────────────────────

def test_lookup_item_by_code(client, cashier_token, active_event, item, seller):
    resp = client.get(
        f"/items/lookup?code={item.code}",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == item.code
    assert data["seller_code"] == seller.code
    assert data["status"] == "available"


def test_lookup_item_not_found(client, cashier_token, active_event):
    resp = client.get(
        "/items/lookup?code=DOESNOTEXIST",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 404


def test_lookup_sold_item_returns_200_with_status(client, db, cashier_token, active_event, item):
    item.status = "sold"
    db.commit()
    resp = client.get(
        f"/items/lookup?code={item.code}",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "sold"


def test_lookup_intake_role_forbidden(client, intake_token, active_event, item):
    resp = client.get(
        f"/items/lookup?code={item.code}",
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403


def test_lookup_no_active_event(client, db, cashier_token):
    from app.models.event import Event
    db.query(Event).update({"is_active": False})
    db.commit()
    resp = client.get(
        "/items/lookup?code=ABC-001",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 503


# ── Search tests ──────────────────────────────────────────────────────────────

def test_search_items_by_description(client, active_event, admin_token):
    """GET /items/search?q= matches item description."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    client.post(
        f"/intakes/{intake_r.json()['id']}/items",
        json={"description": "Atomic skis 160cm", "brand": "Atomic", "price": 120.0},
        headers=headers,
    )
    r = client.get("/items/search?q=atomic", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert "Atomic" in r.json()[0]["description"]


def test_search_items_by_brand(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    client.post(
        f"/intakes/{intake_r.json()['id']}/items",
        json={"brand": "Rossignol", "price": 80.0},
        headers=headers,
    )
    r = client.get("/items/search?q=rossig", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_search_items_by_seller_code(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    seller_code = seller_r.json()["code"]
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    client.post(f"/intakes/{intake_r.json()['id']}/items", json={"description": "Skis", "brand": "Atomic", "price": 30.0}, headers=headers)
    r = client.get(f"/items/search?q={seller_code}", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1


# ── soft delete + quantity model (Phase 3) ────────────────────────────────────

def test_soft_delete_excludes_from_get_lookup_and_list(client, admin_token, intake, seller, item):
    """DELETE soft-deletes; item is then 404 on get/lookup and absent from seller items."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    # Before delete: lookup works
    r = client.get(f"/items/lookup?code={item.code}", headers=headers)
    assert r.status_code == 200
    # Delete
    d = client.delete(f"/items/{item.id}", headers=headers)
    assert d.status_code == 204
    # After delete: get -> 404, lookup -> 404, not in seller items
    assert client.get(f"/items/{item.id}", headers=headers).status_code == 404
    assert client.get(f"/items/lookup?code={item.code}", headers=headers).status_code == 404
    listed = client.get(f"/sellers/{seller.id}/items", headers=headers).json()
    assert all(it["id"] != item.id for it in listed)


def test_delete_sold_item_returns_409(client, admin_token, db, item):
    item.status = "sold"
    item.quantity = 0.0
    db.commit()
    resp = client.delete(f"/items/{item.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 409


def test_adjust_quantity_increase_by_difference(client, admin_token, db, intake, seller):
    from app.models.item import Item
    it = Item(intake_id=intake.id, seller_id=seller.id, code="Q-001", price=10.00,
              quantity=5.0, remaining=5.0, status="available", label_printed=False, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    # current remaining 5, add 3 -> remaining 8 (intake quantity stays 5)
    r = client.patch(f"/items/{it.id}/quantity", json={"adjustment": 3},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["remaining"] == 8.0
    assert r.json()["quantity"] == 5.0


def test_adjust_quantity_decrease_to_total_equals_sold_ok(client, cashier_token, admin_token, db, active_event, intake, seller):
    """Reduce remaining to 0 (total == sold) is allowed."""
    from app.models.item import Item
    it = Item(intake_id=intake.id, seller_id=seller.id, code="Q-004", price=10.00,
              quantity=5.0, remaining=5.0, status="available", label_printed=False, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    # sell 3 -> remaining 2 (intake quantity stays 5)
    client.post("/sales", json={"items": [{"item_id": it.id, "quantity": 3}], "cash_amount": 30.00},
                headers={"Authorization": f"Bearer {cashier_token}"})
    db.refresh(it)
    assert it.quantity == 5.0
    assert it.remaining == 2.0
    # decrease remaining by 2 -> remaining 0 -> allowed
    r = client.patch(f"/items/{it.id}/quantity", json={"adjustment": -2},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["remaining"] == 0.0


def test_adjust_quantity_decrease_below_zero_422(client, cashier_token, admin_token, db, active_event, intake, seller):
    """Reducing remaining below 0 (total < sold) is rejected."""
    from app.models.item import Item
    it = Item(intake_id=intake.id, seller_id=seller.id, code="Q-005", price=10.00,
              quantity=5.0, remaining=5.0, status="available", label_printed=False, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    client.post("/sales", json={"items": [{"item_id": it.id, "quantity": 3}], "cash_amount": 30.00},
                headers={"Authorization": f"Bearer {cashier_token}"})
    db.refresh(it)
    assert it.remaining == 2.0
    # decrease remaining by 3 -> -1 -> 422
    r = client.patch(f"/items/{it.id}/quantity", json={"adjustment": -3},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 422


# ── brand required + brand endpoint + import formats (Phase 5) ────────────────

def test_add_item_requires_brand(client, admin_token, intake):
    """POST /intakes/{id}/items rejects an item without a brand (422)."""
    resp = client.post(
        f"/intakes/{intake.id}/items",
        json={"price": 25.00, "description": "No brand"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


def test_list_brands_returns_distinct(client, active_event, admin_token):
    """GET /items/brands returns distinct brands for the active event."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    iid = intake_r.json()["id"]
    for brand in ("Atomic", "Atomic", "Salomon"):
        client.post(f"/intakes/{iid}/items",
                    json={"description": "x", "brand": brand, "price": 10.0}, headers=headers)
    r = client.get("/items/brands", headers=headers)
    assert r.status_code == 200
    brands = r.json()
    assert sorted(brands) == ["Atomic", "Salomon"]


def test_import_items_from_csv(client, active_event, admin_token):
    """Import supports CSV (not just xlsx)."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    csv_text = "Description,Category,Brand,Type,Color,Size,Gender/Age,Year,Price,Used,Donate if Unsold\n"
    csv_text += "Skis,Skis,Atomic,Alpine,Red,170,Men,2020,110.0,Yes,No\n"
    csv_text += "Boots,Boots,Salomon,,,26.5,,None,60.0,Yes,No\n"
    r = client.post(
        f"/intakes/{intake_r.json()['id']}/items/import",
        files={"file": ("items.csv", csv_text.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["imported"] == 2
    assert r.json()["skipped"] == 0


def test_import_brand_closest_match(client, active_event, admin_token):
    """Import replaces a near-miss brand with the closest existing brand."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    iid = intake_r.json()["id"]
    # Seed an existing brand "Rossignol"
    client.post(f"/intakes/{iid}/items",
                json={"description": "seed", "brand": "Rossignol", "price": 10.0}, headers=headers)
    # Import a row with a near-miss brand "Rossignnol" -> should be matched to "Rossignol"
    csv_text = "Description,Category,Brand,Type,Color,Size,Gender/Age,Year,Price,Used,Donate if Unsold\n"
    csv_text += "Skis,Skis,Rossignnol,Alpine,Red,170,Men,2020,110.0,Yes,No\n"
    r = client.post(
        f"/intakes/{iid}/items/import",
        files={"file": ("items.csv", csv_text.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["imported"] == 1
    listed = client.get(f"/sellers/{seller_r.json()['id']}/items", headers=headers).json()
    brands = [it["brand"] for it in listed]
    assert "Rossignol" in brands
    assert "Rossignnol" not in brands


def test_import_skips_rows_missing_brand(client, active_event, admin_token):
    """Import reports a row missing a brand as an error (brand is required)."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    csv_text = "Description,Category,Brand,Type,Color,Size,Gender/Age,Year,Price,Used,Donate if Unsold\n"
    csv_text += "Good row,Skis,Atomic,Alpine,Red,170,Men,2020,110.0,Yes,No\n"
    csv_text += "No brand,Skis,,,Red,170,Men,2020,90.0,Yes,No\n"
    r = client.post(
        f"/intakes/{intake_r.json()['id']}/items/import",
        files={"file": ("items.csv", csv_text.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["imported"] == 1
    assert body["skipped"] == 1
    assert body["errors"][0]["row"] == 3


def test_import_inherits_donate_unsold_from_intake_when_blank(client, db, active_event, admin_token):
    """A import row with a blank 'Donate if Unsold' cell inherits the intake's flag."""
    from app.models.seller import Seller
    from app.models.intake import Intake
    headers = {"Authorization": f"Bearer {admin_token}"}
    # Seller + intake with donate_unsold=True
    s = Seller(event_id=active_event.id, code="IMP", first_name="I", last_name="M",
               is_vendor=False, donate_unsold_default=True, created_by="admin")
    db.add(s); db.commit(); db.refresh(s)
    intake = Intake(seller_id=s.id, donate_unsold=True, donate_proceeds=False, created_by="admin")
    db.add(intake); db.commit(); db.refresh(intake)
    # Row with brand but blank Donate column
    csv_text = "Description,Category,Brand,Type,Color,Size,Gender/Age,Year,Price,Used,Donate if Unsold\n"
    csv_text += "Skis,Skis,Atomic,Alpine,Red,170,Men,2020,110.0,Yes,\n"
    r = client.post(f"/intakes/{intake.id}/items/import",
                    files={"file": ("items.csv", csv_text.encode("utf-8"), "text/csv")},
                    headers=headers)
    assert r.status_code == 200
    assert r.json()["imported"] == 1
    listed = client.get(f"/sellers/{s.id}/items", headers=headers).json()
    assert listed[0]["donate_unsold"] is True


def _post_import(client, intake_id, headers, csv_text):
    return client.post(
        f"/intakes/{intake_id}/items/import",
        files={"file": ("items.csv", csv_text.encode("utf-8"), "text/csv")},
        headers=headers,
    )


def test_import_quantity_column(client, active_event, admin_token):
    """Import supports the 12th Quantity column (blank = 1, integer >= 1)."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    iid = seller_r and client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers).json()["id"]
    csv_text = (
        "Description,Category,Brand,Type,Color,Size,Gender/Age,Year,Price,Used,Donate if Unsold,Quantity\n"
        "Skis,Skis,Atomic,Alpine,Red,170,Men,2020,110.0,Yes,No,3\n"
        "Gloves,Clothing,Dakine,Gloves,,,L,,25.0,Yes,No,\n"  # blank quantity -> 1
                                                                # old 11-col row below is still valid
    )
    resp = _post_import(client, iid, headers, csv_text)
    assert resp.status_code == 200
    assert resp.json()["imported"] == 2
    listed = client.get(f"/sellers/{seller_r.json()['id']}/items", headers=headers).json()
    by_desc = {it["description"]: it["quantity"] for it in listed}
    assert by_desc["Skis"] == 3
    assert by_desc["Gloves"] == 1


def test_import_rejects_invalid_quantity(client, active_event, admin_token):
    """Import reports a row with a non-integer or <1 Quantity as an error."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    iid = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers).json()["id"]
    csv_text = (
        "Description,Category,Brand,Type,Color,Size,Gender/Age,Year,Price,Used,Donate if Unsold,Quantity\n"
        "Bad qty,Skis,Atomic,Alpine,,,170,,110.0,Yes,No,2.5\n"
        "Zero qty,Skis,Atomic,Alpine,,,170,,110.0,Yes,No,0\n"
    )
    resp = _post_import(client, iid, headers, csv_text)
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 0
    assert body["skipped"] == 2
    assert all("Quantity" in e["reason"] for e in body["errors"])


def test_import_keeps_old_11_column_template_working(client, active_event, admin_token):
    """Rows from the older 11-column template (no Quantity column) still import."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    iid = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers).json()["id"]
    csv_text = "Description,Category,Brand,Type,Color,Size,Gender/Age,Year,Price,Used,Donate if Unsold\n"
    csv_text += "Skis,Skis,Atomic,Alpine,Red,170,Men,2020,110.0,Yes,No\n"
    resp = _post_import(client, iid, headers, csv_text)
    assert resp.status_code == 200
    assert resp.json()["imported"] == 1
    listed = client.get(f"/sellers/{seller_r.json()['id']}/items", headers=headers).json()
    assert listed[0]["quantity"] == 1


def test_import_normalizes_category_and_type_case(client, active_event, admin_token):
    """Category/Type typed with any capitalization normalize to canonical casing;
    unknown values are stored as typed (never rejected)."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    iid = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers).json()["id"]
    csv_text = (
        "Description,Category,Brand,Type,Color,Size,Gender/Age,Year,Price,Used,Donate if Unsold,Quantity\n"
        "Skis,skis,Atomic,alpine ski,Red,170,Men,2020,110.0,Yes,No,\n"
        "Jacket,clothing,Patagonia,JACKET,,,M,,60.0,Yes,No,\n"
        "Weird,skis  special,BrandX,whatever,,,,,10.0,Yes,No,\n"
    )
    resp = _post_import(client, iid, headers, csv_text)
    assert resp.status_code == 200
    assert resp.json()["imported"] == 3
    listed = client.get(f"/sellers/{seller_r.json()['id']}/items", headers=headers).json()
    by_desc = {it["description"]: (it["category"], it["type"]) for it in listed}
    assert by_desc["Skis"] == ("Skis", "Alpine Ski")
    assert by_desc["Jacket"] == ("Clothing", "Jacket")
    assert by_desc["Weird"] == ("skis  special", "whatever")


def test_list_brands_filters_by_category(client, active_event, admin_token):
    """GET /items/brands?category= returns only brands assigned to that category."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    iid = intake_r.json()["id"]
    client.post(f"/intakes/{iid}/items",
                json={"description": "skis", "brand": "Atomic", "category": "Skis", "price": 10.0}, headers=headers)
    client.post(f"/intakes/{iid}/items",
                json={"description": "jacket", "brand": "Patagonia", "category": "Clothing", "price": 40.0}, headers=headers)
    r = client.get("/items/brands?category=Skis", headers=headers)
    assert r.status_code == 200
    assert r.json() == ["Atomic"]
    r_all = client.get("/items/brands", headers=headers)
    assert sorted(r_all.json()) == ["Atomic", "Patagonia"]


def test_import_rounds_price_up_to_whole_dollar(client, active_event, admin_token):
    """Bulk intake rounds prices UP to the nearest whole dollar (whole-dollar
    pricing decision): 24.0 stays 24, 24.5 → 25, 0.25 → 1."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    iid = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers).json()["id"]
    csv_text = (
        "Description,Category,Brand,Type,Color,Size,Gender/Age,Year,Price,Used,Donate if Unsold,Quantity\n"
        "Whole,Skis,Atomic,Alpine,,,170,,24.0,Yes,No,\n"
        "Half,Skis,Atomic,Alpine,,,170,,24.5,Yes,No,\n"
        "Cents,Skis,Atomic,Alpine,,,170,,0.25,Yes,No,\n"
    )
    resp = client.post(
        f"/intakes/{iid}/items/import",
        files={"file": ("items.csv", csv_text.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["imported"] == 3
    listed = client.get(f"/sellers/{seller_r.json()['id']}/items", headers=headers).json()
    by_desc = {it["description"]: it["price"] for it in listed}
    assert by_desc["Whole"] == 24.0
    assert by_desc["Half"] == 25.0
    assert by_desc["Cents"] == 1.0


def test_import_rejects_nonfinite_and_negative_prices(client, active_event, admin_token):
    """NaN/inf/negative prices get per-row errors instead of breaking the whole
    file (ceil(NaN) → ValueError → 422; ceil(inf) → OverflowError → 500)."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    iid = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers).json()["id"]
    csv_text = (
        "Description,Category,Brand,Type,Color,Size,Gender/Age,Year,Price,Used,Donate if Unsold,Quantity\n"
        "Good,Skis,Atomic,Alpine,,,170,,50.0,Yes,No,\n"
        "Bad,Skis,Atomic,Alpine,,,170,,nan,Yes,No,\n"
        "Negative,Skis,Atomic,Alpine,,,170,,-5.0,Yes,No,\n"
    )
    resp = client.post(
        f"/intakes/{iid}/items/import",
        files={"file": ("items.csv", csv_text.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 1
    assert body["skipped"] == 2
    reasons = " | ".join(e["reason"] for e in body["errors"])
    assert "real number" in reasons
    assert "≥ 0" in reasons
    # The valid row still imported with its price untouched.
    listed = client.get(f"/sellers/{seller_r.json()['id']}/items", headers=headers).json()
    assert [it["price"] for it in listed] == [50.0]


def test_import_template_has_quantity_column(client, admin_token):
    """GET /items/import-template pins the 12-column header, incl. Quantity —
    the parser is positional, so the template header is the contract."""
    import io
    import openpyxl
    resp = client.get("/items/import-template", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(resp.content))
    headers_row = [c.value for c in next(wb.active.iter_rows(min_row=1, max_row=1))]
    assert headers_row == [
        "Description", "Category", "Brand", "Type", "Color",
        "Size", "Gender/Age", "Year", "Price", "Used", "Donate if Unsold", "Quantity",
    ]
