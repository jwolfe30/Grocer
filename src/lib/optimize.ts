import { matchListItems } from "./match";
import { effectivePrice, round2 } from "./pricing";
import type {
  CartPlan,
  Coupon,
  GroceryList,
  OptimizeResult,
  Offer,
  PlanLine,
  Store,
} from "./types";

function lineFromOffer(
  itemId: string,
  query: string,
  quantity: number,
  offer: Offer,
  store: Store,
  coupons: Coupon[],
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
  };
}

function planFromLines(
  id: string,
  label: string,
  kind: CartPlan["kind"],
  lines: PlanLine[],
  cheapestSingle: number,
): CartPlan {
  const storeIds = [...new Set(lines.map((l) => l.storeId))];
  const subtotalUsd = round2(lines.reduce((sum, l) => sum + l.lineTotalUsd, 0));
  return {
    id,
    label,
    kind,
    storeIds,
    lines,
    subtotalUsd,
    savingsVsCheapestSingleUsd: round2(Math.max(0, cheapestSingle - subtotalUsd)),
    stops: storeIds.length,
    localItemCount: lines.filter((l) => l.isLocal).length,
  };
}

export function optimizeCart(
  list: GroceryList,
  offers: Offer[],
  stores: Store[],
  coupons: Coupon[],
  options?: { storeIds?: string[]; savingsThresholdUsd?: number },
): OptimizeResult {
  const threshold = options?.savingsThresholdUsd ?? list.savingsThresholdUsd;
  const matches = matchListItems(list, offers, stores, coupons, options?.storeIds);
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
      const locked = item.selectedOfferId
        ? item.matches.find((m) => m.offer.id === item.selectedOfferId)
        : undefined;
      if (locked && locked.offer.storeId !== storeId) {
        complete = false;
        break;
      }
      const pick =
        locked ??
        item.matches
          .filter((m) => m.offer.storeId === storeId)
          .sort((a, b) => a.effectivePriceUsd - b.effectivePriceUsd)[0];
      if (!pick) {
        complete = false;
        break;
      }
      lines.push(
        lineFromOffer(item.itemId, item.query, item.quantity, pick.offer, store, coupons),
      );
    }

    if (complete && lines.length === resolved.length) {
      singlePlans.push(
        planFromLines(
          `single-${storeId}`,
          `All at ${store.name}`,
          "single_store",
          lines,
          0,
        ),
      );
    }
  }

  singlePlans.sort((a, b) => a.subtotalUsd - b.subtotalUsd);
  const cheapestSingle = singlePlans[0]?.subtotalUsd ?? 0;
  for (const plan of singlePlans) {
    plan.savingsVsCheapestSingleUsd = round2(
      Math.max(0, cheapestSingle - plan.subtotalUsd),
    );
  }

  // Multi-store: pick cheapest (or local-preferred) offer per item
  const multiLines: PlanLine[] = [];
  for (const item of resolved) {
    const locked = item.selectedOfferId
      ? item.matches.find((m) => m.offer.id === item.selectedOfferId)
      : undefined;

    let pick = locked;
    if (!pick) {
      const ranked = [...item.matches].sort((a, b) => {
        if (list.preferLocal && a.offer.isLocal !== b.offer.isLocal) {
          // Prefer local only when price delta is modest (<= 15%)
          const priceDelta =
            Math.abs(a.effectivePriceUsd - b.effectivePriceUsd) /
            Math.max(a.effectivePriceUsd, b.effectivePriceUsd, 0.01);
          if (priceDelta <= 0.15) return a.offer.isLocal ? -1 : 1;
        }
        return a.effectivePriceUsd - b.effectivePriceUsd;
      });
      pick = ranked[0];
    }

    if (!pick) continue;
    const store = storeMap.get(pick.offer.storeId);
    if (!store) continue;
    multiLines.push(
      lineFromOffer(item.itemId, item.query, item.quantity, pick.offer, store, coupons),
    );
  }

  const multiPlan = planFromLines(
    "multi-best",
    "Split across stores",
    "multi_store",
    multiLines,
    cheapestSingle || multiLines.reduce((s, l) => s + l.lineTotalUsd, 0),
  );

  const plans = [...singlePlans];
  if (multiPlan.stops > 1 && multiPlan.lines.length === resolved.length) {
    plans.push(multiPlan);
  }

  plans.sort((a, b) => a.subtotalUsd - b.subtotalUsd);

  const cheapest = plans[0];
  const bestSingle = singlePlans[0];
  let recommended = bestSingle ?? cheapest;
  let explanation = "No complete cart could be built from the current matches.";

  if (bestSingle && multiPlan.stops > 1 && multiPlan.lines.length === resolved.length) {
    const savings = round2(bestSingle.subtotalUsd - multiPlan.subtotalUsd);
    if (savings >= threshold) {
      recommended = multiPlan;
      explanation = `Multi-store saves ${savings.toFixed(2)} vs the cheapest single store, which meets your $${threshold.toFixed(2)} threshold (${multiPlan.stops} stops).`;
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
  }

  if (unresolved.length) {
    explanation += ` ${unresolved.length} item(s) had no matches and were skipped.`;
  }

  return {
    matches,
    plans,
    recommendedPlanId: recommended?.id ?? "",
    explanation,
  };
}
