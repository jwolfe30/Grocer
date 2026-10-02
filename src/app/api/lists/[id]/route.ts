import { NextResponse } from "next/server";
import { authorizeList } from "@/lib/list-access";
import { upsertList } from "@/lib/list-store";
import { updateListSchema } from "@/lib/schemas";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = authorizeList(request, id);
  if (!access.ok) return access.response;
  const { list } = access;
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
  const access = authorizeList(request, id);
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => ({}));
  const parsed = updateListSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { user } = access;
  const list = upsertList(id, {
    ...parsed.data,
    ...(user ? { userId: user.id } : {}),
  });
  return NextResponse.json({
    list,
    sync: list.userId ? ("cloud" as const) : ("device" as const),
  });
}
