import { randomUUID } from "node:crypto";

import { authenticateDevice } from "@/lib/forge-cloud/auth";
import { assertJobLease, registerArtifact } from "@/lib/forge-cloud/pipeline";
import { putObject } from "@/lib/forge-cloud/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["preview", "blend", "export", "log"]);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const device = await authenticateDevice(request);
  if (!device) return Response.json({ error: "unauthorized_device" }, { status: 401 });
  const { jobId } = await params;
  const leaseToken = request.headers.get("x-nexora-lease-token") ?? "";
  if (!leaseToken) return Response.json({ error: "missing lease token" }, { status: 400 });

  try {
    const lease = await assertJobLease(device, jobId, leaseToken);
    const kind = request.headers.get("x-nexora-artifact-kind") ?? "";
    if (!KINDS.has(kind)) return Response.json({ error: "invalid artifact kind" }, { status: 400 });

    const filename = (request.headers.get("x-nexora-filename") ?? `${kind}.bin`)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 180);
    const contentType = request.headers.get("content-type") ?? "application/octet-stream";
    const bytes = new Uint8Array(await request.arrayBuffer());
    const max = Number(process.env.NEXORA_MAX_ARTIFACT_BYTES ?? String(100 * 1024 * 1024));
    if (bytes.byteLength === 0 || bytes.byteLength > max) {
      return Response.json({ error: "artifact size is invalid" }, { status: 413 });
    }

    const key = `jobs/${jobId}/${randomUUID()}-${filename}`;
    const stored = await putObject(key, bytes, contentType);
    const artifactId = await registerArtifact({
      jobId,
      assetId: lease.assetId,
      kind: kind as "preview" | "blend" | "export" | "log",
      storageKey: stored.key,
      contentType,
      checksumSha256: stored.checksumSha256,
      sizeBytes: stored.sizeBytes,
      filename,
    });
    return Response.json({ artifactId, ...stored }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "artifact_upload_failed" },
      { status: 409 },
    );
  }
}
