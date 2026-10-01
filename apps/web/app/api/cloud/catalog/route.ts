import { MODEL_CATALOG, providerAvailability } from "../../../../lib/forge-cloud/model-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    models: MODEL_CATALOG,
    availability: providerAvailability(),
  });
}
