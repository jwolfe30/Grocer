import { NextResponse } from "next/server";
import { enableListSharing, getList } from "@/lib/list-store";
import { parseBearer, userFromToken } from "@/lib/user-store";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = userFromToken(parseBearer(request));
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to share a cloud list." },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const list = getList(id);
  if (!list) return NextResponse.json({ error: "List not found." }, { status: 404 });

  const result = enableListSharing(id, user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  const origin = new URL(request.url).origin;
  const shareUrl = `${origin}/l/${result.shareId}`;
  return NextResponse.json({ list: result, shareUrl, shareId: result.shareId });
}
