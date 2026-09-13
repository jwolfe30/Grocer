import type { CartPlan, Coupon, Offer } from "./types";

/** Shopper coupon pick at plan time: best available, skip, or a specific clip. */
export type CouponChoice = "auto" | "none" | (string & {});

export function basePrice(offer: Offer): number {
  if (offer.onSale && offer.salePriceUsd != null) {
    return offer.salePriceUsd;
  }
  return offer.priceUsd;
}

function applyCouponAmount(sale: number, coupon: Coupon): number {
  let next = sale;
  if (coupon.amountOffUsd != null) next -= coupon.amountOffUsd;
  if (coupon.percentOff != null) next -= sale * (coupon.percentOff / 100);
  return Math.max(0, round2(next));
}

export function couponsForOffer(
  offer: Offer,
  coupons: Coupon[],
  now = new Date(),
): Coupon[] {
  return coupons.filter((coupon) => {
    if (coupon.storeId !== "*" && coupon.storeId !== offer.storeId) return false;
    if (new Date(coupon.expiresAt) < now) return false;
    if (coupon.productIds?.length && !coupon.productIds.includes(offer.productId)) {
      return false;
    }
    if (coupon.categories?.length && !coupon.categories.includes(offer.category)) {
      return false;
    }
    if (offer.couponIds.length && !offer.couponIds.includes(coupon.id)) {
      // Allow category/product coupons not pre-linked on the offer
      if (!coupon.productIds?.length && !coupon.categories?.length) return false;
    }
    return true;
  });
}

/** Coupons the shopper can pick for this offer (meets min spend, not expired). */
export function selectableCouponsForOffer(
  offer: Offer,
  coupons: Coupon[],
  now = new Date(),
): Coupon[] {
  const sale = basePrice(offer);
  const byId = new Map<string, Coupon>();

  for (const coupon of couponsForOffer(offer, coupons, now)) {
    if (coupon.minSpendUsd != null && sale < coupon.minSpendUsd) continue;
    byId.set(coupon.id, coupon);
  }

  // Offer-tagged clips that may not pass category/product filters
  for (const id of offer.couponIds) {
    if (byId.has(id)) continue;
    const coupon = coupons.find((c) => c.id === id);
    if (!coupon) continue;
    if (coupon.storeId !== "*" && coupon.storeId !== offer.storeId) continue;
    if (new Date(coupon.expiresAt) < now) continue;
    if (coupon.minSpendUsd != null && sale < coupon.minSpendUsd) continue;
    byId.set(coupon.id, coupon);
  }

  return [...byId.values()];
}

/**
 * Price after sale + coupon.
 * `choice`: auto (best savings), none, or a specific coupon id.
 */
export function effectivePrice(
  offer: Offer,
  coupons: Coupon[],
  choice: CouponChoice = "auto",
): { priceUsd: number; appliedCouponIds: string[] } {
  const sale = basePrice(offer);

  if (choice === "none") {
    return { priceUsd: sale, appliedCouponIds: [] };
  }

  if (choice !== "auto") {
    const selectable = selectableCouponsForOffer(offer, coupons);
    const coupon = selectable.find((c) => c.id === choice);
    if (!coupon) {
      return { priceUsd: sale, appliedCouponIds: [] };
    }
    return {
      priceUsd: applyCouponAmount(sale, coupon),
      appliedCouponIds: [coupon.id],
    };
  }

  const applicable = couponsForOffer(offer, coupons).filter((c) => {
    if (c.minSpendUsd != null && sale < c.minSpendUsd) return false;
    return true;
  });

  let best = sale;
  let bestIds: string[] = [];

  for (const coupon of applicable) {
    const next = applyCouponAmount(sale, coupon);
    if (next < best) {
      best = next;
      bestIds = [coupon.id];
    }
  }

  // Harbor co-op style: percent coupons tagged on offer even without productIds
  for (const id of offer.couponIds) {
    const coupon = coupons.find((c) => c.id === id);
    if (!coupon) continue;
    if (coupon.storeId !== "*" && coupon.storeId !== offer.storeId) continue;
    const next = applyCouponAmount(sale, coupon);
    if (next < best) {
      best = next;
      bestIds = [coupon.id];
    }
  }

  return { priceUsd: best, appliedCouponIds: bestIds };
}

