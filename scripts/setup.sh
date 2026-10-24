#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$APP_ROOT/.local/cache/uv}"
export npm_config_cache="${npm_config_cache:-$APP_ROOT/.local/cache/npm}"
command -v uv >/dev/null || { echo 'Install uv: https://docs.astral.sh/uv/getting-started/installation/'; exit 1; }
command -v node >/dev/null || { echo 'Install Node.js 22.12+ (or 24 LTS).'; exit 1; }
uv sync --frozen
npm --prefix frontend ci --no-audit --no-fund
printf '\nDependencies installed. Run ./scripts/dev.sh to start the app.\n'
