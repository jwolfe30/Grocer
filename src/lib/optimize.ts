import { matchListItems } from "./match";
import { brandsMatch } from "./product-generics";
import { shouldPreferOffer } from "./preferences";
import { effectivePrice, round2 } from "./pricing";
import type {
  CartPlan,
  Coupon,
  GroceryList,
  ItemMatchResult,
  MatchedOffer,
  OptimizeResult,
  Offer,
  PlanLine,
  PlanLineReplacement,
  Store,
} from "./types";

function lineFromOffer(
  itemId: string,
  query: string,
  quantity: number,
  offer: Offer,
  store: Store,
  coupons: Coupon[],
  extras?: {
    brandPreferred?: boolean;
    recommendedReplacement?: PlanLineReplacement;
  },
): PlanLine {
  const priced = effectivePrice(offer, coupons);
  return {
    itemId,
    query,
    quantity,
    offer,
    storeId: store.id,
    storeName: store.name,
    unitPriceUsd: priced.priceUsd,
    lineTotalUsd: round2(priced.priceUsd * quantity),
    appliedCouponIds: priced.appliedCouponIds,
    isLocal: offer.isLocal,
    brandPreferred: extras?.brandPreferred,
    recommendedReplacement: extras?.recommendedReplacement,
  };
}

export const UNMATCHED_STORE_ID = "__unmatched__";

function unmatchedLine(
  itemId: string,
  query: string,
  quantity: number,
): PlanLine {
  return {
    itemId,
    query,
    quantity,
    offer: {
      id: `unmatched-${itemId}`,
      storeId: UNMATCHED_STORE_ID,
      productId: "unmatched",
      name: `Still need: ${query}`,
      category: "grocery",
      sizeLabel: "—",
      priceUsd: 0,
      unitAmount: 1,
      unitName: "each",
      isLocal: false,
      onSale: false,
      couponIds: [],
      priceSource: "modeled",
    },
    storeId: UNMATCHED_STORE_ID,
    storeName: "No price match yet",
    unitPriceUsd: 0,
    lineTotalUsd: 0,
    appliedCouponIds: [],
    isLocal: false,
  };
}

function planFromLines(
  id: string,
  label: string,
  kind: CartPlan["kind"],
  lines: PlanLine[],
  cheapestSingle: number,
): CartPlan {
  const pricedStoreIds = [
    ...new Set(lines.filter((l) => l.storeId !== UNMATCHED_STORE_ID).map((l) => l.storeId)),
  ];
  const storeIds = [
    ...pricedStoreIds,
    ...lines.some((l) => l.storeId === UNMATCHED_STORE_ID) ? [UNMATCHED_STORE_ID] : [],
  ];
  const subtotalUsd = round2(
    lines
      .filter((l) => l.storeId !== UNMATCHED_STORE_ID)
      .reduce((sum, l) => sum + l.lineTotalUsd, 0),
  );
  return {
    id,
    label,
    kind,
    storeIds,
    lines,
    subtotalUsd,
    savingsVsCheapestSingleUsd: round2(Math.max(0, cheapestSingle - subtotalUsd)),
    stops: pricedStoreIds.length,
    localItemCount: lines.filter((l) => l.isLocal).length,
  };
}

function withUnresolved(
  lines: PlanLine[],
  unresolved: ItemMatchResult[],
): PlanLine[] {
  if (!unresolved.length) return lines;
  return [
    ...lines,
    ...unresolved.map((item) => unmatchedLine(item.itemId, item.query, item.quantity)),
  ];
}

function isBrandMatch(offer: Offer, preferredBrand?: string) {
  if (!preferredBrand) return false;
  return brandsMatch(offer.brand ?? offer.name, preferredBrand);
}

/** live > crowd/ad > modeled/demo (weak). */
function priceSourceStrength(source?: Offer["priceSource"]): number {
  if (source === "live") return 3;
  if (source === "crowd" || source === "ad") return 2;
  return 1;
}

