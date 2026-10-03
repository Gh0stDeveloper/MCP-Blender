import { actorCan, authorizeCloudRequest } from "@/lib/forge-cloud/auth";
import { query } from "@/lib/forge-cloud/db";
import { listOrganizationMembers } from "@/lib/forge-cloud/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await authorizeCloudRequest(request);
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (actor.kind === "admin") {
    return Response.json({
      actor: { kind: "admin", role: "owner" },
      organization: null,
      projects: [],
      assets: [],
      devices: [],
      members: [],
    });
  }

  const organizations = await query<{ id: string; slug: string; name: string }>(
    "select id, slug, name from organizations where id=$1 limit 1",
    [actor.organizationId],
  );
  const projects = await query<{ id: string; name: string; slug: string }>(
    `select id, name, slug from projects
      where organization_id=$1 order by created_at asc`,
    [actor.organizationId],
  );
  const assets = await query<{
    id: string;
    project_id: string;
    name: string;
    asset_type: string;
  }>(
    `select a.id, a.project_id, a.name, a.asset_type
       from assets a
       join projects p on p.id=a.project_id
      where p.organization_id=$1
      order by a.created_at desc limit 250`,
    [actor.organizationId],
  );
  const devices = await query<{
    id: string;
    owner_user_id: string;
    name: string;
    status: string;
    blender_version: string | null;
    agent_version: string | null;
    last_seen_at: string | null;
  }>(
    `select id, owner_user_id, name, status, blender_version,
            agent_version, last_seen_at
       from devices
      where organization_id=$1 and revoked_at is null
      order by created_at asc`,
    [actor.organizationId],
  );
  const members = actorCan(actor, ["owner", "admin"])
    ? await listOrganizationMembers(actor.organizationId)
    : [];

  return Response.json({
    actor: {
      kind: actor.kind,
      userId: actor.userId,
      role: actor.role,
    },
    organization: organizations[0] ?? null,
    projects,
    assets,
    devices,
    members,
  });
}
