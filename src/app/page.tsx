"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  CartPlan,
  GroceryList,
  ItemMatchResult,
  ListItem,
  OptimizeResult,
  Store,
} from "@/lib/types";
import { formatUsd } from "@/lib/pricing";

type OptimizeResponse = OptimizeResult & {
  list: GroceryList;
  stores: Store[];
};

function newItem(query = ""): ListItem {
  return {
    id: crypto.randomUUID(),
    query,
    quantity: 1,
  };
}

export default function HomePage() {
  const [list, setList] = useState<GroceryList | null>(null);
  const [draftItems, setDraftItems] = useState<ListItem[]>([newItem()]);
  const [preferLocal, setPreferLocal] = useState(true);
  const [threshold, setThreshold] = useState(8);
  const [zip, setZip] = useState("97209");
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/lists");
      const data = await res.json();
      const groceryList = data.list as GroceryList;
      setList(groceryList);
      setDraftItems(groceryList.items.length ? groceryList.items : [newItem()]);
      setPreferLocal(groceryList.preferLocal);
      setThreshold(groceryList.savingsThresholdUsd);
      setZip(groceryList.zip);
    })();
  }, []);

  function updateItem(id: string, patch: Partial<ListItem>) {
    setDraftItems((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function removeItem(id: string) {
    setDraftItems((items) => {
      const next = items.filter((item) => item.id !== id);
      return next.length ? next : [newItem()];
    });
  }

  function optimize() {
    if (!list) return;
    setError(null);
    startTransition(async () => {
      try {
        const cleaned = draftItems
          .map((item) => ({
            ...item,
            query: item.query.trim(),
            quantity: Math.max(1, Number(item.quantity) || 1),
          }))
          .filter((item) => item.query.length > 0);

        if (!cleaned.length) {
          setError("Add at least one grocery item.");
          return;
        }

        const patchRes = await fetch(`/api/lists/${list.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cleaned,
            preferLocal,
            savingsThresholdUsd: threshold,
            zip,
          }),
        });
        if (!patchRes.ok) throw new Error("Could not save your list.");
        const patched = await patchRes.json();
        setList(patched.list);

        const optRes = await fetch(`/api/lists/${list.id}/optimize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferLocal,
            savingsThresholdUsd: threshold,
          }),
        });
        if (!optRes.ok) throw new Error("Optimization failed.");
        const data = (await optRes.json()) as OptimizeResponse;
        setResult(data);
        setSelectedPlanId(data.recommendedPlanId);
        setList(data.list);
        setDraftItems(data.list.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  async function selectMatch(itemId: string, offerId: string) {
    if (!list) return;
    const nextItems = draftItems.map((item) =>
      item.id === itemId ? { ...item, selectedOfferId: offerId } : item,
    );
    setDraftItems(nextItems);
    await fetch(`/api/lists/${list.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: nextItems }),
    });
    optimize();
  }

  const selectedPlan =
    result?.plans.find((p) => p.id === selectedPlanId) ?? result?.plans[0];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-5 py-8 md:px-8 md:py-12">
      <header className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-end">
        <div>
          <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-[var(--leaf)] uppercase">
            Cross-shop local
          </p>
          <h1
            className="max-w-xl text-5xl leading-[0.95] font-semibold tracking-tight text-[var(--ink)] md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Grocer
          </h1>
          <p className="mt-4 max-w-lg text-lg text-[var(--ink-muted)]">
            Build a list, match items across nearby stores, and split trips only when
            the savings clear your threshold — sales, coupons, and local producers
            included.
          </p>
        </div>
        <div className="border border-[var(--line)] bg-[var(--card)]/80 p-5 backdrop-blur">
          <label className="block text-sm font-medium text-[var(--ink-muted)]">
            ZIP for nearby stores
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="mt-2 w-full border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--leaf)]"
            />
          </label>
          <p className="mt-3 text-sm text-[var(--ink-muted)]">
            Demo catalog ships with Green Valley, Harbor Fresh, and a Kroger mirror.
            Add Kroger API keys in <code className="text-[var(--ink)]">.env.local</code> for
            live prices.
          </p>
        </div>
      </header>

      <section className="grid gap-8 lg:grid-cols-[1fr_1.05fr]">
        <div className="border border-[var(--line)] bg-[var(--card)] p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2
              className="text-2xl font-semibold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Your list
            </h2>
            <button
              type="button"
              onClick={() => setDraftItems((items) => [...items, newItem()])}
              className="border border-[var(--leaf)] px-3 py-1.5 text-sm font-semibold text-[var(--leaf-deep)] transition hover:bg-[var(--leaf)] hover:text-white"
            >
              Add item
            </button>
          </div>

          <ul className="space-y-3">
            {draftItems.map((item) => (
              <li
                key={item.id}
                className="grid grid-cols-[1fr_72px_auto] items-center gap-2 border-b border-[var(--line)] pb-3"
              >
                <input
                  value={item.query}
                  onChange={(e) => updateItem(item.id, { query: e.target.value })}
                  placeholder="e.g. whole milk, eggs, local coffee"
                  className="w-full border border-transparent bg-transparent px-1 py-2 outline-none focus:border-[var(--line)]"
                />
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(item.id, { quantity: Number(e.target.value) })
                  }
                  className="w-full border border-[var(--line)] px-2 py-2 text-center"
                  aria-label="Quantity"
                />
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="px-2 text-sm text-[var(--ink-muted)] hover:text-[var(--warn)]"
                  aria-label="Remove item"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={preferLocal}
                onChange={(e) => setPreferLocal(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-semibold text-[var(--ink)]">Prefer locally sourced</span>
                <span className="mt-1 block text-[var(--ink-muted)]">
                  Boosts local producers when the price delta stays modest.
                </span>
              </span>
            </label>
            <label className="block text-sm">
              <span className="font-semibold text-[var(--ink)]">
                Multi-store savings threshold
              </span>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[var(--ink-muted)]">$</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full border border-[var(--line)] px-3 py-2"
                />
              </div>
            </label>
          </div>

          <button
            type="button"
            onClick={optimize}
            disabled={pending || !list}
            className="mt-6 w-full bg-[var(--leaf)] px-4 py-3 text-base font-semibold text-white transition hover:bg-[var(--leaf-deep)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Optimizing…" : "Optimize cart"}
          </button>
          {error ? <p className="mt-3 text-sm text-[var(--warn)]">{error}</p> : null}
        </div>

        <div className="space-y-6">
          {result ? (
            <>
              <div className="border border-[var(--line)] bg-[var(--card)] p-5 md:p-6">
                <h2
                  className="text-2xl font-semibold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Recommended plan
                </h2>
                <p className="mt-2 text-[var(--ink-muted)]">{result.explanation}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {result.plans.map((plan) => (
                    <PlanChip
                      key={plan.id}
                      plan={plan}
                      active={plan.id === selectedPlan?.id}
                      recommended={plan.id === result.recommendedPlanId}
                      onClick={() => setSelectedPlanId(plan.id)}
                    />
                  ))}
                </div>

                {selectedPlan ? <PlanDetail plan={selectedPlan} /> : null}
              </div>

              <MatchesPanel
                matches={result.matches}
                onSelect={selectMatch}
                preferLocal={preferLocal}
              />
            </>
          ) : (
            <div className="border border-dashed border-[var(--line)] bg-[var(--card)]/50 p-8 text-[var(--ink-muted)]">
              <h2
                className="text-2xl font-semibold text-[var(--ink)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Plans appear here
              </h2>
              <p className="mt-3 max-w-md">
                Hit optimize to compare a single-store cart against a multi-stop split.
                We’ll only recommend extra stops when savings beat your threshold.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function PlanChip({
  plan,
  active,
  recommended,
  onClick,
}: {
  plan: CartPlan;
  active: boolean;
  recommended: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-3 py-2 text-left text-sm transition ${
        active
          ? "border-[var(--leaf)] bg-[var(--leaf)] text-white"
          : "border-[var(--line)] bg-white hover:border-[var(--leaf)]"
      }`}
    >
      <span className="block font-semibold">{plan.label}</span>
      <span className={active ? "text-white/85" : "text-[var(--ink-muted)]"}>
        {formatUsd(plan.subtotalUsd)} · {plan.stops} stop{plan.stops === 1 ? "" : "s"}
        {recommended ? " · recommended" : ""}
      </span>
    </button>
  );
}

function PlanDetail({ plan }: { plan: CartPlan }) {
  const byStore = plan.storeIds.map((storeId) => ({
    storeId,
    storeName: plan.lines.find((l) => l.storeId === storeId)?.storeName ?? storeId,
    lines: plan.lines.filter((l) => l.storeId === storeId),
  }));

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Total" value={formatUsd(plan.subtotalUsd)} />
        <Stat label="Stops" value={String(plan.stops)} />
        <Stat label="Local items" value={String(plan.localItemCount)} />
      </div>
      {byStore.map((group) => (
        <div key={group.storeId}>
          <h3 className="mb-2 font-semibold text-[var(--leaf-deep)]">{group.storeName}</h3>
          <ul className="space-y-2">
            {group.lines.map((line) => (
              <li
                key={`${line.itemId}-${line.offer.id}`}
                className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {line.quantity}× {line.offer.name}
                  </p>
                  <p className="text-[var(--ink-muted)]">
                    for “{line.query}”
                    {line.offer.onSale ? " · sale" : ""}
                    {line.appliedCouponIds.length ? " · coupon applied" : ""}
                    {line.isLocal ? " · local" : ""}
                  </p>
                </div>
                <p className="font-semibold whitespace-nowrap">
                  {formatUsd(line.lineTotalUsd)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--line)] bg-[#f7faf6] px-3 py-3">
      <p className="text-[var(--ink-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
        {value}
      </p>
    </div>
  );
}

function MatchesPanel({
  matches,
  onSelect,
  preferLocal,
}: {
  matches: ItemMatchResult[];
  onSelect: (itemId: string, offerId: string) => void;
  preferLocal: boolean;
}) {
  return (
    <div className="border border-[var(--line)] bg-[var(--card)] p-5 md:p-6">
      <h2
        className="text-2xl font-semibold"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Item matches
      </h2>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">
        Pick a specific offer to lock it into the next optimization pass.
        {preferLocal ? " Local options are ranked higher when close in price." : ""}
      </p>
      <div className="mt-5 space-y-5">
        {matches.map((match) => (
          <div key={match.itemId} className="border-t border-[var(--line)] pt-4">
            <h3 className="font-semibold">
              {match.query}{" "}
              <span className="font-normal text-[var(--ink-muted)]">×{match.quantity}</span>
            </h3>
            {!match.matches.length ? (
              <p className="mt-2 text-sm text-[var(--warn)]">No matches found.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {match.matches.slice(0, 4).map((m) => {
                  const selected = match.selectedOfferId === m.offer.id;
                  return (
                    <li key={m.offer.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(match.itemId, m.offer.id)}
                        className={`flex w-full items-start justify-between gap-3 border px-3 py-2 text-left text-sm transition ${
                          selected
                            ? "border-[var(--leaf)] bg-[#eef6f0]"
                            : "border-[var(--line)] hover:border-[var(--leaf)]"
                        }`}
                      >
                        <span>
                          <span className="font-medium">{m.offer.name}</span>
                          <span className="mt-1 block text-[var(--ink-muted)]">
                            {m.store.name}
                            {m.offer.isLocal
                              ? ` · local${m.offer.localOrigin ? ` (${m.offer.localOrigin})` : ""}`
                              : ""}
                            {m.offer.onSale ? " · sale" : ""}
                            {m.appliedCouponIds.length ? " · coupon" : ""}
                          </span>
                        </span>
                        <span className="font-semibold whitespace-nowrap">
                          {formatUsd(m.effectivePriceUsd)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
