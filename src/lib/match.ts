import { effectivePrice } from "./pricing";
import { isKosher, isOrganicOrNonGmo, preferenceSortKey } from "./preferences";
import { brandsMatch } from "./product-generics";
import type {
  Coupon,
  DietPreferences,
  GroceryList,
  ItemMatchResult,
  MatchedOffer,
  Offer,
  Store,
} from "./types";

const SYNONYMS: Record<string, string[]> = {
  "milk-gallon": ["milk", "whole milk", "gallon milk", "dairy milk"],
  "eggs-dozen": ["eggs", "dozen eggs", "egg", "cage free eggs", "cage-free eggs"],
  "bread-wheat": [
    "bread",
    "wheat bread",
    "loaf",
    "sandwich bread",
    "whole wheat loaf",
    "whole wheat bread",
  ],
  bananas: ["banana", "bananas"],
  "chicken-breast": ["chicken", "chicken breast", "poultry"],
  "rice-white": ["rice", "white rice", "jasmine rice"],
  // Never alias bare "beans" — that matches black beans incorrectly.
  "coffee-ground": ["coffee", "ground coffee", "coffee grounds"],
  "olive-oil": ["olive oil", "evoo"],
  yogurt: ["yogurt", "yoghurt", "greek yogurt"],
  "cheddar-cheese": ["cheddar", "cheddar cheese", "cheese"],
  tomatoes: ["tomato", "tomatoes"],
  oatmeal: ["oatmeal", "oats", "rolled oats"],
  "paper-towels": ["paper towels", "paper towel", "towels"],
  salsa: ["salsa", "picante"],
  garlic: ["garlic", "garlic bulb"],
  sugar: ["sugar", "white sugar", "granulated sugar"],
  flour: ["flour", "all purpose flour", "ap flour"],
  "ground-beef": ["ground beef", "hamburger", "beef mince", "minced beef"],
  "black-beans": ["black beans", "black bean"],
};

/** Tokens that must not collide across unrelated intents. */
const CONFLICT_GROUPS: string[][] = [
  ["beef", "chicken", "turkey", "pork", "fish", "salmon"],
  ["milk", "yogurt", "cheese", "butter"],
  ["coffee", "tea"],
  ["beans", "rice", "pasta", "oatmeal", "oats"],
  ["towel", "towels", "soap"],
];

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

function hasConflict(query: string, candidate: string): boolean {
  const q = tokenSet(query);
  const c = tokenSet(candidate);
  for (const group of CONFLICT_GROUPS) {
    const qHit = group.filter((t) => q.has(t));
    const cHit = group.filter((t) => c.has(t));
    // Either side introduces a different product type from the same family.
    if (
      qHit.length &&
      cHit.length &&
      (qHit.some((t) => !cHit.includes(t)) || cHit.some((t) => !qHit.includes(t)))
    ) {
      return true;
    }
  }
  return false;
}

function productBoost(query: string, productId: string): number {
  const q = normalize(query);
  const aliases = SYNONYMS[productId] ?? [productId.replace(/-/g, " ")];
  let best = 0;
  for (const alias of aliases) {
    if (hasConflict(q, alias)) continue;
    if (q === alias) best = Math.max(best, 1);
    else if (q.includes(alias) || alias.includes(q)) best = Math.max(best, 0.9);
    else {
      const jac = jaccard(tokenSet(q), tokenSet(alias));
      // Require a strong token overlap for synonym jaccard (avoids "ground" alone).
      if (jac >= 0.5) best = Math.max(best, jac);
    }
  }
  return best;
}

