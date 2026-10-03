import {
  actorUserId,
  assertProjectAccess,
  authorizeCloudRequest,
} from "@/lib/forge-cloud/auth";
import { query } from "@/lib/forge-cloud/db";
import { enqueueJob, validateExecutionPlan } from "@/lib/forge-cloud/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await authorizeCloudRequest(request);
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as {
      projectId?: string;
      requestedBy?: string;
      assetId?: string | null;
      targetDeviceId?: string | null;
      task?: string;
      executionPlan?: unknown;
      requireApproval?: boolean;
    };
    if (!body.projectId || !body.task?.trim()) {
      return Response.json({ error: "projectId and task are required" }, { status: 400 });
    }
    await assertProjectAccess(actor, body.projectId, ["owner", "admin", "lead", "artist"]);
    const requestedBy = actorUserId(actor, body.requestedBy);
    const executionPlan = validateExecutionPlan(body.executionPlan);
    const result = await enqueueJob({
      projectId: body.projectId,
      requestedBy,
      assetId: body.assetId,
      targetDeviceId: body.targetDeviceId,
      task: body.task,
      executionPlan,
      requireApproval: body.requireApproval,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "job_enqueue_failed";
    const status = message === "forbidden" ? 403 : message.endsWith("_not_found") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function GET(request: Request) {
  const actor = await authorizeCloudRequest(request);
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
  try {
    await assertProjectAccess(actor, projectId);
    const rows = await query(
      `select id, project_id, asset_id, target_device_id, status, task,
              attempt_count, created_at, started_at, finished_at
         from jobs where project_id=$1
        order by created_at desc limit 100`,
      [projectId],
    );
    return Response.json({ jobs: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "jobs_failed";
    return Response.json({ error: message }, { status: message === "forbidden" ? 403 : 404 });
  }
}
