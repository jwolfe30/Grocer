import { krogerBannerStores } from "./area-stores";
import {
  getCachedOffersForQueries,
  getLatestOffersForStores,
  normalizeQuery,
  priceCacheMaxAgeHours,
  priceCacheOnly,
  upsertLiveOffers,
} from "./price-db";
import {
  krogerConfigured,
  listKrogerBannerStores,
  resetKrogerCircuit,
  searchKrogerProducts,
  searchKrogerProductsBatch,
} from "./kroger";
import { latestCrowdOfferMap } from "./receipt-store";
import { SEED_COUPONS, SEED_OFFERS, SEED_STORES } from "./seed";
import type { Coupon, Offer, Store } from "./types";

function withSeedSource(offers: Offer[]): Offer[] {
  return offers.map((o) => ({
    ...o,
    priceSource: o.priceSource ?? "demo",
  }));
}

/** Prefer shopper-reported prices over seeded modeled/demo for the same store+product. */
function preferCrowdOverSeed(offers: Offer[]): Offer[] {
  const crowdKeys = new Set(
    offers
      .filter((o) => o.priceSource === "crowd")
      .map((o) => `${o.storeId}|${o.productId}`),
  );
  if (!crowdKeys.size) return offers;
  return offers.filter((o) => {
    if (o.priceSource === "crowd" || o.priceSource === "live") return true;
    if (
      (o.priceSource === "demo" || o.priceSource === "modeled" || o.priceSource == null) &&
      crowdKeys.has(`${o.storeId}|${o.productId}`)
    ) {
      return false;
    }
    return true;
  });
}

function isSeedShelf(o: Offer): boolean {
  const s = o.priceSource ?? "demo";
  return s === "demo" || s === "modeled";
}

/** Drop modeled/demo shelf for stores that have live or fresh cached-live offers. */
function dropSeedForLiveStores(offers: Offer[], liveLike: Offer[]): Offer[] {
  if (!liveLike.length) return offers;
  const liveStoreIds = new Set(liveLike.map((o) => o.storeId));
  return offers.filter((o) => !(liveStoreIds.has(o.storeId) && isSeedShelf(o)));
}

function mergeLiveOffers(base: Offer[], liveLike: Offer[]): Offer[] {
  if (!liveLike.length) return base;
  const next = dropSeedForLiveStores(base, liveLike);
  return [
    ...next,
    ...liveLike.map((o) => ({ ...o, priceSource: "live" as const })),
  ];
}

function safeCacheCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (err) {
    console.warn("price cache unavailable", err);
    return fallback;
  }
}

function crowdOffersFromReceipts(zip: string): { stores: Store[]; offers: Offer[] } {
  const map = latestCrowdOfferMap(zip);
  const storeById = new Map<string, Store>();
  const offers: Offer[] = [];

  for (const obs of map.values()) {
    if (!storeById.has(obs.storeId)) {
      const known = SEED_STORES.find((s) => s.id === obs.storeId);
      storeById.set(
        obs.storeId,
        known ?? {
          id: obs.storeId,
          name: obs.storeName,
          address: `Shopper-reported · ${obs.zip}`,
          zip: obs.zip,
          lat: 0,
          lng: 0,
          source: "crowd",
        },
      );
    }
    offers.push({
      id: `crowd-${obs.id}`,
      storeId: obs.storeId,
      productId: obs.productId,
      name: obs.name,
      category: "grocery",
      sizeLabel: "as purchased",
      priceUsd: obs.priceUsd,
      unitAmount: 1,
      unitName: "each",
      isLocal: false,
      onSale: false,
      couponIds: [],
      priceSource: "crowd",
      asOf: obs.observedAt,
    });
  }

  return { stores: [...storeById.values()], offers };
}

export async function getStores(zip = "98042"): Promise<Store[]> {
  const byId = new Map<string, Store>();
  for (const s of SEED_STORES) byId.set(s.id, s);

  // Mark Kroger banners as live source when credentials exist (prices may still be demo until API works).
  if (krogerConfigured()) {
    for (const s of listKrogerBannerStores()) {
      byId.set(s.id, s);
    }
  }

  const crowd = crowdOffersFromReceipts(zip).stores;
  for (const store of crowd) {
    if (!byId.has(store.id)) byId.set(store.id, store);
  }

  return [...byId.values()];
}

