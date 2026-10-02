# Nexora Forge Cloud

Nexora Forge Cloud is the optional **local/private collaboration and orchestration layer** above the local Nexora Forge MCP worker.

It is intended to be run by the same user or team that owns the Blender workstations and project data. It is not designed as a public managed service.

## Recommended setup

The normal Team Host installation is now handled by the local installer:

```bash
nexora-forge setup --mode team-host
nexora-forge start
```

The installer prepares the private PostgreSQL service, applies database migrations, creates the first organization/project, builds the web control center, configures local storage and pairs the host workstation.

See [INSTALLER.md](INSTALLER.md).

## Implemented

The current control plane includes:

- organizations, members and projects;
- private member access tokens;
- enforced team roles;
- one-time device pairing codes;
- enrolled Blender workstations;
- one-time Device Agent tokens stored only as hashes server-side;
- multi-provider/multi-model Agent Teams;
- coordinator → parallel specialists → reviewer orchestration;
- PostgreSQL durable jobs;
- atomic job leasing with `FOR UPDATE SKIP LOCKED`;
- lease heartbeat and expiry recovery;
- lease-based asset locking;
- local or S3-compatible object storage;
- uploaded `.blend`, export, preview and log artifacts;
- human review UI;
- approve / reject / request-changes decisions;
- immutable asset version promotion after approval;
- authenticated artifact retrieval;
- workspace discovery without exposing internal IDs to users.

The Blender workstation remains the execution worker. Forge Cloud never exposes the local Blender bridge.

## Team roles

The private control plane enforces these roles:

| Role | Main permissions |
| --- | --- |
| Owner | Full organization control |
| Admin | Members, devices and production operations |
| Lead | Production coordination, jobs, locks and review |
| Artist | Production jobs, own device pairing and asset locks |
| Reviewer | Read access plus human approval decisions |
| Viewer | Read-only access |

Role checks are performed by the API, not only by the web UI.

## Adding a member

An owner/admin can create a member from the CLI:

```bash
nexora-forge member add --name "Animator" --role artist
```

The command returns a short-lived one-time code:

```text
NXR-ABCD-EFGH-JKLM
```

The member joins from their own workstation:

```bash
nexora-forge setup \
  --mode join-team \
  --server http://TEAM-HOST:3000 \
  --code NXR-ABCD-EFGH-JKLM
```

The pairing redemption generates both the private member token and Device Agent token automatically.

## Pairing an additional workstation

A member can create a pairing code for another workstation they own:

```bash
nexora-forge pair
```

Codes expire automatically and can be used only once.

## End-to-end flow

```text
Member / Agent Team
  ↓
Asset lock
  ↓
Queue job
  ↓
Device Agent leases job
  ↓
Blender executes locally
  ↓
Device heartbeat renews lease
  ↓
.blend checkpoint + exports + preview
  ↓
Object storage
  ↓
awaiting_approval
  ↓
Human reviewer
  ├─ approve → asset_versions vN
  ├─ changes → job queue
  └─ reject → closed + lock released
```

See [PRODUCTION_PIPELINE.md](PRODUCTION_PIPELINE.md) for operational details.

## Storage

For a single machine or normal Team Host setup:

```env
NEXORA_STORAGE_DRIVER=local
NEXORA_STORAGE_ROOT=.nexora-storage
```

For a larger private team installation, the same control plane can use a private S3-compatible bucket:

```env
NEXORA_STORAGE_DRIVER=s3
NEXORA_S3_BUCKET=nexora-forge
NEXORA_S3_ENDPOINT=...
NEXORA_S3_ACCESS_KEY_ID=...
NEXORA_S3_SECRET_ACCESS_KEY=...
```

This can point to AWS S3, Cloudflare R2, MinIO or another S3-compatible service controlled by the team.

## Credentials

AI provider credentials stay on the Team Host and are never returned by the model catalog endpoint.

For a normal local installation, provider keys can be supplied through environment variables.

The `provider_connections.secret_ref` field is available for teams that choose to connect their own private secret-management system, but no external vault service is required for the local workflow.

Private member tokens use the `nfu_` prefix. Device Agent tokens use the `nfd_` prefix. Only hashes are stored in PostgreSQL.

## Network model

The recommended setup is:

```text
Trusted local/private network
        │
        ├── Team Host
        │    ├── Forge Cloud
        │    ├── PostgreSQL
        │    └── Storage
        │
        ├── Device Agent A → local Blender A
        ├── Device Agent B → local Blender B
        └── Device Agent C → local Blender C
```

Device Agents make outbound requests to the Team Host. Blender itself stays behind the loopback-only bridge on each workstation.

If remote access is needed, use a private VPN/tunnel or another authenticated transport without changing the local Blender trust boundary.

## Manual database setup

The installer is preferred, but custom PostgreSQL deployments can apply the migrations manually:

```bash
psql "$DATABASE_URL" -f deploy/postgres/001_forge_cloud.sql
psql "$DATABASE_URL" -f deploy/postgres/002_production_pipeline.sql
psql "$DATABASE_URL" -f deploy/postgres/003_local_team_access.sql
```
