import { cloudAuthorized } from "@/lib/forge-cloud/auth";
import { query } from "@/lib/forge-cloud/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  if (!cloudAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { assetId } = await params;
  const versions = await query(
    `select id, version_number, checksum_sha256, source_job_id,
            preview_storage_key, created_by, created_at
       from asset_versions
      where asset_id=$1 order by version_number desc`,
    [assetId],
  );
  return Response.json({ versions });
}
