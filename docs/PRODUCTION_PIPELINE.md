# Production pipeline

This document describes the durable path from a human/AI production request to an approved versioned Blender asset.

## State machine

```text
waiting_device
      │
      ▼
   running  ← lease heartbeat
      │
      ├── failure ───────────────► failed
      │
      ▼
awaiting_approval
      │
      ├── approved ──────────────► completed + asset version
      ├── changes_requested ─────► changes_requested → next device lease
      └── rejected ──────────────► rejected
```

## Asset locking

`asset_locks` contains one active lock per asset.

A lock has:

- `locked_by`
- optional `device_id`
- `lease_expires_at`

A user can renew their own lock. Another user cannot acquire it until the lease expires or the owner releases it.

When a Device Agent leases a job linked to an asset, Cloud obtains/renews the asset lock for the job requester.

## Job leasing

Eligible Device Agents poll `POST /api/cloud/device/lease`.

Cloud selects work in a PostgreSQL transaction using `FOR UPDATE SKIP LOCKED`. This prevents two devices from claiming the same row.

A successful lease records:

- `leased_by_device_id`
- SHA-256 hash of an ephemeral `leaseToken`
- `lease_expires_at`
- attempt count

Only the device holding the valid lease token can heartbeat, upload artifacts, complete or fail the job.

## Blender execution

The Device Agent receives only allowlisted structured operations. Raw `python.execute` is intentionally not accepted by Cloud jobs.

The Agent talks to the Blender extension at `127.0.0.1:9876`, using the local bridge secret.

After the requested operations it automatically:

1. saves `cloud/jobs/<jobId>/scene.blend`;
2. creates a preview if the plan did not already generate one;
3. uploads recognized output files;
4. submits operation results to Cloud.

## Object storage

Artifacts are private and keyed under the job.

Supported kinds:

- `preview`
- `blend`
- `export`
- `log`

Storage drivers:

- local filesystem;
- S3-compatible object storage.

The database stores storage keys and SHA-256 checksums, not file blobs.

## Human approval

Human review is available at:

```text
/cloud/review/<jobId>
```

Approval requires a Cloud-authorized request and a reviewer user UUID.

### Approve

Cloud selects the latest `.blend` artifact first, falling back to an export artifact, allocates the next `asset_versions.version_number`, attaches the latest preview, completes the job and releases the asset lock.

### Request changes

No version is published. The job returns to the eligible device queue and can be leased again.

### Reject

No version is published. The job is closed and the asset lock is released.

## Recovery

Job leases expire automatically. If a Device Agent crashes and stops heartbeating, the same job can later be claimed again by an eligible device.

Asset locks are leases rather than permanent flags, preventing abandoned clients from locking an asset forever.
