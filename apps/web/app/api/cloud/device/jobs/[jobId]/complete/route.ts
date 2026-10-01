import { authenticateDevice } from "@/lib/forge-cloud/auth";
import { finishJobExecution } from "@/lib/forge-cloud/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const device = await authenticateDevice(request);
  if (!device) return Response.json({ error: "unauthorized_device" }, { status: 401 });
  const { jobId } = await params;
  const body = (await request.json()) as {
    leaseToken?: string;
    summary?: string;
    operationResults?: unknown;
  };
  if (!body.leaseToken) return Response.json({ error: "leaseToken is required" }, { status: 400 });
  try {
    await finishJobExecution(
      device,
      jobId,
      body.leaseToken,
      body.summary ?? "Device Agent completed the Blender execution plan.",
      body.operationResults ?? [],
    );
    return Response.json({ ok: true, status: "awaiting_approval" });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "job_completion_failed" },
      { status: 409 },
    );
  }
}
