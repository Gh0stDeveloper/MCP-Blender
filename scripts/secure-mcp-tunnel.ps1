$ErrorActionPreference = "Stop"
$profile = if ($env:NEXORA_TUNNEL_PROFILE) { $env:NEXORA_TUNNEL_PROFILE } else { "nexora-forge" }
tunnel-client doctor --profile $profile --explain
tunnel-client run --profile $profile
