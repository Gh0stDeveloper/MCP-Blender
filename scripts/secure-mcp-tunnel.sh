#!/usr/bin/env bash
set -euo pipefail
profile="${NEXORA_TUNNEL_PROFILE:-nexora-forge}"
tunnel-client doctor --profile "$profile" --explain
exec tunnel-client run --profile "$profile"
