import { NextResponse } from "next/server";
import { getList, upsertList } from "@/lib/list-store";
import { updateListSchema } from "@/lib/schemas";
import { parseBearer, userFromToken } from "@/lib/user-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const list = getList(id);
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  return NextResponse.json({
    list,
    sync: list.userId ? ("cloud" as const) : ("device" as const),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = updateListSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const user = userFromToken(parseBearer(request));
  const list = upsertList(id, {
    ...parsed.data,
    ...(user ? { userId: user.id } : {}),
  });
  return NextResponse.json({
    list,
    sync: list.userId ? ("cloud" as const) : ("device" as const),
  });
}
