import { effectivePrice } from "./pricing";
import type {
  Coupon,
  GroceryList,
  ItemMatchResult,
  MatchedOffer,
  Offer,
  Store,
} from "./types";

const SYNONYMS: Record<string, string[]> = {
  "milk-gallon": ["milk", "whole milk", "gallon milk", "dairy milk"],
  "eggs-dozen": ["eggs", "dozen eggs", "egg", "cage free eggs"],
  "bread-wheat": ["bread", "wheat bread", "loaf", "sandwich bread"],
  bananas: ["banana", "bananas"],
  "chicken-breast": ["chicken", "chicken breast", "poultry"],
  "rice-white": ["rice", "white rice", "jasmine rice"],
  "coffee-ground": ["coffee", "ground coffee", "beans"],
  "olive-oil": ["olive oil", "evoo", "oil"],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function productBoost(query: string, productId: string): number {
  const q = normalize(query);
  const aliases = SYNONYMS[productId] ?? [productId.replace(/-/g, " ")];
  let best = 0;
  for (const alias of aliases) {
    if (q === alias) best = Math.max(best, 1);
    else if (q.includes(alias) || alias.includes(q)) best = Math.max(best, 0.85);
    else best = Math.max(best, jaccard(tokenSet(q), tokenSet(alias)));
  }
  return best;
}

export function scoreOffer(
  query: string,
  offer: Offer,
  preferLocal: boolean,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const nameScore = jaccard(tokenSet(query), tokenSet(`${offer.name} ${offer.brand ?? ""}`));
  const intentScore = productBoost(query, offer.productId);
  let score = Math.max(nameScore, intentScore) * 100;

  if (intentScore >= 0.7) reasons.push("Close match to your item");
  else if (nameScore >= 0.35) reasons.push("Similar product name");
  else reasons.push("Approximate match");

  if (offer.onSale) {
    score += 4;
    reasons.push("On sale");
  }
  if (preferLocal && offer.isLocal) {
    score += 12;
    reasons.push(offer.localOrigin ? `Local: ${offer.localOrigin}` : "Locally sourced");
  } else if (offer.isLocal) {
    score += 2;
  }

  return { score, reasons };
}

export function matchListItems(
  list: GroceryList,
  offers: Offer[],
  stores: Store[],
  coupons: Coupon[],
  storeIds?: string[],
): ItemMatchResult[] {
  const storeMap = new Map(stores.map((s) => [s.id, s]));
  const allowed = storeIds?.length ? new Set(storeIds) : null;

  return list.items.map((item) => {
    const candidates: MatchedOffer[] = [];

    for (const offer of offers) {
      if (allowed && !allowed.has(offer.storeId)) continue;
      const store = storeMap.get(offer.storeId);
      if (!store) continue;

      const { score, reasons } = scoreOffer(item.query, offer, list.preferLocal);
      if (score < 18) continue;

      const priced = effectivePrice(offer, coupons);
      candidates.push({
        offer,
        store,
        effectivePriceUsd: priced.priceUsd,
        appliedCouponIds: priced.appliedCouponIds,
        score,
        reasons,
      });
    }

    candidates.sort((a, b) => {
      if (list.preferLocal && a.offer.isLocal !== b.offer.isLocal) {
        return a.offer.isLocal ? -1 : 1;
      }
      if (b.score !== a.score) return b.score - a.score;
      return a.effectivePriceUsd - b.effectivePriceUsd;
    });

    return {
      itemId: item.id,
      query: item.query,
      quantity: item.quantity,
      matches: candidates.slice(0, 8),
      selectedOfferId: item.selectedOfferId,
    };
  });
}
