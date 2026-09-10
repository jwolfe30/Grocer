import { krogerConfigured, fetchKrogerStore, searchKrogerProducts } from "./kroger";
import { SEED_COUPONS, SEED_OFFERS, SEED_STORES } from "./seed";
import type { Coupon, Offer, Store } from "./types";

export async function getStores(zip = "97209"): Promise<Store[]> {
  const stores = [...SEED_STORES];
  if (krogerConfigured()) {
    const live = await fetchKrogerStore(zip);
    if (live) {
      return [...stores.filter((s) => s.id !== "kroger-demo"), live];
    }
  }
  return stores;
}

export async function getCatalog(options?: {
  zip?: string;
  q?: string;
}): Promise<{ stores: Store[]; offers: Offer[]; coupons: Coupon[] }> {
  const zip = options?.zip ?? "97209";
  const stores = await getStores(zip);
  let offers = [...SEED_OFFERS];

  // When live Kroger is present, drop demo mirror offers to avoid double counting
  if (stores.some((s) => s.id === "kroger-live")) {
    offers = offers.filter((o) => o.storeId !== "kroger-demo");
  }

  if (options?.q?.trim() && krogerConfigured()) {
    const liveOffers = await searchKrogerProducts(options.q, zip);
    offers = [...offers, ...liveOffers];
  }

  if (options?.q?.trim()) {
    const q = options.q.toLowerCase();
    offers = offers.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.brand?.toLowerCase().includes(q) ||
        o.productId.includes(q.replace(/\s+/g, "-")) ||
        o.category.includes(q),
    );
  }

  return { stores, offers, coupons: SEED_COUPONS };
}

export async function getOffersForOptimize(zip: string, queries: string[]): Promise<{
  stores: Store[];
  offers: Offer[];
  coupons: Coupon[];
}> {
  const stores = await getStores(zip);
  let offers = [...SEED_OFFERS];
  if (stores.some((s) => s.id === "kroger-live")) {
    offers = offers.filter((o) => o.storeId !== "kroger-demo");
  }

  if (krogerConfigured()) {
    const unique = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
    const liveBatches = await Promise.all(
      unique.slice(0, 8).map((q) => searchKrogerProducts(q, zip, 5)),
    );
    offers = [...offers, ...liveBatches.flat()];
  }

  return { stores, offers, coupons: SEED_COUPONS };
}
