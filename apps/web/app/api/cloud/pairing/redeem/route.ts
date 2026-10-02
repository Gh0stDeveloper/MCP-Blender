import { redeemDevicePairingCode } from "@/lib/forge-cloud/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string; deviceName?: string };
    if (!body.code?.trim() || !body.deviceName?.trim()) {
      return Response.json({ error: "code and deviceName are required" }, { status: 400 });
    }
    const result = await redeemDevicePairingCode({
      code: body.code,
      deviceName: body.deviceName,
    });
    return Response.json({
      ...result,
      warning: "The device token is returned only once.",
    }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "pairing_failed" },
      { status: 400 },
    );
  }
}
