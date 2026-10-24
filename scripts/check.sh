#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
export UV_CACHE_DIR="${UV_CACHE_DIR:-$PWD/.local/cache/uv}"
uv run --frozen ruff check backend
uv run --frozen ruff format --check backend
uv run --frozen ty check
uv run --frozen pytest -q
npm --prefix frontend run build