/** Prefer live (then secondary sources) when prices are within ~15%. */
const LIVE_PRICE_SLACK = 0.15;

function compareMatchedByLiveThenPrice(a: MatchedOffer, b: MatchedOffer): number {
  const priceDelta =
    Math.abs(a.effectivePriceUsd - b.effectivePriceUsd) /
    Math.max(a.effectivePriceUsd, b.effectivePriceUsd, 0.01);
  if (priceDelta <= LIVE_PRICE_SLACK) {
    const aLive = a.offer.priceSource === "live" ? 1 : 0;
    const bLive = b.offer.priceSource === "live" ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    const strength =
      priceSourceStrength(b.offer.priceSource) -
      priceSourceStrength(a.offer.priceSource);
    if (strength !== 0) return strength;
  }
  return a.effectivePriceUsd - b.effectivePriceUsd;
}

function livePricedLineCount(lines: PlanLine[]): number {
  return lines.filter(
    (l) =>
      l.storeId !== UNMATCHED_STORE_ID && l.offer.priceSource === "live",
  ).length;
}

/**
 * Live-first plan ranking: more live lines beat cheaper modeled-only carts,
 * then preferFewerStops / subtotal.
 */
function comparePlansLiveFirst(
  a: CartPlan,
  b: CartPlan,
  preferFewerStops: boolean,
  threshold: number,
): number {
  const aLive = livePricedLineCount(a.lines);
  const bLive = livePricedLineCount(b.lines);

  // Launch bar: any live coverage ranks above a fully non-live plan.
  if ((aLive === 0) !== (bLive === 0)) return bLive - aLive;
  if (aLive !== bLive) return bLive - aLive;

  if (a.stops !== b.stops && preferFewerStops) {
    const close =
      Math.abs(a.subtotalUsd - b.subtotalUsd) <= Math.max(1, threshold * 0.25);
    if (close) return a.stops - b.stops;
  }
  return a.subtotalUsd - b.subtotalUsd;
}

function bestAlternate(
  picked: MatchedOffer,
  pool: MatchedOffer[],
  quantity: number,
): PlanLineReplacement | undefined {
  const better = [...pool]
    .filter((m) => m.offer.id !== picked.offer.id)
    .sort((a, b) => a.effectivePriceUsd - b.effectivePriceUsd)[0];
  if (!better) return undefined;
  const savings = round2((picked.effectivePriceUsd - better.effectivePriceUsd) * quantity);
  if (savings < 0.25) return undefined;
  return {
    offer: better.offer,
    storeId: better.offer.storeId,
    storeName: better.store.name,
    unitPriceUsd: better.effectivePriceUsd,
    lineTotalUsd: round2(better.effectivePriceUsd * quantity),
    savingsUsd: savings,
    reason: `Save ${savings.toFixed(2)} with ${better.offer.name} at ${better.store.name}`,
  };
}

function pickForItem(
  item: ItemMatchResult,
  list: GroceryList,
  storeFilter?: string | Set<string>,
): {
  pick: MatchedOffer;
  brandPreferred: boolean;
  replacement?: PlanLineReplacement;
} | null {
  const pool = !storeFilter
    ? item.matches
    : typeof storeFilter === "string"
      ? item.matches.filter((m) => m.offer.storeId === storeFilter)
      : item.matches.filter((m) => storeFilter.has(m.offer.storeId));
  if (!pool.length) return null;

  const locked = item.selectedOfferId
    ? pool.find((m) => m.offer.id === item.selectedOfferId)
    : undefined;

  let pick: MatchedOffer | undefined = locked;
  let brandPreferred = false;

  if (!pick && item.preferredBrand) {
    const brandPool = pool.filter((m) => isBrandMatch(m.offer, item.preferredBrand));
    if (brandPool.length) {
      pick = [...brandPool].sort(compareMatchedByLiveThenPrice)[0];
      brandPreferred = true;
    }
  }

  if (!pick) {
    const ranked = [...pool].sort((a, b) => {
      const pref = shouldPreferOffer(
        a.offer,
        b.offer,
        {
          preferLocal: list.preferLocal,
          preferOrganic: list.preferOrganic,
          preferKosher: list.preferKosher,
        },
        a.effectivePriceUsd,
        b.effectivePriceUsd,
      );
      if (pref !== 0) return pref;
      return compareMatchedByLiveThenPrice(a, b);
    });
    pick = ranked[0];
  }

  if (!pick) return null;

  const replacementPool = typeof storeFilter === "string" ? pool : item.matches;
  const replacement =
    locked || brandPreferred
      ? bestAlternate(pick, replacementPool, item.quantity)
      : undefined;

  return { pick, brandPreferred, replacement };
}

