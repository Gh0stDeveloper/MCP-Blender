#!/usr/bin/env bash
set -euo pipefail
port="${NEXORA_GATEWAY_PORT:-8765}"
exec ngrok http "$port"
