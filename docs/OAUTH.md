# OAuth deployment

Use `NEXORA_AUTH_MODE=oauth` for a stable public HTTPS MCP endpoint.

```env
NEXORA_AUTH_MODE=oauth
NEXORA_GATEWAY_HOST=0.0.0.0
NEXORA_OAUTH_ISSUER_URL=https://auth.example.com
NEXORA_OAUTH_RESOURCE_URL=https://mcp.example.com/mcp
NEXORA_OAUTH_INTROSPECTION_URL=https://auth.example.com/oauth2/introspect
NEXORA_OAUTH_CLIENT_ID=nexora-forge-resource-server
NEXORA_OAUTH_CLIENT_SECRET=...
NEXORA_OAUTH_REQUIRED_SCOPES=blender:read,blender:write
NEXORA_OAUTH_EXPECTED_AUDIENCE=https://mcp.example.com/mcp
NEXORA_OAUTH_VALIDATE_AUDIENCE=true
NEXORA_ALLOWED_HOSTS=mcp.example.com
NEXORA_ALLOWED_ORIGINS=https://mcp.example.com
```

Nexora Forge is the OAuth Resource Server. The external IdP handles login, consent, authorization/token endpoints, client registration, refresh tokens and token issuance.

Scopes:

- `blender:read`: status and inspection.
- `blender:write`: modeling, rigging, animation, render and file operations.
- `blender:python`: additional scope for raw Blender Python.

Keep audience validation enabled in production. If the IdP uses a custom API audience, set it with `NEXORA_OAUTH_EXPECTED_AUDIENCE`.
