import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { hashToken, issueDeviceToken, type DeviceIdentity } from "./auth";
import { query, transaction } from "./db";

export type ExecutionStep = {
  operation: string;
  params?: Record<string, unknown>;
};

const ALLOWED_OPERATIONS = new Set([
  "system.status",
  "scene.snapshot",
  "scene.save",
  "scene.new",
  "object.create_primitive",
  "object.transform",
  "object.delete",
  "object.duplicate",
  "material.create",
  "material.assign",
  "modifier.add",
  "light.create",
  "camera.create",
  "animation.keyframe_insert",
  "render.preview",
  "io.import",
  "io.export",
  "mesh.create",
  "uv.smart_project",
  "armature.create",
  "armature.add_bone",
  "rig.parent_auto_weights",
  "batch.execute",
]);

export function validateExecutionPlan(value: unknown): ExecutionStep[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error("executionPlan must contain between 1 and 100 steps");
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`executionPlan[${index}] must be an object`);
    }
    const raw = item as { operation?: unknown; params?: unknown };
    const operation = typeof raw.operation === "string" ? raw.operation : "";
    if (!ALLOWED_OPERATIONS.has(operation)) {
      throw new Error(`operation is not allowed in cloud jobs: ${operation}`);
    }
    if (raw.params !== undefined && (!raw.params || typeof raw.params !== "object" || Array.isArray(raw.params))) {
      throw new Error(`executionPlan[${index}].params must be an object`);
    }
    return { operation, params: (raw.params ?? {}) as Record<string, unknown> };
  });
}

export async function enrollDevice(input: {
  organizationId: string;
  ownerUserId: string;
  name: string;
}): Promise<{ deviceId: string; enrollmentPublicId: string; token: string }> {
  const token = issueDeviceToken();
  const enrollmentPublicId = `nfd_${randomBytes(12).toString("hex")}`;
  const rows = await query<{ id: string }>(
    `insert into devices (
       organization_id, owner_user_id, name, enrollment_public_id,
       status, auth_token_hash, agent_version
     ) values ($1,$2,$3,$4,'offline',$5,'0.1.0')
     returning id`,
    [
      input.organizationId,
      input.ownerUserId,
      input.name.trim(),
      enrollmentPublicId,
      hashToken(token),
    ],
  );
  return { deviceId: rows[0].id, enrollmentPublicId, token };
}

export async function enqueueJob(input: {
  projectId: string;
  requestedBy: string;
  assetId?: string | null;
  targetDeviceId?: string | null;
  task: string;
  executionPlan: ExecutionStep[];
  requireApproval?: boolean;
}): Promise<{ jobId: string }> {
  const rows = await query<{ id: string }>(
    `insert into jobs (
       project_id, requested_by, asset_id, target_device_id, status,
       task, execution_plan, require_approval
     ) values ($1,$2,$3,$4,'waiting_device',$5,$6::jsonb,$7)
     returning id`,
    [
      input.projectId,
      input.requestedBy,
      input.assetId ?? null,
      input.targetDeviceId ?? null,
      input.task.trim(),
      JSON.stringify(input.executionPlan),
      input.requireApproval ?? true,
    ],
  );
  return { jobId: rows[0].id };
}

async function upsertJobAssetLock(
  client: PoolClient,
  assetId: string,
  requestedBy: string,
  deviceId: string,
  leaseSeconds: number,
): Promise<void> {
  const result = await client.query(
    `insert into asset_locks (asset_id, locked_by, device_id, lease_expires_at)
     values ($1,$2,$3,now() + ($4 || ' seconds')::interval)
     on conflict (asset_id) do update
       set locked_by = excluded.locked_by,
           device_id = excluded.device_id,
           lease_expires_at = excluded.lease_expires_at,
           created_at = now()
     where asset_locks.lease_expires_at <= now()
        or asset_locks.locked_by = excluded.locked_by`,
    [assetId, requestedBy, deviceId, leaseSeconds],
  );
  if (result.rowCount !== 1) throw new Error("asset is locked by another user");
}

