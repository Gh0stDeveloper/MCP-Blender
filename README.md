# Nexora Forge MCP

**AI-native Blender production gateway.**

Nexora Forge MCP connects an MCP-capable AI client to a local Blender workstation through a secure Streamable HTTP gateway. It is designed for professional 3D workflows: characters, rigs, animations, environments, weapons, props, skins/materials, enemies, zombies, emotes, lobbies, previews, imports/exports and controlled Blender Python automation.

> Repository: `Gh0stDeveloper/MCP-Blender`

## Product identity

**Name:** Nexora Forge MCP  
**Tagline:** _AI-native 3D production for Blender._  
**Short description:** Secure MCP gateway and Blender extension for AI-assisted 3D creation, rigging, animation, environment building and game-asset production.

### Future brand image prompt

> A premium cinematic product mark for “Nexora Forge MCP”: a dark graphite 3D forge chamber merging a stylized Blender-inspired geometric viewport with an intelligent neural-node network, a luminous metallic anvil/cube at the center, subtle orange forge light and cool electric-blue data lines, high-end game-development aesthetic, clean SaaS branding, no characters, no copyrighted logos, symmetrical composition, sharp volumetric lighting, polished metal and glass, black background, suitable for GitHub social preview, website hero and app icon family, 16:9 master composition with a simplified square-safe center mark.

## Architecture

```text
AI / MCP Host
     |
     | HTTPS + Bearer token
     v
Cloudflare Tunnel / ngrok
     |
     v
Nexora Forge MCP Gateway :8765
     |
     | localhost + bridge secret
     v
Blender Extension Bridge :9876
     |
     v
Blender main thread / bpy
```

The public MCP process and Blender are intentionally separated. Blender only listens on loopback, and `bpy` work is queued back onto Blender's main thread.

## Core capabilities

- MCP 2026-compatible Streamable HTTP server using the official Python SDK v2.
- Local Blender extension with a queued HTTP bridge.
- Structured tools for scene inspection, primitives, transforms, materials, modifiers, cameras, lights, collections, keyframes, save/open/import/export and rendering.
- Batch execution for lower-latency multi-step generation.
- Optional unrestricted Blender Python execution, **disabled by default**.
- Permission profiles: `safe`, `standard`, `unrestricted`.
- Bearer-token protection at the public gateway and a separate bridge secret for Blender.
- Audit log hooks and request IDs.
- Cloudflare Tunnel scripts/config examples.
- ngrok fallback scripts/config examples.
- SaaS-ready Next.js landing/dashboard shell with SEO metadata.
- GitHub Actions for Python lint/type/test, web lint/build, and security checks.

## Repository layout

```text
.
├── src/nexora_forge_mcp/      # MCP server/gateway
├── blender_extension/         # Blender extension
├── apps/web/                  # SaaS/SEO website shell
├── scripts/                   # local + tunnel launchers
├── docs/                      # architecture/security/tooling docs
├── tests/                     # Python tests
└── .github/workflows/         # CI
```

## Quick start

### 1. Requirements

- Python 3.11+
- Blender 4.5 LTS or compatible newer release
- `uv` recommended
- optional: `cloudflared` and/or `ngrok`

### 2. Install the MCP gateway

```bash
cp .env.example .env
uv sync --all-extras
uv run nexora-forge-mcp
```

Default local MCP endpoint:

```text
http://127.0.0.1:8765/mcp
```

### 3. Install the Blender extension

Zip the `blender_extension` directory or install it as a development extension. In Blender, configure the same `NEXORA_BRIDGE_SECRET` used by the gateway, then start the bridge from the **Nexora Forge MCP** panel.

The bridge defaults to:

```text
http://127.0.0.1:9876
```

### 4. Public access with Cloudflare

Development:

```bash
cloudflared tunnel --url http://127.0.0.1:8765
```

Production should use a named/remotely-managed tunnel and a stable hostname. Do not rely on a public tunnel URL as authentication.

### 5. Public access with ngrok

```bash
ngrok http 8765
```

Use the gateway bearer token and, where available, provider edge authentication/rate limits.

## Security model

Nexora Forge MCP can ultimately control Blender and, in unrestricted mode, execute Blender Python with the permissions of the desktop user. Treat it like remote developer access.

- Bind Blender bridge to `127.0.0.1` only.
- Never reuse the public MCP token as the Blender bridge secret.
- Keep `NEXORA_PERMISSION_PROFILE=standard` unless unrestricted Python is explicitly required.
- Rotate secrets after sharing logs or configuration.
- Prefer Cloudflare Access or ngrok edge authentication in addition to the gateway token.
- Do not expose Blender's bridge port directly to the Internet.

See [docs/SECURITY.md](docs/SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
