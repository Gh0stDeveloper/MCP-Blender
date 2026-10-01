$ErrorActionPreference = "Stop"
$port = if ($env:NEXORA_GATEWAY_PORT) { $env:NEXORA_GATEWAY_PORT } else { "8765" }
Write-Host "Starting Cloudflare Quick Tunnel for localhost:$port"
cloudflared tunnel --url "http://127.0.0.1:$port"
