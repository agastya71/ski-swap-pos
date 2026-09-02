#!/usr/bin/env bash
# One-shot Caddy install for Ski Swap POS on Debian/Ubuntu.
#
# Run with sudo:
#     sudo bash deploy/install-caddy.sh
#
# What it does:
#   1. Adds the official Caddy apt repository (Cloudsmith).
#   2. Installs Caddy and enables the systemd service (binds :80 and :443).
#   3. Installs ./deploy/Caddyfile to /etc/caddy/Caddyfile.
#   4. Reloads Caddy so it starts provisioning the TLS cert for
#      mysl-pos.duckdns.org (requires ports 80 + 443 to be reachable from the
#      internet — see docs/reverse-proxy-caddy.md → "Router port forwarding").

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must be run as root. Use:  sudo bash deploy/install-caddy.sh" >&2
  exit 1
fi

echo "==> [1/4] Adding official Caddy apt repository ..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null

echo "==> [2/4] Installing Caddy ..."
apt-get update
apt-get install -y caddy

echo "==> [3/4] Installing Caddyfile ..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -m 0644 "${SCRIPT_DIR}/Caddyfile" /etc/caddy/Caddyfile
echo "    Caddyfile: $(caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -2)"

echo "==> [4/4] Enabling + (re)starting Caddy ..."
systemctl enable --now caddy
systemctl restart caddy

echo
echo "Done. Caddy is listening on :80, :443, and :8000."
echo
echo "Next steps (manual):"
echo "  1. Ensure the app is running on 127.0.0.1:8001 (behind Caddy):"
echo "       APP_HOST=127.0.0.1 APP_PORT=8001 JWT_SECRET=\"$(openssl rand -hex 32)\" bash start.sh"
echo "     (Nothing must be listening on :8000 — Caddy owns it.)"
echo "  2. On your router, forward external TCP 80, 443, AND 8000 -> this machine's"
echo "     LAN IP (find it with: ip -4 addr show | grep inet)."
echo "  3. Open https://mysl-pos.duckdns.org (or https://mysl-pos.duckdns.org:8000)
echo "     in a browser."
echo
echo "Check status:"
echo "  sudo systemctl status caddy"
echo "  sudo journalctl -u caddy -f      # watch cert provisioning"
echo
echo "See docs/reverse-proxy-caddy.md for troubleshooting."