function linesToChosenMap(lines: PlanLine[]): Map<string, string> {
  return new Map(lines.map((line) => [line.itemId, line.storeId]));
}

function rebuildLines(
  resolved: ItemMatchResult[],
  assignment: Map<string, string>,
  list: GroceryList,
  storeMap: Map<string, Store>,
  coupons: Coupon[],
): PlanLine[] | null {
  const lines: PlanLine[] = [];
  for (const item of resolved) {
    const storeId = assignment.get(item.itemId);
    if (!storeId) return null;
    const chosen = pickForItem(item, list, storeId);
    const store = storeMap.get(storeId);
    if (!chosen || !store) return null;
    lines.push(
      lineFromOffer(
        item.itemId,
        item.query,
        item.quantity,
        chosen.pick.offer,
        store,
        coupons,
        {
          brandPreferred: chosen.brandPreferred,
          recommendedReplacement: chosen.replacement,
        },
      ),
    );
  }
  return lines;
}

/** Savings from keeping `stopId` vs buying those items at other kept stores. */
function evaluateStop(
  stopId: string,
  assignment: Map<string, string>,
  resolved: ItemMatchResult[],
  list: GroceryList,
  keptStoreIds: Set<string>,
): {
  itemCount: number;
  savingsUsd: number;
  lockedHere: boolean;
  deepestSalePct: number;
  maxLineListUsd: number;
} {
  const itemsHere = resolved.filter((item) => assignment.get(item.itemId) === stopId);
  let savingsUsd = 0;
  let lockedHere = false;
  let deepestSalePct = 0;
  let maxLineListUsd = 0;
  const fallbackStores = new Set([...keptStoreIds].filter((id) => id !== stopId));

  for (const item of itemsHere) {
    const here = pickForItem(item, list, stopId);
    if (!here) continue;
    if (
      item.selectedOfferId &&
      item.matches.some(
        (m) => m.offer.id === item.selectedOfferId && m.offer.storeId === stopId,
      )
    ) {
      lockedHere = true;
    }

    const listUsd = here.pick.offer.priceUsd * item.quantity;
    maxLineListUsd = Math.max(maxLineListUsd, listUsd);
    if (here.pick.offer.onSale && here.pick.offer.priceUsd > 0) {
      const depth =
        1 - here.pick.effectivePriceUsd / Math.max(here.pick.offer.priceUsd, 0.01);
      deepestSalePct = Math.max(deepestSalePct, depth);
    }

    const alt = fallbackStores.size
      ? pickForItem(item, list, fallbackStores)
      : pickForItem(
          item,
          list,
          new Set(
            item.matches
              .map((m) => m.offer.storeId)
              .filter((id) => id !== stopId),
          ),
        );
    if (!alt) {
      lockedHere = true;
      continue;
    }
    savingsUsd += (alt.pick.effectivePriceUsd - here.pick.effectivePriceUsd) * item.quantity;
  }

  return {
    itemCount: itemsHere.length,
    savingsUsd: round2(savingsUsd),
    lockedHere,
    deepestSalePct,
    maxLineListUsd,
  };
}

