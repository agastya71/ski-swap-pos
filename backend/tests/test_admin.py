import io
import zipfile

import pytest


def test_backup_returns_zip(client, admin_token, active_event, tmp_path, monkeypatch):
    import app.config as config
    monkeypatch.setattr(config, "BACKUP_DIR", str(tmp_path))
    resp = client.post(
        "/admin/backup",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(resp.content))
    assert any(n.endswith(".json") for n in z.namelist())


def test_backup_writes_json_to_disk(client, admin_token, active_event, tmp_path, monkeypatch):
    import app.config as config
    monkeypatch.setattr(config, "BACKUP_DIR", str(tmp_path))
    client.post(
        "/admin/backup",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert len(list(tmp_path.glob("*.json"))) == 1


def test_backup_cashier_forbidden(client, cashier_token, active_event):
    resp = client.post(
        "/admin/backup",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


def test_backup_intake_forbidden(client, intake_token, active_event):
    resp = client.post(
        "/admin/backup",
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403


def test_backup_unauthenticated(client):
    resp = client.post("/admin/backup")
    assert resp.status_code == 403
