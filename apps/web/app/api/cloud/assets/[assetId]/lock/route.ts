import {
  actorUserId,
  assertAssetAccess,
  authorizeCloudRequest,
} from "@/lib/forge-cloud/auth";
import { query } from "@/lib/forge-cloud/db";
import { acquireAssetLock, releaseAssetLock } from "@/lib/forge-cloud/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const actor = await authorizeCloudRequest(request);
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { assetId } = await params;
  try {
    await assertAssetAccess(actor, assetId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "forbidden";
    return Response.json({ error: message }, { status: message === "forbidden" ? 403 : 404 });
  }
  const rows = await query(
    `select l.asset_id, l.locked_by, l.device_id, l.lease_expires_at, l.created_at,
            d.name as device_name
       from asset_locks l
       left join devices d on d.id=l.device_id
      where l.asset_id=$1 and l.lease_expires_at > now()`,
    [assetId],
  );
  return Response.json({ lock: rows[0] ?? null });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const actor = await authorizeCloudRequest(request);
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { assetId } = await params;
  const body = (await request.json()) as {
    userId?: string;
    deviceId?: string | null;
    ttlSeconds?: number;
  };
  try {
    await assertAssetAccess(actor, assetId, ["owner", "admin", "lead", "artist"]);
    const userId = actorUserId(actor, body.userId);
    const result = await acquireAssetLock({
      assetId,
      userId,
      deviceId: body.deviceId,
      ttlSeconds: body.ttlSeconds,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "lock_failed";
    const status = message === "forbidden" ? 403 : message.endsWith("_not_found") ? 404 : 409;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const actor = await authorizeCloudRequest(request);
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { assetId } = await params;
  const body = (await request.json()) as { userId?: string };
  try {
    await assertAssetAccess(actor, assetId, ["owner", "admin", "lead", "artist"]);
    const userId = actorUserId(actor, body.userId);
    const released = await releaseAssetLock(assetId, userId);
    return Response.json({ ok: released });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unlock_failed";
    return Response.json({ error: message }, { status: message === "forbidden" ? 403 : 409 });
  }
}
