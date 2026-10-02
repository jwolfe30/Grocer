import { NextResponse } from "next/server";
import { devLoginEnabledServer } from "@/lib/dev-flags";
import { ensureDevUser } from "@/lib/user-store";

/**
 * Developer-only instant login for toggling auth UI states.
 * 404 in production unless GROCER_ALLOW_DEV_LOGIN=1 (see src/lib/dev-flags.ts).
 */
export async function POST(request: Request) {
  if (!devLoginEnabledServer()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const zip =
    typeof body === "object" && body && "zip" in body && typeof body.zip === "string"
      ? body.zip
      : "98042";
  const result = ensureDevUser(zip);
  return NextResponse.json(result);
}
