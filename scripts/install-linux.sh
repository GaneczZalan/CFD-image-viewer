#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"
IMAGE_ROOT="${CFD_IMAGE_ROOT:-}"
SCAN_DEPTH="${CFD_SCAN_DEPTH:-4}"
START_AFTER_INSTALL="${START_AFTER_INSTALL:-0}"
ACCESS_MODE="${ACCESS_MODE:-local}"
SSH_USER="${SSH_USER:-user}"
SSH_HOST="${SSH_HOST:-server-address}"
REQUIRED_NODE_MAJOR=20
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

node_major() {
  if ! command_exists node; then
    echo 0
    return
  fi

  node --version | sed 's/^v//' | cut -d. -f1
}

install_node_with_apt() {
  echo "Installing Node.js 22 LTS with apt..."
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
}

cd "$PROJECT_ROOT"

case "$ACCESS_MODE" in
  local|ssh|vpn) ;;
  *)
    echo "ACCESS_MODE must be one of: local, ssh, vpn"
    exit 1
    ;;
esac

echo "CFD Viewer server installer"
echo "Project: $PROJECT_ROOT"

MAJOR="$(node_major)"
if [ "$MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
  if command_exists apt-get && command_exists sudo; then
    install_node_with_apt
  else
    echo "Node.js $REQUIRED_NODE_MAJOR+ is required."
    echo "Install Node.js LTS manually, then rerun this script."
    exit 1
  fi
fi

echo "Using Node.js $(node --version) and npm $(npm --version)"

echo "Installing project dependencies..."
npm ci

echo "Building production app..."
npm run build

echo ""
echo "Install complete."
echo "Start command:"
if [ -n "$IMAGE_ROOT" ]; then
  echo "  CFD_IMAGE_ROOT=\"$IMAGE_ROOT\" CFD_SCAN_DEPTH=$SCAN_DEPTH PORT=$PORT ACCESS_MODE=$ACCESS_MODE SSH_USER=$SSH_USER SSH_HOST=$SSH_HOST ./scripts/start-linux.sh"
else
  echo "  CFD_SCAN_DEPTH=$SCAN_DEPTH PORT=$PORT ACCESS_MODE=$ACCESS_MODE SSH_USER=$SSH_USER SSH_HOST=$SSH_HOST ./scripts/start-linux.sh"
fi

if [ "$START_AFTER_INSTALL" = "1" ]; then
  PORT="$PORT" CFD_IMAGE_ROOT="$IMAGE_ROOT" CFD_SCAN_DEPTH="$SCAN_DEPTH" ACCESS_MODE="$ACCESS_MODE" SSH_USER="$SSH_USER" SSH_HOST="$SSH_HOST" ./scripts/start-linux.sh
fi
