$ErrorActionPreference = "Stop"
$port = if ($env:NEXORA_GATEWAY_PORT) { $env:NEXORA_GATEWAY_PORT } else { "8765" }
Write-Host "Starting ngrok for localhost:$port"
ngrok http $port
