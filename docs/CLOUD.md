# Nexora Forge Cloud

Nexora Forge Cloud is the optional **local/private collaboration and orchestration layer** above the local Nexora Forge MCP worker.

It is intended to be run by the same user or team that owns the Blender workstations and project data. It is not designed as a public managed service.

## Implemented

The current control plane includes:

- organizations, members and projects;
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
- Cloud bootstrap and pipeline diagnostic console.

The Blender workstation remains the execution worker. Forge Cloud never exposes the local Blender bridge.

## End-to-end flow

```text
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

For a single machine or small local setup:

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

AI provider credentials stay on the server side and are never returned by the model catalog endpoint.

For a simple local installation, provider keys can be supplied through environment variables.

The `provider_connections.secret_ref` field is available for teams that choose to connect their own private secret-management system, but no external vault service is required for the normal local workflow.

## Network model

The recommended setup is:

```text
Trusted local/private network
        │
        ├── Forge Cloud / PostgreSQL / Storage
        │
        ├── Device Agent A → local Blender A
        │
        ├── Device Agent B → local Blender B
        │
        └── Device Agent C → local Blender C
```

Device Agents make outbound requests to the control plane. Blender itself stays behind the loopback-only bridge on each workstation.

If remote access is needed, use a private tunnel or another authenticated transport without changing the local Blender trust boundary.
