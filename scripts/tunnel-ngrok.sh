#!/usr/bin/env bash
set -euo pipefail
port="$NEXORA_GATEWAY_PORT"
if [[ -z "$port" ]]; then port="8765"; fi
exec ngrok http "$port"
