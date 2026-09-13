import type { DietPreferences, Offer } from "./types";

export function isOrganicOrNonGmo(offer: Offer): boolean {
  return Boolean(offer.isOrganic || offer.isNonGmo);
}

export function isKosher(offer: Offer): boolean {
  return Boolean(offer.isKosher);
}

export function preferenceSortKey(offer: Offer, prefs: DietPreferences): number {
  let key = 0;
  if (prefs.preferLocal && offer.isLocal) key += 4;
  if (prefs.preferOrganic && isOrganicOrNonGmo(offer)) key += 2;
  if (prefs.preferKosher && isKosher(offer)) key += 1;
  return key;
}

export function shouldPreferOffer(
  a: Offer,
  b: Offer,
  prefs: DietPreferences,
  priceA: number,
  priceB: number,
  maxDelta = 0.15,
): number {
  const priceDelta =
    Math.abs(priceA - priceB) / Math.max(priceA, priceB, 0.01);
  if (priceDelta > maxDelta) return 0;

  const diff = preferenceSortKey(b, prefs) - preferenceSortKey(a, prefs);
  if (diff !== 0) return diff > 0 ? 1 : -1;
  return 0;
}
