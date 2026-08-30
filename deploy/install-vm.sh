#!/usr/bin/env bash
# Install Docker + the Resonance compose systemd unit on an Ubuntu VM.
# Usage (as a user who can sudo):
#   curl -fsSL https://raw.githubusercontent.com/kernelKain/resonance/main/deploy/install-vm.sh | sudo bash
#   # or, from a clone:
#   sudo bash deploy/install-vm.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/kernelKain/resonance.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/resonance}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Re-run as root: sudo bash deploy/install-vm.sh" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker

if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  git clone "${REPO_URL}" "${INSTALL_DIR}"
else
  git -C "${INSTALL_DIR}" pull --ff-only || true
fi

if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
  cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
  echo "Created ${INSTALL_DIR}/.env — edit OPENROUTER_API_KEY and DAYTONA_API_KEY before starting."
fi

install -m 0644 "${INSTALL_DIR}/deploy/systemd/resonance-compose.service" /etc/systemd/system/resonance-compose.service
systemctl daemon-reload
systemctl enable resonance-compose.service

echo
echo "Next:"
echo "  1. nano ${INSTALL_DIR}/.env    # set OPENROUTER_API_KEY and DAYTONA_API_KEY"
echo "  2. systemctl start resonance-compose"
echo "  3. cd ${INSTALL_DIR} && sudo docker compose ps"
echo "  4. curl -sS http://127.0.0.1:43123/api/health"
echo
echo "Public URL: install cloudflared and point the tunnel at http://127.0.0.1:43123"
echo "Full runbook: ${INSTALL_DIR}/deploy/README.md"
