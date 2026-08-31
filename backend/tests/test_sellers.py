import pytest
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller
from tests.helpers import valid_seller_create, valid_vendor_create


@pytest.fixture
def seller(db, active_event):
    s = Seller(
        event_id=active_event.id,
        code="001",
        first_name="Jane",
        last_name="Smith",
        is_vendor=False,
        created_by="admin",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def test_create_seller(client, active_event, admin_token):
    resp = client.post(
        "/sellers",
        json=valid_seller_create(first_name="Bob", last_name="Jones"),
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["code"]) == 3
    assert data["first_name"] == "Bob"
    assert data["event_id"] is not None


def test_list_sellers_no_filter(client, admin_token, seller):
    resp = client.get("/sellers", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_search_sellers_by_code(client, intake_token, seller):
    resp = client.get("/sellers?q=001", headers={"Authorization": f"Bearer {intake_token}"})
    assert resp.status_code == 200
    assert resp.json()[0]["code"] == "001"


def test_search_sellers_by_name(client, intake_token, seller):
    resp = client.get("/sellers?q=jane", headers={"Authorization": f"Bearer {intake_token}"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_search_sellers_no_match(client, intake_token, seller):
    resp = client.get("/sellers?q=zzz", headers={"Authorization": f"Bearer {intake_token}"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_seller(client, admin_token, seller):
    resp = client.get(f"/sellers/{seller.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["code"] == "001"


def test_get_seller_not_found(client, admin_token):
    resp = client.get("/sellers/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 404


def test_update_seller(client, admin_token, seller):
    resp = client.patch(
        f"/sellers/{seller.id}",
        json={"email": "jane@example.com", "phone": "6125551234"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "jane@example.com"


def test_cashier_cannot_create_seller(client, cashier_token):
    resp = client.post(
        "/sellers",
        json={"first_name": "A", "last_name": "B", "is_vendor": False},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


def test_create_seller_auto_assigns_code(client, active_event, admin_token):
    """POST /sellers assigns a sequential 3-digit code; client need not provide one."""
    r = client.post(
        "/sellers",
        json=valid_seller_create(),
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    assert r.json()["code"] == "001"


def test_create_two_sellers_increments_code(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    client.post("/sellers", json=valid_seller_create(first_name="A", last_name="B"), headers=headers)
    r2 = client.post("/sellers", json=valid_seller_create(first_name="C", last_name="D"), headers=headers)
    assert r2.json()["code"] == "002"


def test_list_seller_items_empty(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    # Create a seller first
    r = client.post("/sellers", json=valid_seller_create(first_name="X", last_name="Y"), headers=headers)
    seller_id = r.json()["id"]
    r2 = client.get(f"/sellers/{seller_id}/items", headers=headers)
    assert r2.status_code == 200
    assert r2.json() == []


def test_list_seller_items_with_items(client, db, active_event, admin_token, seller):
    """GET /sellers/{id}/items returns items belonging to the seller in the active event."""
    intake = Intake(
        seller_id=seller.id,
        donate_unsold=False,
        donate_proceeds=False,
        created_by="admin",
    )
    db.add(intake)
    db.commit()
    db.refresh(intake)

    item = Item(
        intake_id=intake.id,
        seller_id=seller.id,
        code="001-001",
        price=25.00,
        created_by="admin",
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    headers = {"Authorization": f"Bearer {admin_token}"}
    r = client.get(f"/sellers/{seller.id}/items", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["code"] == item.code


# ── seller registration validation (Phase 1) ────────────────────────────────

def test_create_vendor_with_company_only(client, active_event, admin_token):
    """A vendor (is_vendor=True) registers with company and no first/last name."""
    resp = client.post(
        "/sellers",
        json=valid_vendor_create(),
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["is_vendor"] is True
    assert data["company"] == "Pioneer Sports"
    assert data["first_name"] is None
    assert data["last_name"] is None


def test_create_vendor_without_company_is_422(client, active_event, admin_token):
    payload = valid_vendor_create()
    payload.pop("company")
    resp = client.post("/sellers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422


def test_create_individual_missing_last_name_is_422(client, active_event, admin_token):
    payload = valid_seller_create()
    payload.pop("last_name")
    resp = client.post("/sellers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422


def test_create_individual_missing_both_phone_and_email_is_422(client, active_event, admin_token):
    payload = valid_seller_create()
    payload.pop("phone")
    resp = client.post("/sellers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422


def test_create_individual_with_email_only_is_201(client, active_event, admin_token):
    """Email alone (no phone) satisfies the contact requirement."""
    payload = valid_seller_create()
    payload.pop("phone")
    payload["email"] = "jane@example.com"
    resp = client.post("/sellers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 201
    assert resp.json()["email"] == "jane@example.com"
    assert resp.json()["phone"] is None


def test_create_seller_bad_email_is_422(client, active_event, admin_token):
    payload = valid_seller_create(email="not-an-email")
    resp = client.post("/sellers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422


def test_create_seller_phone_9_digits_is_422(client, active_event, admin_token):
    payload = valid_seller_create(phone="612555123")
    resp = client.post("/sellers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422


def test_create_seller_phone_normalized_to_10_digits(client, active_event, admin_token):
    """Formatted phone '(612) 555-1234' is normalized to '6125551234' and accepted."""
    payload = valid_seller_create(phone="(612) 555-1234")
    resp = client.post("/sellers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 201
    assert resp.json()["phone"] == "6125551234"


def test_create_seller_zip_4_digits_is_422(client, active_event, admin_token):
    payload = valid_seller_create(zip="5540")
    resp = client.post("/sellers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422


def test_create_seller_state_3_chars_is_422(client, active_event, admin_token):
    payload = valid_seller_create(state="MIN")
    resp = client.post("/sellers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422


def test_create_seller_state_uppercased(client, active_event, admin_token):
    payload = valid_seller_create(state="mn")
    resp = client.post("/sellers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 201
    assert resp.json()["state"] == "MN"


def test_create_seller_missing_address_is_422(client, active_event, admin_token):
    payload = valid_seller_create()
    payload.pop("address")
    resp = client.post("/sellers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422


def test_create_seller_records_donation_defaults(client, active_event, admin_token):
    """SellerCreate persists donate_unsold_default / donate_proceeds_default."""
    payload = valid_seller_create(donate_unsold_default=True, donate_proceeds_default=False)
    resp = client.post("/sellers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["donate_unsold_default"] is True
    assert data["donate_proceeds_default"] is False


def test_update_seller_donation_defaults(client, admin_token, seller):
    """PATCH /sellers can update the donation defaults."""
    resp = client.patch(
        f"/sellers/{seller.id}",
        json={"donate_proceeds_default": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["donate_proceeds_default"] is True


def test_state_accepts_any_case_and_normalizes_to_upper(client, active_event, admin_token):
    """State abbreviations are case-tolerant ("camel case" feedback):
    'vt' / 'Vt' / ' VT ' all normalize to uppercase 'VT' on create, and the
    same tolerance applies on update. Lowercase must never error out."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    for raw in ("vt", "Vt", " VT ", "vT"):
        payload = valid_seller_create(first_name="Case", last_name=raw.upper())
        payload["state"] = raw
        resp = client.post("/sellers", json=payload, headers=headers)
        assert resp.status_code == 201, (raw, resp.text)
        assert resp.json()["state"] == "VT"


def test_update_state_accepts_lower_case(client, admin_token, seller):
    """PATCHing the state in lowercase normalizes to uppercase."""
    resp = client.patch(
        f"/sellers/{seller.id}",
        json={"state": "ma"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["state"] == "MA"
