import { cloudAuthorized, hashToken, issueMemberToken } from "@/lib/forge-cloud/auth";
import { transaction } from "@/lib/forge-cloud/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function POST(request: Request) {
  if (!cloudAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as {
      ownerUserId?: string;
      organizationName?: string;
      organizationSlug?: string;
      projectName?: string;
      projectSlug?: string;
      assetName?: string;
      assetType?: string;
    };
    if (!body.ownerUserId || !body.organizationName?.trim() || !body.projectName?.trim()) {
      return Response.json(
        { error: "ownerUserId, organizationName and projectName are required" },
        { status: 400 },
      );
    }

    const organizationName = body.organizationName.trim();
    const projectName = body.projectName.trim();
    const ownerUserId = body.ownerUserId;

    const result = await transaction(async (client) => {
      const orgSlug = slug(body.organizationSlug || organizationName);
      const projectSlug = slug(body.projectSlug || projectName);
      if (!orgSlug || !projectSlug) throw new Error("organization/project slug is invalid");

      const org = await client.query<{ id: string }>(
        `insert into organizations (slug, name)
         values ($1,$2)
         on conflict (slug) do update set name=excluded.name
         returning id`,
        [orgSlug, organizationName],
      );
      const organizationId = org.rows[0].id;

      const ownerToken = issueMemberToken();
      await client.query(
        `insert into organization_members (
           organization_id, user_id, role, display_name, token_created_at
         )
         values ($1,$2,'owner',$3,now())
         on conflict (organization_id,user_id) do update
           set role='owner',
               display_name=excluded.display_name,
               token_created_at=now()`,
        [organizationId, ownerUserId, "Owner"],
      );
      await client.query(
        `insert into member_access_tokens (
           organization_id, user_id, token_hash, label
         ) values ($1,$2,$3,'bootstrap-owner')`,
        [organizationId, ownerUserId, hashToken(ownerToken)],
      );

      const project = await client.query<{ id: string }>(
        `insert into projects (organization_id, name, slug, created_by)
         values ($1,$2,$3,$4)
         on conflict (organization_id,slug) do update set name=excluded.name
         returning id`,
        [organizationId, projectName, projectSlug, ownerUserId],
      );
      const projectId = project.rows[0].id;

      let assetId: string | null = null;
      if (body.assetName?.trim()) {
        const asset = await client.query<{ id: string }>(
          `insert into assets (project_id, asset_type, name, created_by)
           values ($1,$2,$3,$4) returning id`,
          [projectId, body.assetType?.trim() || "generic", body.assetName.trim(), ownerUserId],
        );
        assetId = asset.rows[0].id;
      }

      return { organizationId, projectId, assetId, ownerToken };
    });
    return Response.json({
      ...result,
      warning: "The owner token is shown once. Save it in the local Nexora Forge configuration.",
    }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "cloud_bootstrap_failed" },
      { status: 400 },
    );
  }
}
