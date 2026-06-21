#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [ -n "${CFD_IMAGE_ROOT:-}" ]; then
  echo "Using CFD_IMAGE_ROOT=$CFD_IMAGE_ROOT"
else
  echo "Using bundled ./images folder. Set CFD_IMAGE_ROOT to use server CFD folders."
fi

echo "Starting CFD Viewer on http://0.0.0.0:$PORT"
npm run start -- --hostname 0.0.0.0 --port "$PORT"