/**
 * Keep an extra stop only when the detour is worth it.
 * One-item stops need meaningful absolute savings plus a strong sale / expensive item.
 */
function isStopWorthKeeping(
  evalResult: ReturnType<typeof evaluateStop>,
  threshold: number,
): boolean {
  if (evalResult.lockedHere) return true;
  if (evalResult.itemCount === 0) return false;
  if (evalResult.savingsUsd <= 0.05) return false;

  if (evalResult.itemCount === 1) {
    const expensive = evalResult.maxLineListUsd >= 8;
    const superSale = evalResult.deepestSalePct >= 0.25;
    const bigAbsolute = evalResult.savingsUsd >= Math.max(threshold, 5);
    const solidDeal = evalResult.savingsUsd >= 2.5 && expensive && superSale;
    return bigAbsolute || solidDeal;
  }

  if (evalResult.itemCount === 2) {
    return evalResult.savingsUsd >= Math.max(threshold * 0.55, 3);
  }

  return evalResult.savingsUsd >= Math.max(threshold * 0.35, 2);
}

function consolidateStops(
  greedyLines: PlanLine[],
  resolved: ItemMatchResult[],
  list: GroceryList,
  storeMap: Map<string, Store>,
  coupons: Coupon[],
  threshold: number,
  maxStops?: number,
): PlanLine[] {
  let assignment = linesToChosenMap(greedyLines);

  const rankStores = () => {
    const counts = new Map<string, { count: number; spend: number }>();
    for (const [itemId, storeId] of assignment) {
      const item = resolved.find((r) => r.itemId === itemId);
      const chosen = item ? pickForItem(item, list, storeId) : null;
      const prev = counts.get(storeId) ?? { count: 0, spend: 0 };
      prev.count += 1;
      prev.spend += chosen ? chosen.pick.effectivePriceUsd * (item?.quantity ?? 1) : 0;
      counts.set(storeId, prev);
    }
    return [...counts.entries()].sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return b[1].spend - a[1].spend;
    });
  };

  // Drop weak secondary stops (especially one-item detours).
  let changed = true;
  let guard = 0;
  while (changed && guard++ < storeMap.size + 2) {
    changed = false;
    const ranked = rankStores();
    if (ranked.length <= 1) break;
    const kept = new Set(ranked.map(([id]) => id));
    // Prune weakest first (fewest items, then least spend).
    const secondary = [...ranked].slice(1).reverse();
    for (const [stopId] of secondary) {
      const evaluation = evaluateStop(stopId, assignment, resolved, list, kept);
      if (isStopWorthKeeping(evaluation, threshold)) continue;

      const next = new Map(assignment);
      const fallback = new Set([...kept].filter((id) => id !== stopId));
      let ok = true;
      for (const item of resolved) {
        if (next.get(item.itemId) !== stopId) continue;
        const alt = pickForItem(item, list, fallback);
        if (!alt) {
          ok = false;
          break;
        }
        next.set(item.itemId, alt.pick.offer.storeId);
      }
      if (!ok) continue;
      assignment = next;
      kept.delete(stopId);
      changed = true;
      break;
    }
  }

  // Hard cap on stops: keep primary stores, reassign the rest.
  if (maxStops && maxStops >= 1) {
    let ranked = rankStores();
    let capGuard = 0;
    while (ranked.length > maxStops && capGuard++ < storeMap.size + 2) {
      const dropId = ranked[ranked.length - 1][0];
      const keepIds = new Set(ranked.slice(0, -1).map(([id]) => id));
      const next = new Map(assignment);
      let ok = true;
      for (const item of resolved) {
        if (next.get(item.itemId) !== dropId) continue;
        const alt = pickForItem(item, list, keepIds);
        if (!alt) {
          ok = false;
          break;
        }
        next.set(item.itemId, alt.pick.offer.storeId);
      }
      if (!ok) break;
      const before = ranked.length;
      assignment = next;
      ranked = rankStores();
      if (ranked.length >= before) break;
    }
  }

  return rebuildLines(resolved, assignment, list, storeMap, coupons) ?? greedyLines;
}

