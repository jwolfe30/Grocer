import { NextResponse } from "next/server";
import { logoutSession, parseBearer } from "@/lib/user-store";

export async function POST(request: Request) {
  const token = parseBearer(request);
  if (token) logoutSession(token);
  return NextResponse.json({ ok: true });
}
