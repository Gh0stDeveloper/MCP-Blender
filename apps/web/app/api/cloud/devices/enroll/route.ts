import {
  actorCan,
  actorUserId,
  authorizeCloudRequest,
} from "@/lib/forge-cloud/auth";
import { enrollDevice } from "@/lib/forge-cloud/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await authorizeCloudRequest(request);
  if (!actor || !actorCan(actor, ["owner", "admin", "lead", "artist"])) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = (await request.json()) as {
      organizationId?: string;
      ownerUserId?: string;
      name?: string;
    };
    const organizationId =
      actor.kind === "member" ? actor.organizationId : body.organizationId;
    const ownerUserId =
      actor.kind === "member" ? actor.userId : actorUserId(actor, body.ownerUserId);
    if (!organizationId || !body.name?.trim()) {
      return Response.json(
        { error: "organizationId and name are required" },
        { status: 400 },
      );
    }
    const result = await enrollDevice({
      organizationId,
      ownerUserId,
      name: body.name,
    });
    return Response.json({
      ...result,
      warning: "The device token is shown once. Pairing codes are preferred for normal setup.",
    }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "device_enrollment_failed" },
      { status: 400 },
    );
  }
}
