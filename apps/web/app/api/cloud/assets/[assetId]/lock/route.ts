import { cloudAuthorized } from "@/lib/forge-cloud/auth";
import { query } from "@/lib/forge-cloud/db";
import { acquireAssetLock, releaseAssetLock } from "@/lib/forge-cloud/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  if (!cloudAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { assetId } = await params;
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
  if (!cloudAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { assetId } = await params;
  const body = (await request.json()) as {
    userId?: string;
    deviceId?: string | null;
    ttlSeconds?: number;
  };
  if (!body.userId) return Response.json({ error: "userId is required" }, { status: 400 });
  try {
    const result = await acquireAssetLock({
      assetId,
      userId: body.userId,
      deviceId: body.deviceId,
      ttlSeconds: body.ttlSeconds,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "lock_failed" },
      { status: 409 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  if (!cloudAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { assetId } = await params;
  const body = (await request.json()) as { userId?: string };
  if (!body.userId) return Response.json({ error: "userId is required" }, { status: 400 });
  const released = await releaseAssetLock(assetId, body.userId);
  return Response.json({ ok: released });
}
