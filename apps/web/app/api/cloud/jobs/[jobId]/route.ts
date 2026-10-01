import { cloudAuthorized } from "@/lib/forge-cloud/auth";
import { query } from "@/lib/forge-cloud/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  if (!cloudAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const jobs = await query(
    `select id, project_id, asset_id, target_device_id, leased_by_device_id,
            status, task, execution_plan, operation_results, result_summary,
            error_message, attempt_count, require_approval,
            created_at, started_at, finished_at, lease_expires_at
       from jobs where id=$1 limit 1`,
    [jobId],
  );
  if (!jobs[0]) return Response.json({ error: "job_not_found" }, { status: 404 });
  const artifacts = await query(
    `select id, kind, filename, content_type, checksum_sha256,
            size_bytes, created_at
       from job_artifacts where job_id=$1 order by created_at asc`,
    [jobId],
  );
  const reviews = await query(
    "select decision, notes, reviewer_user_id, reviewed_at from job_reviews where job_id=$1",
    [jobId],
  );
  return Response.json({ job: jobs[0], artifacts, review: reviews[0] ?? null });
}
