import { NextResponse } from "next/server";
import { krogerLiveStatus } from "@/lib/kroger";

export async function GET() {
  const status = krogerLiveStatus();
  return NextResponse.json({
    ...status,
    message: !status.configured
      ? "Kroger credentials not configured — using modeled prices."
      : status.circuitOpen
        ? "Live Kroger temporarily unavailable; using modeled prices."
        : status.lastLiveAt
          ? "Kroger live pricing available."
          : "Kroger configured — live prices load on suggest/optimize.",
  });
}
