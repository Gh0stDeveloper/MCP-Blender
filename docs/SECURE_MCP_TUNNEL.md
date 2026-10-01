# Secure MCP Tunnel

Use this path when Nexora Forge and Blender should remain private on the user's workstation or private network.

## Nexora configuration

```env
NEXORA_AUTH_MODE=local
NEXORA_GATEWAY_HOST=127.0.0.1
NEXORA_GATEWAY_PORT=8765
```

Local mode refuses non-loopback binding.

## OpenAI tunnel-client

Create a tunnel in OpenAI Platform tunnel settings and obtain a `tunnel_id` and runtime API key.

Following the OpenAI tunnel-client quickstart pattern, initialize a profile that points at Nexora's local HTTP MCP endpoint:

```bash
export CONTROL_PLANE_API_KEY="..."
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile nexora-forge \
  --tunnel-id tunnel_0123456789abcdef0123456789abcdef \
  --mcp-server-url http://127.0.0.1:8765/mcp

tunnel-client doctor --profile nexora-forge --explain
tunnel-client run --profile nexora-forge
```

OpenAI documents that HTTP MCP servers use `--mcp-server-url` in place of `--mcp-command`.

## ChatGPT

Associate the tunnel with the target ChatGPT workspace, then create a developer-mode app and select **Tunnel** as its connection.

## Responses API

Pass the tunnel identifier as `tunnel_id` in the MCP tool definition. Do not pass the OpenAI-hosted tunnel endpoint as `server_url`.

The scripts in `scripts/secure-mcp-tunnel.*` validate and run an already initialized `nexora-forge` profile.
