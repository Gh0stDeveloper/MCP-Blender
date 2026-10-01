import { cloudAuthorized } from "@/lib/forge-cloud/auth";
import { reviewJob } from "@/lib/forge-cloud/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  if (!cloudAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const body = (await request.json()) as {
    reviewerUserId?: string;
    decision?: "approved" | "rejected" | "changes_requested";
    notes?: string;
  };
  if (!body.reviewerUserId || !body.decision) {
    return Response.json({ error: "reviewerUserId and decision are required" }, { status: 400 });
  }
  try {
    const result = await reviewJob({
      jobId,
      reviewerUserId: body.reviewerUserId,
      decision: body.decision,
      notes: body.notes ?? "",
    });
    return Response.json({ ok: true, decision: body.decision, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "review_failed" },
      { status: 409 },
    );
  }
}
