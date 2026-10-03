import {
  assertProjectAccess,
  authorizeCloudRequest,
} from "@/lib/forge-cloud/auth";
import { orchestrate } from "@/lib/forge-cloud/orchestrator";
import type { OrchestrationRequest } from "@/lib/forge-cloud/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await authorizeCloudRequest(request);
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: OrchestrationRequest;
  try {
    body = (await request.json()) as OrchestrationRequest;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    if (actor.kind === "member") {
      if (!body.projectId) throw new Error("projectId is required for team members");
      await assertProjectAccess(actor, body.projectId, ["owner", "admin", "lead", "artist"]);
    }
    const result = await orchestrate(body);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "orchestration_failed";
    const status =
      message === "forbidden"
        ? 403
        : message.endsWith("_not_found")
          ? 404
          : message.includes("must") ||
              message.includes("required") ||
              message.includes("enable between") ||
              message.includes("too large") ||
              message.includes("needs")
            ? 400
            : 502;
    return Response.json({ error: message }, { status });
  }
}
