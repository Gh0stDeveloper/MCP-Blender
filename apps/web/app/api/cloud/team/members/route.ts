import { randomUUID } from "node:crypto";

import {
  actorCan,
  authorizeCloudRequest,
  type TeamRole,
} from "@/lib/forge-cloud/auth";
import {
  issueOrganizationMember,
  listOrganizationMembers,
  revokeOrganizationMember,
} from "@/lib/forge-cloud/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASSIGNABLE_ROLES = new Set<TeamRole>(["admin", "lead", "artist", "reviewer", "viewer"]);

function organizationFor(
  actor: Awaited<ReturnType<typeof authorizeCloudRequest>>,
  explicit?: string,
): string | null {
  if (!actor) return null;
  if (actor.kind === "member") return actor.organizationId;
  return explicit ?? null;
}

export async function GET(request: Request) {
  const actor = await authorizeCloudRequest(request);
  if (!actor || !actorCan(actor, ["owner", "admin"])) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const organizationId = organizationFor(actor, url.searchParams.get("organizationId") ?? undefined);
  if (!organizationId) return Response.json({ error: "organizationId is required" }, { status: 400 });
  return Response.json({ members: await listOrganizationMembers(organizationId) });
}

export async function POST(request: Request) {
  const actor = await authorizeCloudRequest(request);
  if (!actor || !actorCan(actor, ["owner", "admin"])) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as {
    organizationId?: string;
    displayName?: string;
    role?: TeamRole;
    userId?: string;
  };
  const organizationId = organizationFor(actor, body.organizationId);
  if (!organizationId || !body.displayName?.trim() || !body.role || !ASSIGNABLE_ROLES.has(body.role)) {
    return Response.json(
      { error: "organizationId, displayName and assignable role are required" },
      { status: 400 },
    );
  }
  const result = await issueOrganizationMember({
    organizationId,
    displayName: body.displayName,
    role: body.role,
    userId: body.userId ?? randomUUID(),
  });
  return Response.json({
    ...result,
    warning: "The member token is shown once. Store it on the member workstation.",
  }, { status: 201 });
}

export async function DELETE(request: Request) {
  const actor = await authorizeCloudRequest(request);
  if (!actor || !actorCan(actor, ["owner", "admin"])) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as { organizationId?: string; userId?: string };
  const organizationId = organizationFor(actor, body.organizationId);
  if (!organizationId || !body.userId) {
    return Response.json({ error: "organizationId and userId are required" }, { status: 400 });
  }
  const removed = await revokeOrganizationMember(organizationId, body.userId);
  return Response.json({ ok: removed });
}
