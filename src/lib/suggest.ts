import { scoreOffer } from "./match";
import { PRODUCT_GENERIC_LABELS } from "./product-generics";
import { effectivePrice } from "./pricing";
import type { Coupon, DietPreferences, Offer, Store, Suggestion } from "./types";

export type { Suggestion };

export function resolveActiveStoreIds(
  stores: Store[],
  _preferredStoreIds: string[] = [],
  excludedStoreIds: string[] = [],
): string[] {
  // Prefer is a soft ranking boost (handled in buildSuggestions / optimize),
  // not an exclusive filter. Exclude removes a store from suggestions and plans.
  const excluded = new Set(excludedStoreIds);
  return stores.map((s) => s.id).filter((id) => !excluded.has(id));
}

export function buildSuggestions(
  query: string,
  offers: Offer[],
  stores: Store[],
  coupons: Coupon[],
  options?: {
    /** Active stores (non-excluded). Empty array = no suggestions. */
    storeIds?: string[];
    /** Soft boost these stores in ranking. */
    preferredStoreIds?: string[];
    prefs?: DietPreferences;
    limit?: number;
  },
): Suggestion[] {
  const q = query.trim();
  if (q.length < 1) return [];

  const storeMap = new Map(stores.map((s) => [s.id, s]));
  const allowed =
    options?.storeIds !== undefined ? new Set(options.storeIds) : null;
  if (allowed && allowed.size === 0) return [];

  const preferred = new Set(options?.preferredStoreIds ?? []);
  const prefs: DietPreferences = options?.prefs ?? {
    preferLocal: false,
    preferOrganic: false,
    preferKosher: false,
  };
  const limit = options?.limit ?? 8;

  const brandRows: Suggestion[] = [];

  for (const offer of offers) {
    if (allowed && !allowed.has(offer.storeId)) continue;
    const store = storeMap.get(offer.storeId);
    if (!store) continue;

    const { score } = scoreOffer(q, offer, prefs);
    if (score < 18) continue;

    const priced = effectivePrice(offer, coupons);
    const storeBoost = preferred.has(offer.storeId) ? 14 : 0;
    brandRows.push({
      offerId: offer.id,
      productId: offer.productId,
      name: offer.name,
      brand: offer.brand,
      kind: "brand",
      storeId: offer.storeId,
      storeName: store.name,
      sizeLabel: offer.sizeLabel,
      listPriceUsd: offer.priceUsd,
      effectivePriceUsd: priced.priceUsd,
      onSale: offer.onSale,
      isLocal: offer.isLocal,
      localOrigin: offer.localOrigin,
      isOrganic: Boolean(offer.isOrganic),
      isNonGmo: Boolean(offer.isNonGmo),
      isKosher: Boolean(offer.isKosher),
      appliedCouponIds: priced.appliedCouponIds,
      score: score + storeBoost,
      priceSource: offer.priceSource,
      asOf: offer.asOf,
    });
  }

  brandRows.sort((a, b) => {
    const aLive = a.priceSource === "live" ? 1 : 0;
    const bLive = b.priceSource === "live" ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    const aPref = preferred.has(a.storeId) ? 1 : 0;
    const bPref = preferred.has(b.storeId) ? 1 : 0;
    if (aPref !== bPref) return bPref - aPref;
    const aAd = a.priceSource === "ad" ? 1 : 0;
    const bAd = b.priceSource === "ad" ? 1 : 0;
    if (aAd !== bAd) return aAd - bAd;
    if (b.score !== a.score) return b.score - a.score;
    return a.effectivePriceUsd - b.effectivePriceUsd;
  });

  // First row: generic intent for the strongest product match (e.g. "Whole wheat loaf").
  const topProductId = brandRows[0]?.productId;
  const genericLabel = topProductId ? PRODUCT_GENERIC_LABELS[topProductId] : undefined;
  const result: Suggestion[] = [];

  if (topProductId && genericLabel) {
    const sameIntent = brandRows.filter((row) => row.productId === topProductId);
    const cheapest = [...sameIntent].sort(
      (a, b) => a.effectivePriceUsd - b.effectivePriceUsd,
    )[0];
    if (cheapest) {
      result.push({
        ...cheapest,
        offerId: `generic:${topProductId}`,
        name: genericLabel,
        brand: undefined,
        kind: "generic",
        storeId: "",
        storeName: preferred.size
          ? "Preferred & included stores"
          : "Included stores",
        sizeLabel: cheapest.sizeLabel,
        onSale: sameIntent.some((row) => row.onSale),
        isLocal: sameIntent.some((row) => row.isLocal),
        localOrigin: undefined,
        isOrganic: sameIntent.some((row) => row.isOrganic),
        isNonGmo: sameIntent.some((row) => row.isNonGmo),
        isKosher: sameIntent.some((row) => row.isKosher),
        appliedCouponIds: [],
        priceSource: cheapest.priceSource,
        score: Math.max(...sameIntent.map((row) => row.score)) + 8,
      });
    }
  }

  for (const row of brandRows) {
    if (result.length >= limit) break;
    result.push(row);
  }

  return result.slice(0, limit);
}
