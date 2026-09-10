import { NextResponse } from "next/server";
import { getOffersForOptimize } from "@/lib/catalog";
import { getList, updateList } from "@/lib/list-store";
import { matchListItems } from "@/lib/match";
import { optimizeSchema } from "@/lib/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let list = getList(id);
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = optimizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.preferLocal != null) {
    list = updateList(id, { preferLocal: parsed.data.preferLocal }) ?? list;
  }

  const { stores, offers, coupons } = await getOffersForOptimize(
    list.zip,
    list.items.map((i) => i.query),
  );
  const matches = matchListItems(
    list,
    offers,
    stores,
    coupons,
    parsed.data.storeIds,
  );

  return NextResponse.json({ list, matches, stores });
}
