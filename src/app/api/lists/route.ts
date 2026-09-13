import { NextResponse } from "next/server";
import {
  createList,
  ensureGuestList,
  mergeDeviceListIntoUserCloud,
} from "@/lib/list-store";
import { createListSchema } from "@/lib/schemas";
import { parseBearer, userFromToken } from "@/lib/user-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceListId = searchParams.get("id");
  const zip = searchParams.get("zip") ?? "98042";
  const user = userFromToken(parseBearer(request));

  if (user) {
    // Preserve guest list items: promote on first login, or merge into an existing cloud list.
    const list = mergeDeviceListIntoUserCloud(deviceListId, user.id, zip);
    return NextResponse.json({
      list,
      lists: [list],
      sync: "cloud" as const,
    });
  }

  const list = ensureGuestList(deviceListId, zip);
  return NextResponse.json({ list, lists: [list], sync: "device" as const });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = createListSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const user = userFromToken(parseBearer(request));
  const list = createList({
    ...parsed.data,
    userId: user?.id ?? null,
  });
  return NextResponse.json(
    { list, sync: user ? ("cloud" as const) : ("device" as const) },
    { status: 201 },
  );
}
