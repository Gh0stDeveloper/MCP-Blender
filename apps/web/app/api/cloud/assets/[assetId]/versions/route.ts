import { assertAssetAccess, authorizeCloudRequest } from "@/lib/forge-cloud/auth";
import { query } from "@/lib/forge-cloud/db";

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
  const versions = await query(
    `select id, version_number, checksum_sha256, source_job_id,
            preview_storage_key, created_by, created_at
       from asset_versions
      where asset_id=$1 order by version_number desc`,
    [assetId],
  );
  return Response.json({ versions });
}
