import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { buildSuggestions, resolveActiveStoreIds } from "@/lib/suggest";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const zip = searchParams.get("zip") ?? "98042";
  const preferLocal = searchParams.get("preferLocal") === "1";
  const preferOrganic = searchParams.get("preferOrganic") === "1";
  const preferKosher = searchParams.get("preferKosher") === "1";
  const preferred = (searchParams.get("preferred") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const excluded = (searchParams.get("excluded") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (q.trim().length < 1) {
    return NextResponse.json({ suggestions: [] });
  }

  const [catalog, live] = await Promise.all([
    getCatalog({ zip }),
    getCatalog({ zip, q }),
  ]);
  const offerById = new Map(catalog.offers.map((o) => [o.id, o]));
  for (const offer of live.offers) offerById.set(offer.id, offer);

  // When live Kroger rows exist for a store, drop that store's modeled/demo shelf for suggest.
  const liveStoreIds = new Set(
    [...offerById.values()]
      .filter((o) => o.priceSource === "live")
      .map((o) => o.storeId),
  );
  const offers = [...offerById.values()].filter((o) => {
    if (!liveStoreIds.has(o.storeId)) return true;
    const src = o.priceSource ?? "demo";
    return src === "live" || src === "crowd" || src === "ad";
  });

  const stores = catalog.stores;
  const activeStoreIds = resolveActiveStoreIds(stores, preferred, excluded);
  const suggestions = buildSuggestions(
    q,
    offers,
    stores,
    catalog.coupons,
    {
      storeIds: activeStoreIds,
      preferredStoreIds: preferred,
      prefs: { preferLocal, preferOrganic, preferKosher },
      limit: 10,
    },
  );

  return NextResponse.json({ suggestions, storeIds: activeStoreIds });
}
