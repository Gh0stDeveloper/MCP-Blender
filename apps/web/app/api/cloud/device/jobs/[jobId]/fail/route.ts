import { authenticateDevice } from "@/lib/forge-cloud/auth";
import { failJobExecution } from "@/lib/forge-cloud/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const device = await authenticateDevice(request);
  if (!device) return Response.json({ error: "unauthorized_device" }, { status: 401 });
  const { jobId } = await params;
  const body = (await request.json()) as { leaseToken?: string; error?: string };
  if (!body.leaseToken) return Response.json({ error: "leaseToken is required" }, { status: 400 });
  try {
    await failJobExecution(device, jobId, body.leaseToken, body.error ?? "Device Agent failed.");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "job_failure_update_failed" },
      { status: 409 },
    );
  }
}
