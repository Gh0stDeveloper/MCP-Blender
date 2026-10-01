import { cloudAuthorized } from "../../../../../lib/forge-cloud/auth";
import { enrollDevice } from "../../../../../lib/forge-cloud/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cloudAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      organizationId?: string;
      ownerUserId?: string;
      name?: string;
    };
    if (!body.organizationId || !body.ownerUserId || !body.name?.trim()) {
      return Response.json({ error: "organizationId, ownerUserId and name are required" }, { status: 400 });
    }
    const result = await enrollDevice({
      organizationId: body.organizationId,
      ownerUserId: body.ownerUserId,
      name: body.name,
    });
    return Response.json({
      ...result,
      warning: "The device token is shown once. Store it in the workstation secret store.",
    }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "device_enrollment_failed" },
      { status: 400 },
    );
  }
}
