import { authenticateDevice } from "../../../../../lib/forge-cloud/auth";
import { leaseNextJob } from "../../../../../lib/forge-cloud/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const device = await authenticateDevice(request);
  if (!device) return Response.json({ error: "unauthorized_device" }, { status: 401 });

  let capabilities: Record<string, unknown> = {};
  try {
    const body = (await request.json()) as { capabilities?: Record<string, unknown> };
    capabilities = body.capabilities ?? {};
  } catch {
    // Capabilities are optional for polling.
  }

  try {
    const job = await leaseNextJob(device, capabilities);
    return Response.json({ job });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "lease_failed" },
      { status: 409 },
    );
  }
}
