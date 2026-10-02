import {
  actorCan,
  authorizeCloudRequest,
  actorUserId,
} from "@/lib/forge-cloud/auth";
import {
  createDevicePairingCode,
  memberExists,
} from "@/lib/forge-cloud/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await authorizeCloudRequest(request);
  if (!actor || !actorCan(actor, ["owner", "admin", "lead", "artist"])) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as {
    organizationId?: string;
    ownerUserId?: string;
    ttlSeconds?: number;
  };

  const organizationId =
    actor.kind === "member" ? actor.organizationId : body.organizationId;
  const ownerUserId =
    actor.kind === "member" ? actor.userId : body.ownerUserId;

  if (!organizationId || !ownerUserId) {
    return Response.json({ error: "organizationId and ownerUserId are required" }, { status: 400 });
  }
  if (!(await memberExists(organizationId, ownerUserId))) {
    return Response.json({ error: "member_not_found" }, { status: 404 });
  }

  const createdBy = actor.kind === "member" ? actor.userId : actorUserId(actor, ownerUserId);
  const result = await createDevicePairingCode({
    organizationId,
    ownerUserId,
    createdBy,
    ttlSeconds: body.ttlSeconds,
  });
  return Response.json(result, { status: 201 });
}
