#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"
ACCESS_MODE="${ACCESS_MODE:-local}"
SSH_USER="${SSH_USER:-user}"
SSH_HOST="${SSH_HOST:-server-address}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

case "$ACCESS_MODE" in
  local|ssh|vpn) ;;
  *)
    echo "ACCESS_MODE must be one of: local, ssh, vpn"
    exit 1
    ;;
esac

if [ -n "${CFD_IMAGE_ROOT:-}" ]; then
  echo "Using CFD_IMAGE_ROOT=$CFD_IMAGE_ROOT"
else
  echo "Using bundled ./images folder. Set CFD_IMAGE_ROOT to use server CFD folders."
fi

if [ "$ACCESS_MODE" = "vpn" ]; then
  BIND_HOST="0.0.0.0"
else
  BIND_HOST="127.0.0.1"
fi

echo "Access mode: $ACCESS_MODE"
echo "Binding CFD Viewer to $BIND_HOST:$PORT"

if [ "$ACCESS_MODE" = "ssh" ]; then
  echo ""
  echo "SSH tunnel command for users to run on their own machine:"
  echo "  ssh -L $PORT:127.0.0.1:$PORT $SSH_USER@$SSH_HOST"
  echo "Then open: http://localhost:$PORT"
elif [ "$ACCESS_MODE" = "vpn" ]; then
  echo "VPN/Twingate routing is configured outside this script."
  echo "Users on the private network can open: http://server-private-address:$PORT"
else
  echo "Open locally on this machine: http://localhost:$PORT"
fi

npm run start -- --hostname "$BIND_HOST" --port "$PORT"
