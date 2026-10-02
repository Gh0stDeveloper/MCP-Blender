import { randomUUID } from "node:crypto";

import {
  hashToken,
  issueDeviceToken,
  issueMemberToken,
  issuePairingCode,
  type TeamRole,
} from "./auth";
import { query, transaction } from "./db";

export async function issueOrganizationMember(input: {
  organizationId: string;
  displayName: string;
  role: TeamRole;
  userId?: string;
}): Promise<{ userId: string; token: string; role: TeamRole }> {
  const userId = input.userId ?? randomUUID();
  const token = issueMemberToken();
  await query(
    `insert into organization_members (
       organization_id, user_id, role, display_name, auth_token_hash, token_created_at
     ) values ($1,$2,$3,$4,$5,now())
     on conflict (organization_id,user_id) do update
       set role=excluded.role,
           display_name=excluded.display_name,
           auth_token_hash=excluded.auth_token_hash,
           token_created_at=now()`,
    [
      input.organizationId,
      userId,
      input.role,
      input.displayName.trim(),
      hashToken(token),
    ],
  );
  return { userId, token, role: input.role };
}

export async function listOrganizationMembers(organizationId: string) {
  return query<{
    user_id: string;
    role: TeamRole;
    display_name: string | null;
    created_at: string;
    token_created_at: string | null;
  }>(
    `select user_id, role, display_name, created_at, token_created_at
       from organization_members
      where organization_id=$1
      order by created_at asc`,
    [organizationId],
  );
}

export async function revokeOrganizationMember(
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const rows = await query<{ user_id: string }>(
    `delete from organization_members
      where organization_id=$1 and user_id=$2 and role <> 'owner'
      returning user_id`,
    [organizationId, userId],
  );
  return Boolean(rows[0]);
}

export async function createDevicePairingCode(input: {
  organizationId: string;
  ownerUserId: string;
  createdBy: string;
  ttlSeconds?: number;
}): Promise<{ code: string; expiresAt: string }> {
  const ttlSeconds = Math.max(60, Math.min(input.ttlSeconds ?? 600, 3600));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = issuePairingCode();
    try {
      const rows = await query<{ expires_at: string }>(
        `insert into device_pairing_codes (
           organization_id, owner_user_id, created_by, code_hash, expires_at
         ) values ($1,$2,$3,$4,now() + ($5 || ' seconds')::interval)
         returning expires_at`,
        [
          input.organizationId,
          input.ownerUserId,
          input.createdBy,
          hashToken(code),
          ttlSeconds,
        ],
      );
      return { code, expiresAt: rows[0].expires_at };
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new Error("pairing_code_generation_failed");
}

export async function redeemDevicePairingCode(input: {
  code: string;
  deviceName: string;
}): Promise<{
  deviceId: string;
  organizationId: string;
  ownerUserId: string;
  token: string;
}> {
  return transaction(async (client) => {
    const pair = await client.query<{
      id: string;
      organization_id: string;
      owner_user_id: string;
    }>(
      `select id, organization_id, owner_user_id
         from device_pairing_codes
        where code_hash=$1
          and used_at is null
          and expires_at > now()
        for update
        limit 1`,
      [hashToken(input.code.trim().toUpperCase())],
    );
    const row = pair.rows[0];
    if (!row) throw new Error("pairing_code_invalid_or_expired");

    const token = issueDeviceToken();
    const enrollmentPublicId = `nfd_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const device = await client.query<{ id: string }>(
      `insert into devices (
         organization_id, owner_user_id, name, enrollment_public_id,
         status, auth_token_hash, agent_version
       ) values ($1,$2,$3,$4,'offline',$5,'0.2.0')
       returning id`,
      [
        row.organization_id,
        row.owner_user_id,
        input.deviceName.trim(),
        enrollmentPublicId,
        hashToken(token),
      ],
    );
    await client.query(
      "update device_pairing_codes set used_at=now() where id=$1",
      [row.id],
    );
    return {
      deviceId: device.rows[0].id,
      organizationId: row.organization_id,
      ownerUserId: row.owner_user_id,
      token,
    };
  });
}

export async function memberExists(
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const rows = await query<{ user_id: string }>(
    "select user_id from organization_members where organization_id=$1 and user_id=$2 limit 1",
    [organizationId, userId],
  );
  return Boolean(rows[0]);
}
