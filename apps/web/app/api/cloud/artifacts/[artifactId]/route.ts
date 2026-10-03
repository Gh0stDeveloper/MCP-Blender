import { assertArtifactAccess, authorizeCloudRequest } from "@/lib/forge-cloud/auth";
import { query } from "@/lib/forge-cloud/db";
import { getObject } from "@/lib/forge-cloud/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const actor = await authorizeCloudRequest(request);
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { artifactId } = await params;
  try {
    await assertArtifactAccess(actor, artifactId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "forbidden";
    return Response.json({ error: message }, { status: message === "forbidden" ? 403 : 404 });
  }
  const rows = await query<{
    storage_key: string;
    content_type: string;
    filename: string;
  }>(
    "select storage_key, content_type, filename from job_artifacts where id=$1 limit 1",
    [artifactId],
  );
  const stored = rows[0];
  if (!stored) return Response.json({ error: "artifact_not_found" }, { status: 404 });
  const bytes = await getObject(stored.storage_key);
  const body = Uint8Array.from(bytes).buffer;
  return new Response(body, {
    headers: {
      "Content-Type": stored.content_type,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${stored.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
