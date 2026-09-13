import { NextResponse } from "next/server";
import { getOffersForOptimize } from "@/lib/catalog";
import { getList, updateList } from "@/lib/list-store";
import { optimizeCart } from "@/lib/optimize";
import { annotateOptimizeDeals } from "@/lib/price-db";
import { optimizeSchema } from "@/lib/schemas";

export const maxDuration = 60;

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

  const patch: {
    preferLocal?: boolean;
    preferOrganic?: boolean;
    preferKosher?: boolean;
    savingsThresholdUsd?: number;
  } = {};
  if (parsed.data.preferLocal != null) patch.preferLocal = parsed.data.preferLocal;
  if (parsed.data.preferOrganic != null) patch.preferOrganic = parsed.data.preferOrganic;
  if (parsed.data.preferKosher != null) patch.preferKosher = parsed.data.preferKosher;
  if (parsed.data.savingsThresholdUsd != null) {
    patch.savingsThresholdUsd = parsed.data.savingsThresholdUsd;
  }
  if (Object.keys(patch).length) {
    list = updateList(id, patch) ?? list;
  }

  try {
    const { stores, offers, coupons } = await getOffersForOptimize(
      list.zip,
      list.items.map((i) => i.query),
      { storeIds: parsed.data.storeIds },
    );

    const result = annotateOptimizeDeals(
      optimizeCart(list, offers, stores, coupons, {
        storeIds: parsed.data.storeIds,
        savingsThresholdUsd: parsed.data.savingsThresholdUsd,
        preferFewerStops: parsed.data.preferFewerStops,
        maxStops: parsed.data.maxStops,
      }),
    );

    const liveOfferCount = offers.filter((o) => o.priceSource === "live").length;
    const liveStoreCount = new Set(
      offers.filter((o) => o.priceSource === "live").map((o) => o.storeId),
    ).size;

    return NextResponse.json({
      list,
      stores,
      coupons,
      ...result,
      progress: {
        liveOfferCount,
        liveStoreCount,
      },
    });
  } catch (err) {
    console.error("optimize failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Optimization failed unexpectedly.",
      },
      { status: 500 },
    );
  }
}