function krogerLocationIdsForSearch(options?: {
  limit?: number;
  storeIds?: string[];
}): string[] {
  const limit = options?.limit ?? 9;
  const storeIds = options?.storeIds;
  const banners = krogerBannerStores().filter((s) => {
    if (!s.krogerLocationId) return false;
    if (!storeIds?.length) return true;
    return storeIds.includes(s.id);
  });
  const primary = process.env.KROGER_LOCATION_ID;
  const ordered = [
    ...(primary ? banners.filter((s) => s.krogerLocationId === primary) : []),
    ...banners.filter((s) => s.zip === "98042"),
    ...banners,
  ];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const s of ordered) {
    const id = s.krogerLocationId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

function krogerStoreIdsForCache(options?: { storeIds?: string[]; limit?: number }): string[] {
  const locationIds = new Set(krogerLocationIdsForSearch(options));
  return krogerBannerStores()
    .filter((s) => s.krogerLocationId && locationIds.has(s.krogerLocationId))
    .map((s) => s.id);
}

function writeThroughLive(offers: Offer[], queryTerm?: string) {
  if (!offers.length) return;
  safeCacheCall(() => upsertLiveOffers(offers, { queryTerm }), 0);
}

export async function getCatalog(options?: {
  zip?: string;
  q?: string;
}): Promise<{ stores: Store[]; offers: Offer[]; coupons: Coupon[] }> {
  const zip = options?.zip ?? "98042";
  const stores = await getStores(zip);
  let offers = withSeedSource([...SEED_OFFERS]);
  const crowd = crowdOffersFromReceipts(zip);
  offers = preferCrowdOverSeed([...offers, ...crowd.offers]);

  const q = options?.q?.trim();
  const maxAge = priceCacheMaxAgeHours();
  const cacheStoreIds = krogerStoreIdsForCache({ limit: 3 });

  if (q) {
    const cached = safeCacheCall(
      () => getCachedOffersForQueries([q], cacheStoreIds, maxAge),
      { offers: [], coveredTerms: [] },
    );
    if (cached.offers.length) {
      offers = mergeLiveOffers(offers, cached.offers);
    }

    const covered = new Set(cached.coveredTerms.map(normalizeQuery));
    const skipLive =
      priceCacheOnly() ||
      (covered.has(normalizeQuery(q)) && cached.offers.length > 0);

    if (krogerConfigured() && !skipLive) {
      const liveOffers = await searchKrogerProducts(
        q,
        krogerLocationIdsForSearch({ limit: 3 }),
        5,
      );
      if (liveOffers.length) {
        writeThroughLive(liveOffers, q);
        offers = mergeLiveOffers(offers, liveOffers);
      }
    }
  }

  if (q) {
    const ql = q.toLowerCase();
    offers = offers.filter(
      (o) =>
        o.name.toLowerCase().includes(ql) ||
        o.brand?.toLowerCase().includes(ql) ||
        o.productId.includes(ql.replace(/\s+/g, "-")) ||
        o.category.includes(ql),
    );
  }

  return { stores, offers, coupons: SEED_COUPONS };
}

export async function getOffersForOptimize(
  zip: string,
  queries: string[],
  options?: { storeIds?: string[] },
): Promise<{
  stores: Store[];
  offers: Offer[];
  coupons: Coupon[];
}> {
  const stores = await getStores(zip);
  let offers = withSeedSource([...SEED_OFFERS]);
  offers = preferCrowdOverSeed([
    ...offers,
    ...crowdOffersFromReceipts(zip).offers,
  ]);

  // Cache-first default: serve fresh price_observations before hitting Kroger.
  // PRICE_CACHE_ONLY=1 skips live entirely; PRICE_CACHE_MAX_AGE_HOURS caps freshness.
  const unique = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
  const maxAge = priceCacheMaxAgeHours();
  const cacheStoreIds = krogerStoreIdsForCache({
    storeIds: options?.storeIds,
    limit: 12,
  });

  // Fresh latest for selected Kroger stores — drop seed shelf when any exist.
  const latestCached = safeCacheCall(
    () => getLatestOffersForStores(cacheStoreIds, maxAge),
    [],
  );
  if (latestCached.length) {
    offers = dropSeedForLiveStores(offers, latestCached);
  }

  const queryCached = safeCacheCall(
    () => getCachedOffersForQueries(unique, cacheStoreIds, maxAge),
    { offers: [], coveredTerms: [] },
  );
  if (queryCached.offers.length) {
    offers = mergeLiveOffers(offers, queryCached.offers);
  } else if (latestCached.length && unique.length) {
    // Broaden: include all fresh latest so matcher can still score by name.
    offers = mergeLiveOffers(offers, latestCached);
  }

  const coveredNorms = new Set(queryCached.coveredTerms.map(normalizeQuery));
  const termsNeedingLive = unique
    .filter((t) => !coveredNorms.has(normalizeQuery(t)))
    .slice(0, 10);

  const skipAllLive =
    priceCacheOnly() ||
    (unique.length > 0 &&
      termsNeedingLive.length === 0 &&
      queryCached.offers.length > 0);

  if (krogerConfigured() && !skipAllLive && termsNeedingLive.length > 0) {
    const locationIds = krogerLocationIdsForSearch({
      storeIds: options?.storeIds,
      limit: 12,
    });
    // If a prior burst tripped the circuit, allow one fresh attempt on optimize.
    resetKrogerCircuit();
    const liveOffers = await searchKrogerProductsBatch(
      termsNeedingLive,
      locationIds,
      4,
    );
    if (liveOffers.length) {
      safeCacheCall(() => {
        const queryByOfferId: Record<string, string> = {};
        for (const offer of liveOffers) {
          const hay = `${offer.name} ${offer.brand ?? ""}`.toLowerCase();
          const hit =
            termsNeedingLive.find((t) =>
              normalizeQuery(t)
                .split(" ")
                .every((w) => !w || hay.includes(w)),
            ) ?? termsNeedingLive[0];
          if (hit) queryByOfferId[offer.id] = hit;
        }
        return upsertLiveOffers(liveOffers, { queryByOfferId });
      }, 0);

      offers = mergeLiveOffers(offers, liveOffers);
    }
  }

  return { stores, offers, coupons: SEED_COUPONS };
}
