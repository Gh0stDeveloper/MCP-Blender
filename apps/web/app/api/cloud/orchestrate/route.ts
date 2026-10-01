import { orchestrate } from "../../../../lib/forge-cloud/orchestrator";
import type { OrchestrationRequest } from "../../../../lib/forge-cloud/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.NEXORA_CLOUD_API_TOKEN;
  if (!expected) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: OrchestrationRequest;
  try {
    body = (await request.json()) as OrchestrationRequest;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await orchestrate(body);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "orchestration_failed";
    const status =
      message.includes("must") ||
      message.includes("enable between") ||
      message.includes("too large") ||
      message.includes("needs")
        ? 400
        : 502;
    return Response.json({ error: message }, { status });
  }
}
