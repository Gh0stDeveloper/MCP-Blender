import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { query } from "./db";

export type DeviceIdentity = {
  id: string;
  organizationId: string;
  ownerUserId: string;
  status: string;
};

export function cloudAuthorized(request: Request): boolean {
  const expected = process.env.NEXORA_CLOUD_API_TOKEN;
  if (!expected) return process.env.NODE_ENV !== "production";
  const supplied = request.headers.get("authorization") ?? "";
  const expectedHeader = `Bearer ${expected}`;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expectedHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueDeviceToken(): string {
  return `nfd_${randomBytes(36).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
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
