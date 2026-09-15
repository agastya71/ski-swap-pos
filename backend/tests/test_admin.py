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


def test_backup_db_copy_is_consistent_sqlite(client, admin_token, active_event, tmp_path, monkeypatch):
    """With WAL enabled, the .db inside the ZIP must be a consistent snapshot
    (the backup API, not a raw file copy) — readable, integrity-clean, with
    the seeded tables present."""
    import io
    import sqlite3
    import zipfile

    import app.config as config

    monkeypatch.setattr(config, "BACKUP_DIR", str(tmp_path))
    r = client.post("/admin/backup", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    zip_bytes = r.content

    # find the .db member
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    db_member = next(n for n in zf.namelist() if n.endswith(".db"))
    snapshot = tmp_path / "snapshot.db"
    snapshot.write_bytes(zf.read(db_member))

    con = sqlite3.connect(str(snapshot))
    try:
        assert con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        tables = {
            row[0]
            for row in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        assert {"item", "sale", "seller", "event"} <= tables
        assert con.execute("SELECT count(*) FROM item").fetchone()[0] > 0
    finally:
        con.close()
