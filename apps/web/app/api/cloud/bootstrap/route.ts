import { cloudAuthorized } from "@/lib/forge-cloud/auth";
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

    const result = await transaction(async (client) => {
      const orgSlug = slug(body.organizationSlug || body.organizationName || "");
      const projectSlug = slug(body.projectSlug || body.projectName || "");
      if (!orgSlug || !projectSlug) throw new Error("organization/project slug is invalid");

      const org = await client.query<{ id: string }>(
        `insert into organizations (slug, name)
         values ($1,$2)
         on conflict (slug) do update set name=excluded.name
         returning id`,
        [orgSlug, body.organizationName.trim()],
      );
      const organizationId = org.rows[0].id;

      await client.query(
        `insert into organization_members (organization_id, user_id, role)
         values ($1,$2,'owner')
         on conflict (organization_id,user_id) do update set role='owner'`,
        [organizationId, body.ownerUserId],
      );

      const project = await client.query<{ id: string }>(
        `insert into projects (organization_id, name, slug, created_by)
         values ($1,$2,$3,$4)
         on conflict (organization_id,slug) do update set name=excluded.name
         returning id`,
        [organizationId, body.projectName.trim(), projectSlug, body.ownerUserId],
      );
      const projectId = project.rows[0].id;

      let assetId: string | null = null;
      if (body.assetName?.trim()) {
        const asset = await client.query<{ id: string }>(
          `insert into assets (project_id, asset_type, name, created_by)
           values ($1,$2,$3,$4) returning id`,
          [projectId, body.assetType?.trim() || "generic", body.assetName.trim(), body.ownerUserId],
        );
        assetId = asset.rows[0].id;
      }

      return { organizationId, projectId, assetId };
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "cloud_bootstrap_failed" },
      { status: 400 },
    );
  }
}
