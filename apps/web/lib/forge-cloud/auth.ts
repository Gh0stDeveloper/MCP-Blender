import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { query } from "./db";

export type TeamRole = "owner" | "admin" | "lead" | "artist" | "reviewer" | "viewer";

export type CloudActor =
  | { kind: "admin"; userId: null; organizationId: null; role: "owner" }
  | { kind: "member"; userId: string; organizationId: string; role: TeamRole };

export type DeviceIdentity = {
  id: string;
  organizationId: string;
  ownerUserId: string;
  status: string;
};

export function issueDeviceToken(): string {
  return `nfd_${randomBytes(36).toString("base64url")}`;
}

export function issueMemberToken(): string {
  return `nfu_${randomBytes(36).toString("base64url")}`;
}

export function issuePairingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  const chunks: string[] = [];
  for (let group = 0; group < 3; group += 1) {
    let chunk = "";
    for (let index = 0; index < 4; index += 1) {
      chunk += alphabet[bytes[group * 4 + index] % alphabet.length];
    }
    chunks.push(chunk);
  }
  return `NXR-${chunks.join("-")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function secureBearerEquals(header: string, token: string): boolean {
  const expected = `Bearer ${token}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cloudAuthorized(request: Request): boolean {
  const expected = process.env.NEXORA_CLOUD_API_TOKEN;
  if (!expected) return process.env.NODE_ENV !== "production";
  return secureBearerEquals(request.headers.get("authorization") ?? "", expected);
}

export async function authorizeCloudRequest(request: Request): Promise<CloudActor | null> {
  const header = request.headers.get("authorization") ?? "";
  const expected = process.env.NEXORA_CLOUD_API_TOKEN;
  if (expected && secureBearerEquals(header, expected)) {
    return { kind: "admin", userId: null, organizationId: null, role: "owner" };
  }
  if (!expected && process.env.NODE_ENV !== "production" && !header) {
    return { kind: "admin", userId: null, organizationId: null, role: "owner" };
  }
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token.startsWith("nfu_")) return null;

  const tokenHash = hashToken(token);
  const rows = await query<{
    user_id: string;
    organization_id: string;
    role: TeamRole;
  }>(
    `select m.user_id, m.organization_id, m.role
       from member_access_tokens t
       join organization_members m
         on m.organization_id=t.organization_id and m.user_id=t.user_id
      where t.token_hash=$1 and t.revoked_at is null
      limit 1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  await query(
    "update member_access_tokens set last_used_at=now() where token_hash=$1",
    [tokenHash],
  );
  return {
    kind: "member",
    userId: row.user_id,
    organizationId: row.organization_id,
    role: row.role,
  };
}

export function actorCan(actor: CloudActor, roles: TeamRole[]): boolean {
  return actor.kind === "admin" || roles.includes(actor.role);
}

export async function assertProjectAccess(
  actor: CloudActor,
  projectId: string,
  roles?: TeamRole[],
): Promise<{ organizationId: string }> {
  const rows = await query<{ organization_id: string }>(
    "select organization_id from projects where id=$1 limit 1",
    [projectId],
  );
  const project = rows[0];
  if (!project) throw new Error("project_not_found");
  if (actor.kind === "member" && actor.organizationId !== project.organization_id) {
    throw new Error("forbidden");
  }
  if (roles && !actorCan(actor, roles)) throw new Error("forbidden");
  return { organizationId: project.organization_id };
}

export async function assertAssetAccess(
  actor: CloudActor,
  assetId: string,
  roles?: TeamRole[],
): Promise<{ organizationId: string; projectId: string }> {
  const rows = await query<{ organization_id: string; project_id: string }>(
    `select p.organization_id, a.project_id
       from assets a join projects p on p.id=a.project_id
      where a.id=$1 limit 1`,
    [assetId],
  );
  const asset = rows[0];
  if (!asset) throw new Error("asset_not_found");
  if (actor.kind === "member" && actor.organizationId !== asset.organization_id) {
    throw new Error("forbidden");
  }
  if (roles && !actorCan(actor, roles)) throw new Error("forbidden");
  return { organizationId: asset.organization_id, projectId: asset.project_id };
}

export async function assertJobAccess(
  actor: CloudActor,
  jobId: string,
  roles?: TeamRole[],
): Promise<{ organizationId: string; projectId: string }> {
  const rows = await query<{ organization_id: string; project_id: string }>(
    `select p.organization_id, j.project_id
       from jobs j join projects p on p.id=j.project_id
      where j.id=$1 limit 1`,
    [jobId],
  );
  const job = rows[0];
  if (!job) throw new Error("job_not_found");
  if (actor.kind === "member" && actor.organizationId !== job.organization_id) {
    throw new Error("forbidden");
  }
  if (roles && !actorCan(actor, roles)) throw new Error("forbidden");
  return { organizationId: job.organization_id, projectId: job.project_id };
}

export async function assertArtifactAccess(
  actor: CloudActor,
  artifactId: string,
): Promise<void> {
  const rows = await query<{ organization_id: string }>(
    `select p.organization_id
       from job_artifacts a
       join jobs j on j.id=a.job_id
       join projects p on p.id=j.project_id
      where a.id=$1 limit 1`,
    [artifactId],
  );
  const artifact = rows[0];
  if (!artifact) throw new Error("artifact_not_found");
  if (actor.kind === "member" && actor.organizationId !== artifact.organization_id) {
    throw new Error("forbidden");
  }
}

export function actorUserId(actor: CloudActor, explicit?: string): string {
  if (actor.kind === "member") return actor.userId;
  if (explicit) return explicit;
  throw new Error("user_identity_required");
}

export async function authenticateDevice(request: Request): Promise<DeviceIdentity | null> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const rows = await query<{
    id: string;
    organization_id: string;
    owner_user_id: string;
    status: string;
  }>(
    `select id, organization_id, owner_user_id, status
       from devices
      where auth_token_hash = $1
        and revoked_at is null
        and status <> 'revoked'
      limit 1`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    status: row.status,
  };
}
