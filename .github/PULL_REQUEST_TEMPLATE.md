# Ski Swap POS — Pull Request

<!--
PR checklist — see AGENTS.md "Service-disruption check".
2026-11-22 precedent: a green suite shipped a bootstrap.py boot-crash (tuple
unpack) that crash-looped the daemon and took mysl-pos.duckdns.org down
(buglog bootstrap-rows-unpack-crashloop). Boot-path edits need more than pytest.
-->

## Does this PR touch the SERVICE BOOT PATH?

- [ ] No — skip this section
- [ ] **Yes** (`backend/scripts/bootstrap.py`, `scripts/start.sh`, `app/database.py`,
      `app/config.py`, `migrations/**`, `app/main.py`, systemd unit):

  - [ ] `tests/test_bootstrap_service.py` passes (subprocess smoke test — runs
        bootstrap end-to-end against scratch DBs, what plain pytest never does)
  - [ ] For bootstrap/start.sh edits: script dry-run against scratch env → exit 0
  - [ ] Any SELECT that feeds `for (…) in rows` tuple-unpack loops widened?
        → EVERY loop consuming it updated in the same commit
  - [ ] After deploy restart: `systemctl is-active ski-swap-pos` active +
        `journalctl -u ski-swap-pos -n 20` shows NO traceback + `curl` 200

## Standard

- [ ] Backend suite green from `backend/` (`.venv/bin/python -m pytest -q`)
- [ ] Frontend suite green if frontend touched (`npm test`, `npx tsc -b`)
- [ ] No `git add -A` / no DB/jwt/wolf files staged; `git commit -F <file>`
- [ ] Live-data path verified if reports/checkout math changed
