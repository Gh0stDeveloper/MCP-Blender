$ErrorActionPreference = "Stop"
if (-not (Test-Path ".env")) {
  python scripts/bootstrap.py
}
uv sync --all-extras
uv run nexora-forge-mcp
