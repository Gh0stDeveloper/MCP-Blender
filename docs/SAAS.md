# Nexora Forge Cloud

Nexora Forge Cloud is the optional collaboration and orchestration layer above the local Nexora Forge MCP worker.

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

The Blender workstation remains the execution worker. Cloud never exposes the local Blender bridge.

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

`NEXORA_STORAGE_DRIVER=local` is intended for local/self-hosted development.

For durable production deployments, use `NEXORA_STORAGE_DRIVER=s3` with a private S3-compatible bucket. The adapter supports configurable region, endpoint, credentials and path-style addressing.

## Credentials

Self-hosted provider credentials are server environment variables and are never returned by the model catalog endpoint.

The database stores only `secret_ref` for provider connections; it does not define a plaintext API-key column.

A public hosted SaaS should connect `secret_ref` to a dedicated encrypted secret manager/KMS.

## Hosted SaaS layers still external

The production pipeline is implemented, but a commercial multi-tenant hosted deployment should additionally integrate:

- user-facing account authentication/OIDC;
- invitation lifecycle and identity-provider mapping;
- encrypted per-organization BYOK secret vault;
- billing, quotas and metering;
- distributed rate limiting;
- email/notification delivery;
- long-term audit retention policy;
- malware/content scanning for uploaded files where appropriate;
- backup/restore and disaster-recovery procedures.

These are deployment/product layers rather than requirements for the self-hosted Cloud control plane.
