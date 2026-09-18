"""Role-matrix tests for the combined ``cashier_intake`` role.

The combined role must be accepted everywhere cashier or intake permissions
are accepted, and rejected everywhere admin-only powers are required.

Allowed-route assertions use the 403-vs-anything-else discrimination: the
auth dependency runs before path/body validation, so a permitted role yields
any status EXCEPT 403 (422/404/503 from validation or missing data are fine
here — the payload-level behavior is covered by each route's own tests).
"""

from fastapi.testclient import TestClient


ALLOWED_PROBES: list[tuple[str, str, dict | None]] = [
    ("GET", "/items/lookup?code=NOPE1", None),
    ("GET", "/items/search?q=ski", None),
    ("POST", "/intakes", {}),
    ("POST", "/sellers", {}),
    ("POST", "/sales", {}),
    ("GET", "/sales/mine", None),
    ("PATCH", "/items/999999", {}),
]

FORBIDDEN_PROBES: list[tuple[str, str, dict | None]] = [
    ("GET", "/reports/1/revenue", None),
    ("GET", "/users", None),
    ("POST", "/events", {}),
    ("POST", "/events/1/activate", {}),
    ("POST", "/admin/backup", None),
]


def _probe(client: TestClient, token: str, method: str, url: str, json) -> int:
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.request(method, url, json=json, headers=headers)
    return resp.status_code


def test_cashier_intake_allowed_on_cashier_and_intake_routes(
    client, cashier_intake_token
):
    for method, url, payload in ALLOWED_PROBES:
        status = _probe(client, cashier_intake_token, method, url, payload)
        assert status != 403, f"cashier_intake should pass the gate: {method} {url} -> {status}"


def test_cashier_intake_forbidden_on_admin_only_routes(client, cashier_intake_token):
    for method, url, payload in FORBIDDEN_PROBES:
        status = _probe(client, cashier_intake_token, method, url, payload)
        assert status == 403, f"admin-only route must 403: {method} {url} -> {status}"


def test_cashier_intake_my_sales_returns_own_list(client, cashier_intake_token):
    resp = client.get(
        "/sales/mine", headers={"Authorization": f"Bearer {cashier_intake_token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_cashier_intake_role_round_trips_through_user_create(client, admin_token, active_event):
    resp = client.post(
        "/users",
        json={"username": "combo1", "password": "Str0ng!pw", "role": "cashier_intake"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["role"] == "cashier_intake"