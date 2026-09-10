import { NextResponse } from "next/server";
import { getOffersForOptimize } from "@/lib/catalog";
import { getList, updateList } from "@/lib/list-store";
import { optimizeCart } from "@/lib/optimize";
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

  const patch: { preferLocal?: boolean; savingsThresholdUsd?: number } = {};
  if (parsed.data.preferLocal != null) patch.preferLocal = parsed.data.preferLocal;
  if (parsed.data.savingsThresholdUsd != null) {
    patch.savingsThresholdUsd = parsed.data.savingsThresholdUsd;
  }
  if (Object.keys(patch).length) {
    list = updateList(id, patch) ?? list;
  }

  const { stores, offers, coupons } = await getOffersForOptimize(
    list.zip,
    list.items.map((i) => i.query),
  );

  const result = optimizeCart(list, offers, stores, coupons, {
    storeIds: parsed.data.storeIds,
    savingsThresholdUsd: parsed.data.savingsThresholdUsd,
  });

  return NextResponse.json({ list, stores, ...result });
}