export async function leaseNextJob(
  device: DeviceIdentity,
  capabilities: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const leaseSeconds = Math.max(60, Math.min(Number(process.env.NEXORA_JOB_LEASE_SECONDS ?? "900"), 3600));
  return transaction(async (client) => {
    await client.query(
      `update devices
          set status='online', capabilities=$2::jsonb,
              last_seen_at=now(), last_heartbeat_at=now()
        where id=$1`,
      [device.id, JSON.stringify(capabilities)],
    );

    const candidate = await client.query<{
      id: string;
      project_id: string;
      requested_by: string;
      asset_id: string | null;
      task: string;
      execution_plan: ExecutionStep[];
      require_approval: boolean;
    }>(
      `select j.id, j.project_id, j.requested_by, j.asset_id, j.task,
              j.execution_plan, j.require_approval
         from jobs j
         join projects p on p.id=j.project_id
        where p.organization_id=$1
          and j.status in ('queued','waiting_device','changes_requested')
          and (j.target_device_id is null or j.target_device_id=$2)
          and (j.lease_expires_at is null or j.lease_expires_at <= now())
          and (
            j.asset_id is null
            or not exists (
              select 1 from asset_locks l
               where l.asset_id=j.asset_id
                 and l.lease_expires_at > now()
                 and l.locked_by <> j.requested_by
            )
          )
        order by j.created_at asc
        for update skip locked
        limit 1`,
      [device.organizationId, device.id],
    );
    const job = candidate.rows[0];
    if (!job) return null;

    if (job.asset_id) {
      await upsertJobAssetLock(client, job.asset_id, job.requested_by, device.id, leaseSeconds * 2);
    }

    const leaseToken = randomUUID();
    await client.query(
      `update jobs
          set status='running', leased_by_device_id=$2,
              lease_token_hash=$3,
              lease_expires_at=now() + ($4 || ' seconds')::interval,
              started_at=coalesce(started_at, now()),
              attempt_count=attempt_count+1
        where id=$1`,
      [job.id, device.id, hashToken(leaseToken), leaseSeconds],
    );
    await client.query("update devices set status='busy' where id=$1", [device.id]);

    return {
      id: job.id,
      projectId: job.project_id,
      assetId: job.asset_id,
      task: job.task,
      executionPlan: job.execution_plan,
      requireApproval: job.require_approval,
      leaseToken,
      leaseSeconds,
    };
  });
}

export async function heartbeatLease(
  device: DeviceIdentity,
  jobId: string,
  leaseToken: string,
): Promise<boolean> {
  const leaseSeconds = Math.max(60, Math.min(Number(process.env.NEXORA_JOB_LEASE_SECONDS ?? "900"), 3600));
  const rows = await query<{ asset_id: string | null; requested_by: string }>(
    `update jobs
        set lease_expires_at=now() + ($4 || ' seconds')::interval
      where id=$1 and leased_by_device_id=$2 and lease_token_hash=$3 and status='running'
      returning asset_id, requested_by`,
    [jobId, device.id, hashToken(leaseToken), leaseSeconds],
  );
  const job = rows[0];
  if (!job) return false;
  await query(
    "update devices set status='busy', last_seen_at=now(), last_heartbeat_at=now() where id=$1",
    [device.id],
  );
  if (job.asset_id) {
    await query(
      `update asset_locks
          set lease_expires_at=now() + ($3 || ' seconds')::interval
        where asset_id=$1 and locked_by=$2`,
      [job.asset_id, job.requested_by, leaseSeconds * 2],
    );
  }
  return true;
}

export async function assertJobLease(
  device: DeviceIdentity,
  jobId: string,
  leaseToken: string,
): Promise<{ assetId: string | null }> {
  const rows = await query<{ asset_id: string | null }>(
    `select asset_id from jobs
      where id=$1 and leased_by_device_id=$2 and lease_token_hash=$3
        and status='running' and lease_expires_at > now()
      limit 1`,
    [jobId, device.id, hashToken(leaseToken)],
  );
  if (!rows[0]) throw new Error("job lease is invalid or expired");
  return { assetId: rows[0].asset_id };
}

