<div align="center">

# Nexora Forge MCP

### AI-native 3D production for Blender

A secure MCP automation platform I built to connect modern AI systems with Blender, coordinate multi-agent 3D workflows, manage collaborative asset production and keep a human approval step before final versions are published.

[![CI](https://img.shields.io/github/actions/workflow/status/Gh0stDeveloper/MCP-Blender/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/Gh0stDeveloper/MCP-Blender/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Gh0stDeveloper/MCP-Blender?style=for-the-badge)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Blender](https://img.shields.io/badge/Blender-4.5%2B-E87D0D?style=for-the-badge&logo=blender&logoColor=white)](https://www.blender.org/)
[![MCP](https://img.shields.io/badge/Model_Context_Protocol-Streamable_HTTP-111827?style=for-the-badge)](https://modelcontextprotocol.io/)

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Control_Plane-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![AWS SDK](https://img.shields.io/badge/S3--compatible-Object_Storage-FF9900?style=flat-square&logo=amazons3&logoColor=white)](https://aws.amazon.com/s3/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Tunnel-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
[![Vercel](https://img.shields.io/badge/Vercel-AI_Gateway-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/ai-gateway)

[Website](apps/web) · [Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md) · [Cloud](docs/SAAS.md) · [Production Pipeline](docs/PRODUCTION_PIPELINE.md) · [Tool Catalog](docs/TOOL_CATALOG.md)

</div>

---

## Overview

I built Nexora Forge to turn an MCP-capable AI client into a structured Blender production operator without exposing Blender directly to the Internet.

The project is split into four main layers:

- **Nexora Forge MCP Gateway** — the Streamable HTTP MCP server that handles authentication, permission profiles, auditing and structured Blender tools.
- **Blender Extension Bridge** — a loopback-only bridge that dispatches `bpy` work back onto Blender's main thread.
- **Nexora Forge Cloud** — the optional PostgreSQL-backed collaboration and control plane for projects, devices, jobs, assets, versions and review.
- **Device Agent** — an outbound-only workstation worker that leases jobs from Cloud, controls the local Blender bridge, uploads artifacts/previews and waits for human approval.

My goal is to make the same platform useful for both individual creators and teams. It can be used for characters, creatures, zombies, weapons, props, skins/materials, environments, lobbies, rigs, animations, emotes, previews and game-ready exports.

## Technology

[![Blender](https://img.shields.io/badge/-Blender-E87D0D?logo=blender&logoColor=white)](https://www.blender.org/)
[![Python](https://img.shields.io/badge/-Python-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![MCP](https://img.shields.io/badge/-MCP-111827)](https://modelcontextprotocol.io/)
[![Next.js](https://img.shields.io/badge/-Next.js-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/-React-20232A?logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Amazon S3](https://img.shields.io/badge/-S3_Compatible-569A31?logo=amazons3&logoColor=white)](https://aws.amazon.com/s3/)
[![Cloudflare](https://img.shields.io/badge/-Cloudflare-F38020?logo=cloudflare&logoColor=white)](https://www.cloudflare.com/)
[![GitHub Actions](https://img.shields.io/badge/-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)](https://github.com/features/actions)

### AI providers

[![OpenAI](https://img.shields.io/badge/-OpenAI-412991?logo=openai&logoColor=white)](https://openai.com/)
[![Anthropic](https://img.shields.io/badge/-Anthropic-191919?logo=anthropic&logoColor=white)](https://www.anthropic.com/)
[![DeepSeek](https://img.shields.io/badge/-DeepSeek-4D6BFE)](https://www.deepseek.com/)
[![xAI](https://img.shields.io/badge/-xAI-000000)](https://x.ai/)
[![Vercel AI Gateway](https://img.shields.io/badge/-AI_Gateway-000000?logo=vercel&logoColor=white)](https://vercel.com/ai-gateway)

I also included support for a custom OpenAI-compatible endpoint so I am not forced to hard-code every future provider into the core.

---

## Architecture

I deliberately keep the public-facing services separated from Blender itself.

```mermaid
flowchart LR
    AI["ChatGPT / Responses API / MCP Host"] -->|HTTPS + MCP| GW["Nexora Forge MCP Gateway"]
    GW -->|127.0.0.1 + bridge secret| BR["Blender Extension Bridge"]
    BR --> BL["Blender / bpy"]

    HUMAN["Human Team"] --> CLOUD["Nexora Forge Cloud"]
    AGENTS["Multi-Agent Team"] --> CLOUD
    CLOUD -->|job lease| DA["Device Agent"]
    DA -->|local bridge| BR
    DA -->|preview + .blend + exports| CLOUD
    CLOUD --> REVIEW["Human Approval"]
    REVIEW --> VERSION["Approved Asset Version"]
```

### Trust boundaries

| Boundary | Exposure | Protection |
| --- | --- | --- |
| Blender bridge | Loopback only | Independent bridge secret |
| MCP gateway | Local, tunnel or HTTPS | local/static/OAuth auth modes |
| Cloud control plane | HTTPS | Cloud API token today; external account auth can be layered above |
| Device Agent | Outbound only | One-time device token stored as SHA-256 hash server-side |
| Object storage | Local or S3-compatible | Private storage keys; artifacts served through authenticated API |
| Raw Blender Python | Disabled by default | Permission profile + explicit flag + OAuth scope |

---

## What it can do

I focused the structured MCP surface on operations that are useful for real production instead of exposing Blender as one giant unsafe remote shell.

| Area | Capabilities |
| --- | --- |
| Scene | inspect, save, reset, snapshots |
| Modeling | primitives, arbitrary meshes, transforms, duplication, modifiers |
| Materials | Principled materials, assignment, UV projection |
| Rigging | armatures, bones, automatic weights |
| Animation | transform keyframes and structured animation operations |
| Lighting | point, sun, spot and area lights |
| Cameras | create and activate production cameras |
| Rendering | preview renders returned as MCP-native image content |
| Import | GLB/glTF, FBX, OBJ, STL |
| Export | GLB/glTF, FBX, OBJ, STL |
| Automation | auditable structured batches |
| Advanced | optional unrestricted Blender Python, explicitly gated |

See [docs/TOOL_CATALOG.md](docs/TOOL_CATALOG.md) for the full MCP surface.

---

## Nexora Forge Cloud

I added Forge Cloud so the project can grow beyond a single workstation without turning Blender into a shared public server.

The Cloud layer coordinates people, agents, devices, assets and production jobs while Blender continues to run locally on each enrolled workstation.

### Human collaboration

The current Cloud foundation supports:

- organizations and project workspaces;
- project members and roles;
- enrolled Blender workstations;
- asset ownership and **lease-based asset locking**;
- immutable asset versions;
- previews and stored artifacts;
- human approval/rejection/change requests;
- auditable jobs and agent runs.

### Multi-agent collaboration

I designed Agent Teams so one production request can use different AI providers and models at the same time.

```mermaid
flowchart TD
    U["Production request"] --> C["Coordinator"]
    C --> M["Modeler"]
    C --> R["Rigger / Animator"]
    C --> E["Environment / Export"]
    M --> V["Reviewer"]
    R --> V
    E --> V
    V --> P["Conflict-free execution plan"]
```

Each agent can independently select:

- role;
- provider;
- model;
- direct provider API or AI Gateway route;
- enabled/disabled state.

Dry-run mode lets me validate an Agent Team without sending provider requests or consuming provider tokens.

---

## Production pipeline

The Cloud production pipeline is implemented end-to-end:

```mermaid
sequenceDiagram
    participant H as Human
    participant C as Forge Cloud
    participant D as Device Agent
    participant B as Blender
    participant S as Object Storage

    H->>C: Queue structured Blender job
    C->>C: Acquire/validate asset lock
    D->>C: Poll for work
    C-->>D: Atomic job lease + lease token
    loop During execution
        D->>C: Lease heartbeat
        D->>B: Structured Blender operation
        B-->>D: Result
    end
    D->>B: Save .blend checkpoint
    D->>B: Render preview
    D->>S: Upload .blend / exports / preview
    D->>C: Complete execution
    C-->>H: Awaiting approval
    H->>C: Approve / request changes / reject
    C->>C: Publish approved asset version
```

### Lease guarantees

I use leases instead of permanent locks so abandoned clients do not block production forever.

- PostgreSQL `FOR UPDATE SKIP LOCKED` prevents multiple devices from claiming the same queued job.
- Every job lease has a separate secret lease token and expiry.
- Device heartbeats extend both the job lease and the associated asset lock.
- Expired leases can be recovered by another eligible device.
- Cloud jobs only accept the structured allowlist; `python.execute` is not accepted in queued Cloud plans.

### Human approval

A completed Device Agent job enters `awaiting_approval` instead of becoming a published asset version automatically.

Open:

```text
/cloud/review/<jobId>
```

From there I can:

- **Approve & publish** — promote the latest `.blend` or export artifact to the next immutable asset version.
- **Request changes** — return the job to the queue without publishing a version.
- **Reject** — close the job and release the asset lock.

---

## Quick start — local MCP

### Requirements

- Python 3.11+
- Blender 4.5+ / compatible newer release
- `uv` recommended

### Install

```bash
git clone https://github.com/Gh0stDeveloper/MCP-Blender.git
cd MCP-Blender

python scripts/bootstrap.py
uv sync --all-extras
uv run nexora-forge-mcp
```

Default MCP endpoint:

```text
http://127.0.0.1:8765/mcp
```

### Blender extension

Install the `blender_extension` directory as a Blender extension/development extension.

Configure the same `NEXORA_BRIDGE_SECRET` generated in `.env`, then start the bridge from the **Nexora Forge MCP** Blender panel.

Default bridge:

```text
http://127.0.0.1:9876
```

> I intentionally keep the Blender bridge on loopback. Port `9876` should never be exposed directly to the Internet.

---

## Remote MCP access

I included three gateway modes so the same project can work locally, through a private tunnel or as a stable remote MCP resource server.

| Mode | Intended use |
| --- | --- |
| `local` | OpenAI Secure MCP Tunnel / strictly local clients |
| `static` | private/direct remote deployments using a strong Bearer token |
| `oauth` | stable public MCP resource server using OAuth 2.1 token verification |

Cloudflare Tunnel and ngrok launch examples are available in `scripts/` and `deploy/cloudflare/`.

See:

- [OpenAI compatibility](docs/OPENAI_COMPATIBILITY.md)
- [Secure MCP Tunnel](docs/SECURE_MCP_TUNNEL.md)
- [OAuth deployment](docs/OAUTH.md)
- [Remote access](docs/REMOTE_ACCESS.md)

---

## Quick start — Forge Cloud

### 1. PostgreSQL

Set:

```env
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/nexora_forge
NEXORA_CLOUD_API_TOKEN=generate-a-long-random-token
```

Apply migrations:

```bash
psql "$DATABASE_URL" -f deploy/postgres/001_forge_cloud.sql
psql "$DATABASE_URL" -f deploy/postgres/002_production_pipeline.sql
```

### 2. Object storage

For development or a small self-hosted installation:

```env
NEXORA_STORAGE_DRIVER=local
NEXORA_STORAGE_ROOT=.nexora-storage
```

For production I can switch to S3-compatible storage:

```env
NEXORA_STORAGE_DRIVER=s3
NEXORA_S3_REGION=auto
NEXORA_S3_BUCKET=nexora-forge
NEXORA_S3_ENDPOINT=https://your-s3-compatible-endpoint
NEXORA_S3_ACCESS_KEY_ID=...
NEXORA_S3_SECRET_ACCESS_KEY=...
```

The storage adapter works with S3-compatible services such as AWS S3, Cloudflare R2 or MinIO when configured with the appropriate endpoint and credentials.

### 3. Web control plane

```bash
cd apps/web
npm install
npm run dev
```

Useful routes:

| Route | Purpose |
| --- | --- |
| `/cloud` | multi-agent / multi-model orchestration |
| `/cloud/pipeline` | bootstrap, device enrollment and structured job queue |
| `/cloud/review/<jobId>` | preview + human approval |
| `/dashboard` | local MCP control-center information |

---

## Device Agent

After enrolling a workstation through `/cloud/pipeline` or the enrollment API, I save the one-time device token on that workstation.

```bash
export NEXORA_CLOUD_URL=https://forge.example.com
export NEXORA_DEVICE_TOKEN=nfd_...
export NEXORA_BRIDGE_SECRET=...
python device_agent/nexora_forge_agent.py
```

The Device Agent:

1. reads local Blender/bridge capabilities;
2. polls Cloud for an atomic lease;
3. maintains lease heartbeat;
4. executes the structured plan locally;
5. saves a reproducible `.blend` checkpoint;
6. renders a review preview;
7. uploads preview/Blend/exports to object storage;
8. submits the job to human review.

I designed it as an outbound-only worker. It does not open a public inbound port on the workstation.

See [device_agent/README.md](device_agent/README.md).

---

## Cloud API workflow

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /api/cloud/bootstrap` | Cloud admin | create organization/project/initial asset |
| `POST /api/cloud/devices/enroll` | Cloud admin | enroll workstation and issue one-time device token |
| `POST /api/cloud/jobs` | Cloud admin | queue structured Blender job |
| `POST /api/cloud/device/lease` | Device token | atomically claim eligible job |
| `POST /api/cloud/device/jobs/:id/heartbeat` | Device token + lease | renew lease |
| `PUT /api/cloud/device/jobs/:id/artifacts` | Device token + lease | upload preview/.blend/export/log |
| `POST /api/cloud/device/jobs/:id/complete` | Device token + lease | finish execution |
| `POST /api/cloud/device/jobs/:id/fail` | Device token + lease | fail execution safely |
| `GET /api/cloud/jobs/:id` | Cloud admin | inspect job/artifacts/review |
| `POST /api/cloud/jobs/:id/review` | Cloud admin | approve / reject / request changes |
| `GET/POST/DELETE /api/cloud/assets/:id/lock` | Cloud admin | inspect/acquire/release asset lock |
| `GET /api/cloud/assets/:id/versions` | Cloud admin | list approved versions |
| `GET /api/cloud/artifacts/:id` | Cloud admin | authenticated artifact/preview download |

---

## Configuration

The complete environment template is available in [.env.example](.env.example).

<details>
<summary><strong>Important security switches</strong></summary>

```env
# safe | standard | unrestricted
NEXORA_PERMISSION_PROFILE=standard

# Raw Blender Python requires unrestricted + this explicit switch.
NEXORA_ALLOW_PYTHON_EXEC=false

# Cloud artifact upload limit.
NEXORA_MAX_ARTIFACT_BYTES=104857600

# Default Device Agent lease.
NEXORA_JOB_LEASE_SECONDS=900
```

I keep raw Blender Python disabled by default, and the Cloud structured-job pipeline never accepts `python.execute`.

</details>

---

## Repository structure

```text
.
├── apps/web/                   # Next.js Cloud/control-center UI + Cloud APIs
├── blender_extension/         # Blender extension and localhost bridge
├── device_agent/              # outbound Cloud → local Blender worker
├── deploy/
│   ├── cloudflare/            # Cloudflare Tunnel examples
│   └── postgres/              # Cloud schema/migrations
├── docs/                      # architecture, security and deployment guides
├── examples/                  # OpenAI Responses API example
├── scripts/                   # bootstrap and tunnel launchers
├── src/nexora_forge_mcp/      # Python MCP gateway
└── tests/                     # gateway/security/config tests
```

---

## Security model

Nexora Forge can modify Blender scenes and files. In unrestricted mode it can also execute Python with the workstation user's permissions, so I treat this project like remote developer access rather than a harmless visualization plugin.

For production I recommend:

1. Keep the Blender bridge on `127.0.0.1`.
2. Use different secrets for the public MCP gateway, Cloud API and Blender bridge.
3. Use OAuth for public MCP deployments.
4. Store Device Agent tokens in an OS secret store or protected service environment.
5. Use PostgreSQL with encrypted transport and least-privilege credentials.
6. Use private object storage buckets.
7. Keep raw Python disabled unless it is explicitly needed.
8. Rotate secrets after accidental disclosure.
9. Put Cloud behind a real account/organization identity layer before offering a public multi-tenant hosted service.

See [docs/SECURITY.md](docs/SECURITY.md).

---

## Hosted SaaS additions

The self-hosted MCP, Cloud control plane, Device Agent, asset locks, versioning, storage, previews and approval pipeline are already part of the project.

There are two pieces I intentionally leave as **hosted SaaS deployment layers** rather than hard-coding them into the open-source core:

### Public account login and billing

A public commercial deployment still needs a real user-facing identity and billing layer.

That means integrating whichever provider the deployment owner chooses for:

- account signup/login;
- passwordless, OAuth or enterprise SSO;
- organization invitations and identity mapping;
- subscription plans;
- quotas and metering;
- invoices/payments;
- account suspension and lifecycle management.

I do not couple the core project to one authentication or billing vendor because self-hosted users may not need billing at all, while hosted deployments may prefer completely different providers.

### Secret-vault-backed per-organization BYOK

The Cloud schema already uses a `secret_ref` concept instead of a plaintext provider-key field.

For a public multi-tenant SaaS, I still recommend connecting that reference to a dedicated encrypted secret manager or KMS so every organization can bring its own OpenAI, Anthropic, DeepSeek, xAI or compatible provider credentials without exposing raw keys to the application database or browser.

In other words, BYOK support is prepared at the data-model level, but the actual vault implementation is deployment-specific because different installations may use AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, HashiCorp Vault, another KMS-backed service or a private internal vault.

Neither of these two layers blocks the local/self-hosted production pipeline. They matter when Nexora Forge is deployed as a public multi-user commercial service.

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Tool catalog](docs/TOOL_CATALOG.md)
- [Forge Cloud](docs/SAAS.md)
- [Multi-agent production](docs/MULTI_AGENT.md)
- [Production pipeline](docs/PRODUCTION_PIPELINE.md)
- [OpenAI compatibility](docs/OPENAI_COMPATIBILITY.md)
- [Secure MCP Tunnel](docs/SECURE_MCP_TUNNEL.md)
- [OAuth](docs/OAUTH.md)
- [Remote access](docs/REMOTE_ACCESS.md)
- [Public distribution](docs/PUBLIC_DISTRIBUTION.md)

---

## Contributing

Issues and pull requests are welcome.

When contributing, please keep changes scoped, use clear commit messages, preserve the local-only Blender trust boundary and make sure CI remains green.

For new Blender operations, I prefer typed/structured tools over raw Python whenever possible.

---

## Credits & contact

**Owner / Maintainer:** [Ghost Developer](https://github.com/Gh0stDeveloper)  
**Source:** [GitHub](https://github.com/Gh0stDeveloper/MCP-Blender)  
**Email:** [ghostnexora@gmail.com](mailto:ghostnexora@gmail.com)  
**Telegram:** [@Gh0stDeveloper](https://t.me/Gh0stDeveloper)

---

## License

I release Nexora Forge under the [MIT License](LICENSE).

<div align="center">

**Nexora Forge — AI-native 3D production for Blender.**

</div>