export function scoreOffer(
  query: string,
  offer: Offer,
  prefs: DietPreferences,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const haystack = `${offer.name} ${offer.brand ?? ""} ${offer.productId.replace(/-/g, " ")}`;
  if (hasConflict(query, haystack)) {
    return { score: 0, reasons: ["Conflicting product type"] };
  }

  const qNorm = normalize(query);
  const nameNorm = normalize(`${offer.name} ${offer.brand ?? ""}`);
  let nameScore = jaccard(tokenSet(query), tokenSet(`${offer.name} ${offer.brand ?? ""}`));
  // Live API titles are long ("Fairlife Milk 2% Chocolate…") — require containment, not high Jaccard.
  if (qNorm && nameNorm.includes(qNorm)) {
    const qTokens = qNorm.split(" ").filter(Boolean);
    nameScore = Math.max(nameScore, qTokens.length <= 2 ? 0.72 : 0.55);
  }
  const intentScore = productBoost(query, offer.productId);

  // Reject weak accidental overlaps (e.g. "ground" in ground beef vs ground coffee).
  if (nameScore < 0.34 && intentScore < 0.55) {
    return { score: 0, reasons: ["Weak match"] };
  }

  const base = Math.max(nameScore, intentScore) * 100;
  let score = base;

  if (intentScore >= 0.7) reasons.push("Close match to your item");
  else if (nameScore >= 0.35) reasons.push("Similar product name");
  else reasons.push("Approximate match");

  if (base < 35) {
    return { score, reasons };
  }

  if (offer.onSale) {
    score += 4;
    reasons.push("On sale");
  }
  if (prefs.preferLocal && offer.isLocal) {
    score += 12;
    reasons.push(offer.localOrigin ? `Local: ${offer.localOrigin}` : "Locally sourced");
  } else if (offer.isLocal) {
    score += 2;
  }
  if (prefs.preferOrganic && isOrganicOrNonGmo(offer)) {
    score += 10;
    reasons.push(offer.isOrganic ? "Organic" : "Non-GMO");
  } else if (isOrganicOrNonGmo(offer)) {
    score += 2;
  }
  if (prefs.preferKosher && isKosher(offer)) {
    score += 10;
    reasons.push("Kosher");
  } else if (isKosher(offer)) {
    score += 1;
  }
  if (offer.priceSource === "live") {
    score += 20;
    reasons.push("Live store price");
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
  const allowed = storeIds !== undefined ? new Set(storeIds) : null;
  const prefs: DietPreferences = {
    preferLocal: list.preferLocal,
    preferOrganic: list.preferOrganic,
    preferKosher: list.preferKosher,
  };

  return list.items.map((item) => {
    const candidates: MatchedOffer[] = [];

    for (const offer of offers) {
      if (allowed && !allowed.has(offer.storeId)) continue;
      const store = storeMap.get(offer.storeId);
      if (!store) continue;

      const { score, reasons } = scoreOffer(item.query, offer, prefs);
      if (score < 28) continue;

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
      if (item.preferredBrand) {
        const aBrand = brandsMatch(a.offer.brand ?? a.offer.name, item.preferredBrand) ? 1 : 0;
        const bBrand = brandsMatch(b.offer.brand ?? b.offer.name, item.preferredBrand) ? 1 : 0;
        if (aBrand !== bBrand) return bBrand - aBrand;
      }
      if (item.preferredProductId) {
        const aProd = a.offer.productId === item.preferredProductId ? 1 : 0;
        const bProd = b.offer.productId === item.preferredProductId ? 1 : 0;
        if (aProd !== bProd) return bProd - aProd;
      }
      const prefDiff = preferenceSortKey(b.offer, prefs) - preferenceSortKey(a.offer, prefs);
      if (prefDiff !== 0) return prefDiff;
      if (b.score !== a.score) return b.score - a.score;
      return a.effectivePriceUsd - b.effectivePriceUsd;
    });

    return {
      itemId: item.id,
      query: item.query,
      quantity: item.quantity,
      matches: candidates.slice(0, 8),
      selectedOfferId: item.selectedOfferId,
      preferredBrand: item.preferredBrand,
      preferredProductId: item.preferredProductId,
    };
  });
}
