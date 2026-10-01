import { cloudAuthorized } from "../../../../lib/forge-cloud/auth";
import { enqueueJob, validateExecutionPlan } from "../../../../lib/forge-cloud/pipeline";
import { query } from "../../../../lib/forge-cloud/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cloudAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
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
    if (!body.projectId || !body.requestedBy || !body.task?.trim()) {
      return Response.json({ error: "projectId, requestedBy and task are required" }, { status: 400 });
    }
    const executionPlan = validateExecutionPlan(body.executionPlan);
    const result = await enqueueJob({
      projectId: body.projectId,
      requestedBy: body.requestedBy,
      assetId: body.assetId,
      targetDeviceId: body.targetDeviceId,
      task: body.task,
      executionPlan,
      requireApproval: body.requireApproval,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "job_enqueue_failed" },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  if (!cloudAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
  const rows = await query(
    `select id, project_id, asset_id, target_device_id, status, task,
            attempt_count, created_at, started_at, finished_at
       from jobs where project_id=$1
      order by created_at desc limit 100`,
    [projectId],
  );
  return Response.json({ jobs: rows });
}