export async function registerArtifact(input: {
  jobId: string;
  assetId: string | null;
  kind: "preview" | "blend" | "export" | "log";
  storageKey: string;
  contentType: string;
  checksumSha256: string;
  sizeBytes: number;
  filename: string;
}): Promise<string> {
  const rows = await query<{ id: string }>(
    `insert into job_artifacts (
       job_id, asset_id, kind, storage_key, content_type,
       checksum_sha256, size_bytes, filename
     ) values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning id`,
    [
      input.jobId,
      input.assetId,
      input.kind,
      input.storageKey,
      input.contentType,
      input.checksumSha256,
      input.sizeBytes,
      input.filename,
    ],
  );
  return rows[0].id;
}

export async function finishJobExecution(
  device: DeviceIdentity,
  jobId: string,
  leaseToken: string,
  summary: string,
  operationResults: unknown,
): Promise<"awaiting_approval" | "completed"> {
  return transaction(async (client) => {
    const result = await client.query<{
      asset_id: string | null;
      requested_by: string;
      require_approval: boolean;
    }>(
      `update jobs
          set status=case when require_approval then 'awaiting_approval' else 'completed' end,
              result_summary=$4,
              operation_results=$5::jsonb,
              executed_by_device_id=$2,
              leased_by_device_id=null,
              lease_expires_at=null,
              lease_token_hash=null,
              finished_at=case when require_approval then null else now() end
        where id=$1 and leased_by_device_id=$2 and lease_token_hash=$3 and status='running'
        returning asset_id, requested_by, require_approval`,
      [jobId, device.id, hashToken(leaseToken), summary, JSON.stringify(operationResults)],
    );
    const job = result.rows[0];
    if (!job) throw new Error("job lease is invalid or expired");

    if (job.asset_id) {
      if (job.require_approval) {
        const reviewLockSeconds = Math.max(
          300,
          Math.min(Number(process.env.NEXORA_REVIEW_LOCK_SECONDS ?? "86400"), 604800),
        );
        await client.query(
          `update asset_locks
              set device_id=null,
                  lease_expires_at=now() + ($3 || ' seconds')::interval
            where asset_id=$1 and locked_by=$2`,
          [job.asset_id, job.requested_by, reviewLockSeconds],
        );
      } else {
        await client.query("delete from asset_locks where asset_id=$1", [job.asset_id]);
      }
    }

    await client.query(
      "update devices set status='online', last_seen_at=now() where id=$1",
      [device.id],
    );
    return job.require_approval ? "awaiting_approval" : "completed";
  });
}

export async function failJobExecution(
  device: DeviceIdentity,
  jobId: string,
  leaseToken: string,
  error: string,
): Promise<void> {
  await transaction(async (client) => {
    const result = await client.query<{ asset_id: string | null }>(
      `update jobs
          set status='failed', error_message=$4, lease_expires_at=null,
              lease_token_hash=null, executed_by_device_id=$2,
              leased_by_device_id=null, finished_at=now()
        where id=$1 and leased_by_device_id=$2 and lease_token_hash=$3 and status='running'
        returning asset_id`,
      [jobId, device.id, hashToken(leaseToken), error.slice(0, 4000)],
    );
    if (!result.rows[0]) throw new Error("job lease is invalid or expired");
    if (result.rows[0].asset_id) {
      await client.query("delete from asset_locks where asset_id=$1", [result.rows[0].asset_id]);
    }
    await client.query("update devices set status='online', last_seen_at=now() where id=$1", [device.id]);
  });
}

