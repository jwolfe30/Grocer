import { NextResponse } from "next/server";
import { ensureDevUser } from "@/lib/user-store";

/** Developer-only instant login for toggling auth UI states. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const zip =
    typeof body === "object" && body && "zip" in body && typeof body.zip === "string"
      ? body.zip
      : "98042";
  const result = ensureDevUser(zip);
  return NextResponse.json(result);
}
