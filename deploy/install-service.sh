#!/usr/bin/env bash
# One-shot systemd install for the Ski Swap POS app (system daemon).
#
# Run with sudo:
#     sudo bash deploy/install-service.sh
#
# What it does:
#   1. Substitutes repo dir / user / group / home into
#      ./deploy/ski-swap-pos.service and installs it to
#      /etc/systemd/system/ski-swap-pos.service.
#   2. `systemctl daemon-reload` + `systemctl enable` (starts at boot).
#   3. Starts the service now unless something is already listening on :8001
#      (e.g. a manually-started `bash start.sh` — that must be stopped first,
#      or the daemon will fail to bind).
#
# Re-run any time after editing the unit template to refresh the installed copy.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must be run as root. Use:  sudo bash deploy/install-service.sh" >&2
  exit 1
fi

# Resolve the invoking (non-root) user and their home/group. SUDO_USER is set
# by sudo; fall back to LOGNAME/USER for `su`-style invocations.
APP_USER="${SUDO_USER:-${LOGNAME:-${USER:-}}}"
if [[ -z "$APP_USER" || "$APP_USER" == "root" ]]; then
  echo "Could not resolve the app user (invoked as root without sudo)." >&2
  echo "Run it as the repo owner via sudo, e.g.:  sudo -u $USER bash deploy/install-service.sh" >&2
  exit 1
fi
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
APP_GROUP="$(id -gn "$APP_USER")"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UNIT_SRC="${SCRIPT_DIR}/ski-swap-pos.service"
UNIT_DST="/etc/systemd/system/ski-swap-pos.service"

if [[ ! -f "$APP_HOME/.local/bin/uv" ]]; then
  echo "WARNING: uv not found at $APP_HOME/.local/bin/uv — start.sh will fall back" >&2
  echo "to pip (or skip deps). If uv lives elsewhere, adjust PATH in ${UNIT_SRC}." >&2
fi

echo "==> [1/3] Installing unit (user=${APP_USER}, group=${APP_GROUP}, repo=${REPO_DIR}) ..."
sed -e "s|__REPO_DIR__|${REPO_DIR}|g" \
  -e "s|__APP_USER__|${APP_USER}|g" \
  -e "s|__APP_GROUP__|${APP_GROUP}|g" \
  -e "s|__APP_HOME__|${APP_HOME}|g" \
  "$UNIT_SRC" >"$UNIT_DST"
chmod 0644 "$UNIT_DST"

echo "==> [2/3] Enabling at boot (multi-user.target) ..."
systemctl daemon-reload
systemctl enable ski-swap-pos.service

echo "==> [3/3] Starting now (if :8001 is free) ..."
if ss -ltn 2>/dev/null | grep -qE ':8001\b'; then
  cat <<EOF

  A process is ALREADY listening on :8001 — most likely a manually-started
  'bash start.sh'. The unit is installed and enabled, but not started, so the
  two would collide. To switch over to the daemon:

      ss -ltnp 'sport = :8001'          # find the PID
      kill <PID>                        # stop the manual instance
      sudo systemctl start ski-swap-pos # hand over to the daemon

EOF
else
  systemctl start ski-swap-pos.service
fi

echo
echo "Done. Unit: ${UNIT_DST}"
echo
echo "Manage with:"
echo "  systemctl status ski-swap-pos"
echo "  journalctl -u ski-swap-pos -f     # live logs (uvicorn output)"
echo "  sudo systemctl restart ski-swap-pos"
echo "  sudo systemctl disable --now ski-swap-pos   # stop + don't start at boot"
echo
echo "See docs/runbook.md § 'Run as a system daemon at boot' for details."
