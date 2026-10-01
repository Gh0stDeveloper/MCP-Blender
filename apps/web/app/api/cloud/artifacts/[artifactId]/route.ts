import { cloudAuthorized } from "@/lib/forge-cloud/auth";
import { query } from "@/lib/forge-cloud/db";
import { getObject } from "@/lib/forge-cloud/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  if (!cloudAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { artifactId } = await params;
  const rows = await query<{
    storage_key: string;
    content_type: string;
    filename: string;
  }>(
    "select storage_key, content_type, filename from job_artifacts where id=$1 limit 1",
    [artifactId],
  );
  const artifact = rows[0];
  if (!artifact) return Response.json({ error: "artifact_not_found" }, { status: 404 });
  const bytes = await getObject(artifact.storage_key);
  return new Response(bytes, {
    headers: {
      "Content-Type": artifact.content_type,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${artifact.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
