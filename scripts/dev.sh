#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$APP_ROOT/.local/cache/uv}"
if [[ ! -d .venv || ! -d frontend/node_modules ]]; then ./scripts/setup.sh; fi
uv run --frozen uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload &
API_PID=$!
npm --prefix frontend run dev -- --port 5173 --strictPort &
WEB_PID=$!
cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
  wait "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
printf '\nFrontend: http://localhost:5173 · API: http://localhost:8000/docs\nFirst administrator: admin. Generated password: .local/admin-initial-password\n'
wait -n "$API_PID" "$WEB_PID"
