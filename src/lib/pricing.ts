import type { Coupon, Offer } from "./types";

export function basePrice(offer: Offer): number {
  if (offer.onSale && offer.salePriceUsd != null) {
    return offer.salePriceUsd;
  }
  return offer.priceUsd;
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

/** Apply the single best coupon (highest absolute savings) after sale price. */
export function effectivePrice(
  offer: Offer,
  coupons: Coupon[],
): { priceUsd: number; appliedCouponIds: string[] } {
  const sale = basePrice(offer);
  const applicable = couponsForOffer(offer, coupons).filter((c) => {
    if (c.minSpendUsd != null && sale < c.minSpendUsd) return false;
    return true;
  });

  let best = sale;
  let bestIds: string[] = [];

  for (const coupon of applicable) {
    let next = sale;
    if (coupon.amountOffUsd != null) next -= coupon.amountOffUsd;
    if (coupon.percentOff != null) next -= sale * (coupon.percentOff / 100);
    next = Math.max(0, round2(next));
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
    let next = sale;
    if (coupon.amountOffUsd != null) next -= coupon.amountOffUsd;
    if (coupon.percentOff != null) next -= sale * (coupon.percentOff / 100);
    next = Math.max(0, round2(next));
    if (next < best) {
      best = next;
      bestIds = [coupon.id];
    }
  }

  return { priceUsd: best, appliedCouponIds: bestIds };
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