export function optimizeCart(
  list: GroceryList,
  offers: Offer[],
  stores: Store[],
  coupons: Coupon[],
  options?: {
    storeIds?: string[];
    savingsThresholdUsd?: number;
    preferFewerStops?: boolean;
    maxStops?: number;
  },
): OptimizeResult {
  const matches = matchListItems(list, offers, stores, coupons, options?.storeIds);
  return buildPlansFromMatches(list, matches, stores, coupons, options);
}

/** Rebuild plans from existing matches (no catalog / API fetch). */
export function buildPlansFromMatches(
  list: GroceryList,
  matches: ItemMatchResult[],
  stores: Store[],
  coupons: Coupon[],
  options?: {
    storeIds?: string[];
    savingsThresholdUsd?: number;
    preferFewerStops?: boolean;
    maxStops?: number;
  },
): OptimizeResult {
  const threshold = options?.savingsThresholdUsd ?? list.savingsThresholdUsd;
  const preferFewerStops = options?.preferFewerStops !== false;
  const maxStops = options?.maxStops;
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  const unresolved = matches.filter((m) => m.matches.length === 0);
  const resolved = matches.filter((m) => m.matches.length > 0);

  const storeIdsInPlay = [
    ...new Set(resolved.flatMap((m) => m.matches.map((x) => x.offer.storeId))),
  ];

  const singlePlans: CartPlan[] = [];

  for (const storeId of storeIdsInPlay) {
    const store = storeMap.get(storeId);
    if (!store) continue;
    const lines: PlanLine[] = [];
    let complete = true;

    for (const item of resolved) {
      const lockedElsewhere =
        item.selectedOfferId &&
        item.matches.some(
          (m) => m.offer.id === item.selectedOfferId && m.offer.storeId !== storeId,
        );
      if (lockedElsewhere) {
        complete = false;
        break;
      }

      const chosen = pickForItem(item, list, storeId);
      if (!chosen) {
        complete = false;
        break;
      }
      lines.push(
        lineFromOffer(
          item.itemId,
          item.query,
          item.quantity,
          chosen.pick.offer,
          store,
          coupons,
          {
            brandPreferred: chosen.brandPreferred,
            recommendedReplacement: chosen.replacement,
          },
        ),
      );
    }

    if (complete && lines.length === resolved.length) {
      singlePlans.push(
        planFromLines(
          `single-${storeId}`,
          `All at ${store.name}`,
          "single_store",
          withUnresolved(lines, unresolved),
          0,
        ),
      );
    }
  }

  // True cheapest subtotal (for savings math) — independent of live-first display rank.
  const cheapestSingle =
    singlePlans.length === 0
      ? 0
      : Math.min(...singlePlans.map((p) => p.subtotalUsd));
  singlePlans.sort((a, b) =>
    comparePlansLiveFirst(a, b, preferFewerStops, threshold),
  );
  for (const plan of singlePlans) {
    plan.savingsVsCheapestSingleUsd = round2(
      Math.max(0, cheapestSingle - plan.subtotalUsd),
    );
  }

  const greedyMultiLines: PlanLine[] = [];
  for (const item of resolved) {
    const chosen = pickForItem(item, list);
    if (!chosen) continue;
    const store = storeMap.get(chosen.pick.offer.storeId);
    if (!store) continue;
    greedyMultiLines.push(
      lineFromOffer(
        item.itemId,
        item.query,
        item.quantity,
        chosen.pick.offer,
        store,
        coupons,
        {
          brandPreferred: chosen.brandPreferred,
          recommendedReplacement: chosen.replacement,
        },
      ),
    );
  }

  const multiLines =
    preferFewerStops || maxStops
      ? consolidateStops(
          greedyMultiLines,
          resolved,
          list,
          storeMap,
          coupons,
          threshold,
          maxStops,
        )
      : greedyMultiLines;

  const multiStopCount = new Set(multiLines.map((l) => l.storeId)).size;
  const multiPlan = planFromLines(
    "multi-best",
    multiStopCount > 1
      ? preferFewerStops
        ? `Split · ${multiStopCount} stops (trimmed)`
        : "Split across stores"
      : "Consolidated to one store",
    multiStopCount > 1 ? "multi_store" : "single_store",
    withUnresolved(multiLines, unresolved),
    cheapestSingle || multiLines.reduce((s, l) => s + l.lineTotalUsd, 0),
  );

  const plans = [...singlePlans];
  if (
    multiPlan.stops > 1 &&
    multiLines.length === resolved.length
  ) {
    plans.push(multiPlan);
  }

  // Optional: show the untrimmed split when fewer-stops mode removed a stop.
  if (
    preferFewerStops &&
    greedyMultiLines.length === resolved.length &&
    new Set(greedyMultiLines.map((l) => l.storeId)).size > multiPlan.stops &&
    new Set(greedyMultiLines.map((l) => l.storeId)).size > 1
  ) {
    const raw = planFromLines(
      "multi-raw",
      "Split · all cheapest (more stops)",
      "multi_store",
      withUnresolved(greedyMultiLines, unresolved),
      cheapestSingle || greedyMultiLines.reduce((s, l) => s + l.lineTotalUsd, 0),
    );
    plans.push(raw);
  }

  plans.sort((a, b) => comparePlansLiveFirst(a, b, preferFewerStops, threshold));

  const cheapest = plans[0];
  const bestSingle = singlePlans[0];
  let recommended = bestSingle ?? cheapest;
  let explanation = "No complete cart could be built from the current matches.";

  const multiCandidate =
    plans.find((p) => p.id === "multi-best" && p.stops > 1) ??
    plans.find((p) => p.kind === "multi_store");

  if (bestSingle && multiCandidate) {
    const savings = round2(bestSingle.subtotalUsd - multiCandidate.subtotalUsd);
    if (savings >= threshold) {
      recommended = multiCandidate;
      explanation = `Multi-store saves $${savings.toFixed(2)} vs the cheapest single store (≥ $${threshold.toFixed(2)} threshold, ${multiCandidate.stops} stops).`;
      if (preferFewerStops && multiCandidate.id === "multi-best") {
        explanation +=
          " Extra one-item stops were dropped unless the deal was strong enough.";
      }
    } else {
      recommended = bestSingle;
      explanation =
        savings > 0
          ? `Multi-store only saves $${savings.toFixed(2)}, below your $${threshold.toFixed(2)} threshold — stick to ${bestSingle.label}.`
          : `${bestSingle.label} is already the lowest total.`;
    }
  } else if (bestSingle) {
    recommended = bestSingle;
    explanation = `${bestSingle.label} covers your list for $${bestSingle.subtotalUsd.toFixed(2)}.`;
    if (preferFewerStops && greedyMultiLines.length && multiStopCount === 1) {
      explanation +=
        " Extra stops were consolidated — one-item detours were not worth the trip.";
    }
  }

  if (maxStops === 1 && bestSingle) {
    recommended = bestSingle;
    explanation = `Max stops set to 1 — using ${bestSingle.label} for $${bestSingle.subtotalUsd.toFixed(2)}.`;
  }

  if (unresolved.length) {
    explanation += ` ${unresolved.length} item(s) had no priced match — kept on the plan under “No price match yet”.`;
  }

  return {
    matches,
    plans,
    recommendedPlanId: recommended?.id ?? "",
    explanation,
  };
}