export async function reviewJob(input: {
  jobId: string;
  reviewerUserId: string;
  decision: "approved" | "rejected" | "changes_requested";
  notes: string;
}): Promise<{ versionId?: string; versionNumber?: number }> {
  return transaction(async (client) => {
    const jobResult = await client.query<{
      id: string;
      asset_id: string | null;
      requested_by: string;
    }>(
      "select id, asset_id, requested_by from jobs where id=$1 and status='awaiting_approval' for update",
      [input.jobId],
    );
    const job = jobResult.rows[0];
    if (!job) throw new Error("job is not awaiting approval");

    await client.query(
      `insert into job_reviews (job_id, decision, notes, reviewer_user_id)
       values ($1,$2,$3,$4)
       on conflict (job_id) do update
         set decision=excluded.decision, notes=excluded.notes,
             reviewer_user_id=excluded.reviewer_user_id, reviewed_at=now()`,
      [input.jobId, input.decision, input.notes, input.reviewerUserId],
    );

    if (input.decision === "changes_requested") {
      await client.query(
        `update jobs set status='changes_requested', finished_at=null,
            leased_by_device_id=null where id=$1`,
        [input.jobId],
      );
      return {};
    }

    if (input.decision === "rejected") {
      await client.query("update jobs set status='rejected', finished_at=now() where id=$1", [input.jobId]);
      if (job.asset_id) await client.query("delete from asset_locks where asset_id=$1", [job.asset_id]);
      return {};
    }

    let published: { id: string; version_number: number } | undefined;
    if (job.asset_id) {
      const artifact = await client.query<{
        storage_key: string;
        checksum_sha256: string;
        id: string;
      }>(
        `select id, storage_key, checksum_sha256
           from job_artifacts
          where job_id=$1 and kind in ('blend','export')
          order by case kind when 'blend' then 0 else 1 end, created_at desc
          limit 1`,
        [input.jobId],
      );
      if (!artifact.rows[0]) {
        throw new Error("approved asset job needs a blend or export artifact");
      }
      const version = await client.query<{ id: string; version_number: number }>(
        `insert into asset_versions (
           asset_id, version_number, storage_key, checksum_sha256,
           created_by, source_job_id, preview_storage_key
         )
         select $1,
                coalesce(max(version_number),0)+1,
                $2,$3,$4,$5,
                (select storage_key from job_artifacts where job_id=$5 and kind='preview' order by created_at desc limit 1)
           from asset_versions where asset_id=$1
         returning id, version_number`,
        [
          job.asset_id,
          artifact.rows[0].storage_key,
          artifact.rows[0].checksum_sha256,
          input.reviewerUserId,
          input.jobId,
        ],
      );
      published = version.rows[0];
      await client.query("delete from asset_locks where asset_id=$1", [job.asset_id]);
    }

    await client.query(
      "update jobs set status='completed', finished_at=now() where id=$1",
      [input.jobId],
    );
    return published
      ? { versionId: published.id, versionNumber: published.version_number }
      : {};
  });
}

export async function acquireAssetLock(input: {
  assetId: string;
  userId: string;
  deviceId?: string | null;
  ttlSeconds?: number;
}): Promise<{ leaseExpiresAt: string }> {
  const ttl = Math.max(60, Math.min(input.ttlSeconds ?? 1800, 86400));
  const rows = await query<{ lease_expires_at: string }>(
    `insert into asset_locks (asset_id, locked_by, device_id, lease_expires_at)
     values ($1,$2,$3,now() + ($4 || ' seconds')::interval)
     on conflict (asset_id) do update
       set locked_by=excluded.locked_by, device_id=excluded.device_id,
           lease_expires_at=excluded.lease_expires_at, created_at=now()
     where asset_locks.lease_expires_at <= now()
        or asset_locks.locked_by=excluded.locked_by
     returning lease_expires_at`,
    [input.assetId, input.userId, input.deviceId ?? null, ttl],
  );
  if (!rows[0]) throw new Error("asset is already locked by another user");
  return { leaseExpiresAt: rows[0].lease_expires_at };
}

export async function releaseAssetLock(assetId: string, userId: string): Promise<boolean> {
  const rows = await query<{ asset_id: string }>(
    "delete from asset_locks where asset_id=$1 and locked_by=$2 returning asset_id",
    [assetId, userId],
  );
  return Boolean(rows[0]);
}
