#!/usr/bin/env bash
set -euo pipefail
if [[ ! -f .env ]]; then
  python3 scripts/bootstrap.py
fi
uv sync --all-extras
exec uv run nexora-forge-mcp
