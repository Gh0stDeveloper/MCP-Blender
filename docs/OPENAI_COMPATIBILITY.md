# OpenAI compatibility

Nexora Forge MCP supports both OpenAI connection patterns with one MCP implementation.

## ChatGPT Business / Enterprise / Edu

For a private Blender workstation, use OpenAI Secure MCP Tunnel:

1. Set `NEXORA_AUTH_MODE=local`.
2. Keep `NEXORA_GATEWAY_HOST=127.0.0.1`.
3. Start Nexora Forge MCP and the Blender bridge.
4. Create a Secure MCP Tunnel in OpenAI Platform.
5. Configure `tunnel-client` to forward to `http://127.0.0.1:8765/mcp`.
6. Associate the tunnel with the required Platform organization and ChatGPT workspace.
7. Create a developer-mode ChatGPT app and select **Tunnel**.

For a stable public HTTPS endpoint, use `NEXORA_AUTH_MODE=oauth`. Nexora then acts as an OAuth 2.1 Resource Server, publishes Protected Resource Metadata through the MCP SDK, and validates access tokens with RFC 7662 introspection.

Normal full-control scopes are `blender:read` and `blender:write`. Raw Blender Python additionally requires `blender:python`.

## OpenAI Responses API

For a private workstation, pass `tunnel_id` in the MCP tool definition.

For a public/direct remote MCP, pass `server_url` and, when required, `authorization`.

The Responses API does not persist the MCP authorization value, so applications must include it on every Responses request.

See `examples/openai_responses.py`.

## Tool metadata

Nexora publishes MCP ToolAnnotations for read-only, write, destructive and unrestricted operations. These are client hints; server permission profiles and OAuth scopes remain authoritative.
