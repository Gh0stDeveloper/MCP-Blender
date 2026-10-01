# Remote access

Local MCP endpoint:

http://127.0.0.1:8765/mcp

## Cloudflare Tunnel

For development, publish only the gateway:

    cloudflared tunnel --url http://127.0.0.1:8765

For production, use a stable managed Cloudflare Tunnel and map a hostname such as mcp.example.com to http://127.0.0.1:8765.

Add the public hostname to NEXORA_ALLOWED_HOSTS and its HTTPS origin to NEXORA_ALLOWED_ORIGINS.

## ngrok fallback

After authenticating ngrok:

    ngrok http 8765

Add the assigned hostname to the Host/Origin allowlists. Edge authentication and rate limiting are recommended for long-running use.

Never publish port 9876. That is the Blender-in-process loopback bridge.

GET /health is intentionally unauthenticated and returns service/bridge status. MCP requests to /mcp require gateway authentication.
