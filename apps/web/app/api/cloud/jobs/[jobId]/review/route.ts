import {
  actorUserId,
  assertJobAccess,
  authorizeCloudRequest,
} from "@/lib/forge-cloud/auth";
import { reviewJob } from "@/lib/forge-cloud/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const actor = await authorizeCloudRequest(request);
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const body = (await request.json()) as {
    reviewerUserId?: string;
    decision?: "approved" | "rejected" | "changes_requested";
    notes?: string;
  };
  if (!body.decision) {
    return Response.json({ error: "decision is required" }, { status: 400 });
  }
  try {
    await assertJobAccess(actor, jobId, ["owner", "admin", "lead", "reviewer"]);
    const reviewerUserId = actorUserId(actor, body.reviewerUserId);
    const result = await reviewJob({
      jobId,
      reviewerUserId,
      decision: body.decision,
      notes: body.notes ?? "",
    });
    return Response.json({ ok: true, decision: body.decision, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "review_failed";
    const status = message === "forbidden" ? 403 : message.endsWith("_not_found") ? 404 : 409;
    return Response.json({ error: message }, { status });
  }
}
