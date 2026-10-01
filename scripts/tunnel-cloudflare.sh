#!/usr/bin/env bash
set -euo pipefail
port="${NEXORA_GATEWAY_PORT:-8765}"
exec cloudflared tunnel --url "http://127.0.0.1:$port"