/** Dollars saved vs sale/list price for the chosen coupon mode. */
export function couponSavingsUsd(
  offer: Offer,
  coupons: Coupon[],
  choice: CouponChoice = "auto",
): number {
  const sale = basePrice(offer);
  const priced = effectivePrice(offer, coupons, choice);
  return round2(Math.max(0, sale - priced.priceUsd));
}

/** Re-price plan lines from shopper coupon picks without re-optimizing. */
export function applyCouponChoicesToPlan(
  plan: CartPlan,
  choices: Record<string, CouponChoice>,
  coupons: Coupon[],
): CartPlan {
  const lines = plan.lines.map((line) => {
    if (line.storeId === "__unmatched__") return line;
    const choice = choices[line.itemId] ?? "auto";
    const priced = effectivePrice(line.offer, coupons, choice);
    if (
      priced.priceUsd === line.unitPriceUsd &&
      priced.appliedCouponIds.length === line.appliedCouponIds.length &&
      priced.appliedCouponIds.every((id, i) => id === line.appliedCouponIds[i])
    ) {
      return line;
    }
    return {
      ...line,
      unitPriceUsd: priced.priceUsd,
      lineTotalUsd: round2(priced.priceUsd * line.quantity),
      appliedCouponIds: priced.appliedCouponIds,
    };
  });

  const subtotalUsd = round2(
    lines
      .filter((l) => l.storeId !== "__unmatched__")
      .reduce((sum, l) => sum + l.lineTotalUsd, 0),
  );

  return {
    ...plan,
    lines,
    subtotalUsd,
    savingsVsCheapestSingleUsd: round2(
      plan.savingsVsCheapestSingleUsd + (plan.subtotalUsd - subtotalUsd),
    ),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

/** Live API prices vs everything else (demo, crowd, ad, modeled). */
export function priceSourceKind(
  source?: "live" | "demo" | "crowd" | "ad" | "modeled" | null,
): "live" | "modeled" | "est" {
  if (source === "live") return "live";
  if (source === "modeled") return "modeled";
  return "est";
}

export function priceSourceTag(
  source?: "live" | "demo" | "crowd" | "ad" | "modeled" | null,
): "live" | "modeled" | "est." {
  const kind = priceSourceKind(source);
  return kind === "live" ? "live" : kind === "modeled" ? "modeled" : "est.";
}

export function formatUsdWithSource(
  n: number,
  source?: "live" | "demo" | "crowd" | "ad" | "modeled" | null,
): string {
  return `${formatUsd(n)} ${priceSourceTag(source)}`;
}

export type PriceHonestyLabel =
  | "live"
  | "mostly live"
  | "mostly modeled"
  | "mostly est."
  | "mixed est.";

export type PriceHonesty = {
  live: number;
  modeled: number;
  est: number;
  total: number;
  liveShare: number;
  label: PriceHonestyLabel;
};

/** Aggregate honesty for a plan or stop (line-level priceSource). */
export function summarizeLinePriceHonesty(
  sources: Array<"live" | "demo" | "crowd" | "ad" | "modeled" | null | undefined>,
): PriceHonesty {
  let live = 0;
  let modeled = 0;
  let est = 0;
  for (const source of sources) {
    const kind = priceSourceKind(source);
    if (kind === "live") live += 1;
    else if (kind === "modeled") modeled += 1;
    else est += 1;
  }
  const total = live + modeled + est;
  const liveShare = total ? live / total : 0;

  let label: PriceHonestyLabel;
  if (total === 0) label = "mixed est.";
  else if (liveShare >= 0.999) label = "live";
  else if (liveShare >= 0.5) label = "mostly live";
  else if (modeled >= est && modeled > live) label = "mostly modeled";
  else if (est > live) label = "mostly est.";
  else label = "mixed est.";

  return { live, modeled, est, total, liveShare, label };
}

export function priceHonestyShortTag(honesty: PriceHonesty): string {
  switch (honesty.label) {
    case "live":
      return "live";
    case "mostly live":
      return "mostly live";
    case "mostly modeled":
      return "mostly modeled";
    case "mostly est.":
      return "mostly est.";
    case "mixed est.":
      return "est. / modeled";
  }
}

export function priceHonestyIsAuthoritative(honesty: PriceHonesty): boolean {
  return honesty.label === "live" || honesty.label === "mostly live";
}

/**
 * Catalog-level live coverage for optimize completion copy.
 * Cached Kroger observations count as live (same as catalog merge).
 */
export function isLiveOptimizeHealthy(
  liveOfferCount: number,
  liveStoreCount: number,
  itemCount: number,
): boolean {
  const floor = Math.max(3, Math.ceil(Math.max(1, itemCount) * 0.5));
  return liveStoreCount > 0 && liveOfferCount >= floor;
}

export function optimizeLiveCompletion(
  liveOfferCount: number,
  liveStoreCount: number,
  itemCount: number,
): { phase: string; tone: "ok" | "warn" } {
  if (isLiveOptimizeHealthy(liveOfferCount, liveStoreCount, itemCount)) {
    return {
      phase: `Done — live prices from ${liveStoreCount} Kroger store${
        liveStoreCount === 1 ? "" : "s"
      } (${liveOfferCount} offers).`,
      tone: "ok",
    };
  }
  if (liveStoreCount > 0 && liveOfferCount > 0) {
    return {
      phase: `Limited live data — only ${liveOfferCount} live offer${
        liveOfferCount === 1 ? "" : "s"
      } from ${liveStoreCount} store${
        liveStoreCount === 1 ? "" : "s"
      }. Other prices may be modeled or est.`,
      tone: "warn",
    };
  }
  return {
    phase:
      "No live Kroger prices for this run — plan uses modeled/est. figures, not a live-priced result.",
    tone: "warn",
  };
}

/** Fraction below 30-day median to count as a deal badge (8%). */
export const DEAL_BELOW_MEDIAN_PCT = 0.08;
/** Need enough observations before showing a deal signal. */
export const DEAL_MIN_HISTORY_POINTS = 3;

export type DealSignal = {
  pctBelowMedian: number;
  medianUsd: number;
  currentUsd: number;
};

export function medianOf(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return round2((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

/** Effective shelf price for a history point (sale when on). */
export function historyPointPrice(point: {
  priceUsd: number;
  salePriceUsd?: number | null;
  onSale?: boolean;
}): number {
  if (point.onSale && point.salePriceUsd != null) return point.salePriceUsd;
  return point.priceUsd;
}

/**
 * Compare current price to median of recent observations.
 * Returns null when history is thin or the drop is below the threshold.
 */
export function dealSignalFromHistory(
  currentUsd: number,
  history: Array<{
    priceUsd: number;
    salePriceUsd?: number | null;
    onSale?: boolean;
  }>,
  opts?: { minPoints?: number; belowMedianPct?: number },
): DealSignal | null {
  const minPoints = opts?.minPoints ?? DEAL_MIN_HISTORY_POINTS;
  const belowPct = opts?.belowMedianPct ?? DEAL_BELOW_MEDIAN_PCT;
  if (!(currentUsd > 0) || history.length < minPoints) return null;

  const prices = history.map(historyPointPrice).filter((p) => p > 0);
  if (prices.length < minPoints) return null;

  const medianUsd = medianOf(prices);
  if (medianUsd == null || !(medianUsd > 0)) return null;

  const pctBelowMedian = (medianUsd - currentUsd) / medianUsd;
  if (pctBelowMedian < belowPct) return null;

  return {
    pctBelowMedian: Math.round(pctBelowMedian * 10_000) / 10_000,
    medianUsd,
    currentUsd: round2(currentUsd),
  };
}

export function dealBadgeLabel(signal: DealSignal): string {
  const pct = Math.round(signal.pctBelowMedian * 100);
  return pct >= 1 ? `${pct}% below usual` : "Below usual";
}
