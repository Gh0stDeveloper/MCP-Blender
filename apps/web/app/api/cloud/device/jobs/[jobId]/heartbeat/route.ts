import { authenticateDevice } from "@/lib/forge-cloud/auth";
import { heartbeatLease } from "@/lib/forge-cloud/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const device = await authenticateDevice(request);
  if (!device) return Response.json({ error: "unauthorized_device" }, { status: 401 });
  const { jobId } = await params;
  const body = (await request.json()) as { leaseToken?: string };
  if (!body.leaseToken) return Response.json({ error: "leaseToken is required" }, { status: 400 });
  const ok = await heartbeatLease(device, jobId, body.leaseToken);
  return ok
    ? Response.json({ ok: true })
    : Response.json({ error: "lease_expired" }, { status: 409 });
}
