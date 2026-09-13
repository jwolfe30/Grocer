"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ItemSuggestInput } from "@/components/ItemSuggestInput";
import { AccountMenu, getStoredToken } from "@/components/AccountPanel";
import { DealBadge } from "@/components/DealBadge";
import {
  StorePicker,
  modesToFilters,
  type StoreMode,
} from "@/components/StorePicker";
import type { FrequentItem, PublicUser } from "@/lib/account-types";
import { AREA_STORES } from "@/lib/area-stores";
import { resolveActiveStoreIds } from "@/lib/suggest";
import type {
  CartPlan,
  Coupon,
  GroceryList,
  ItemMatchResult,
  ListItem,
  OptimizeResult,
  Store,
  Suggestion,
} from "@/lib/types";
import {
  applyCouponChoicesToPlan,
  couponSavingsUsd,
  formatUsd,
  formatUsdWithSource,
  optimizeLiveCompletion,
  priceHonestyIsAuthoritative,
  priceHonestyShortTag,
  selectableCouponsForOffer,
  summarizeLinePriceHonesty,
  type CouponChoice,
} from "@/lib/pricing";
import { buildPlansFromMatches } from "@/lib/optimize";
import { newId } from "@/lib/id";

const DEVICE_LIST_KEY = "grocer_device_list_id";

const DEV_FILL_QUERIES = [
  "whole milk",
  "eggs",
  "wheat bread",
  "bananas",
  "chicken breast",
  "ground coffee",
  "olive oil",
  "white rice",
  "butter",
  "cheddar cheese",
  "yogurt",
  "apples",
  "spinach",
  "tomatoes",
  "pasta",
  "peanut butter",
  "oatmeal",
  "tortillas",
  "ground beef",
  "salmon",
  "orange juice",
  "potatoes",
  "onions",
  "garlic",
  "black beans",
  "salsa",
  "honey",
  "flour",
  "sugar",
  "paper towels",
];

type OptimizeResponse = OptimizeResult & {
  list: GroceryList;
  stores: Store[];
  coupons?: Coupon[];
  progress?: { liveOfferCount: number; liveStoreCount: number };
};

type ListSync = "cloud" | "device";

function newItem(query = ""): ListItem {
  return {
    id: newId(),
    query,
    quantity: 1,
    checked: false,
  };
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function HomePage() {
  const [list, setList] = useState<GroceryList | null>(null);
  const [listSync, setListSync] = useState<ListSync>("device");
  const [draftItems, setDraftItems] = useState<ListItem[]>([newItem()]);
  const [preferLocal, setPreferLocal] = useState(true);
  const [preferOrganic, setPreferOrganic] = useState(false);
  const [preferKosher, setPreferKosher] = useState(false);
  const [threshold, setThreshold] = useState(8);
  const [preferFewerStops, setPreferFewerStops] = useState(true);
  const [maxStops, setMaxStops] = useState<number | "">("");
  const [zip, setZip] = useState("98042");
  const [stores, setStores] = useState<Store[]>([]);
  const [krogerStatus, setKrogerStatus] = useState<{
    configured: boolean;
    circuitOpen: boolean;
    lastLiveAt: number | null;
    message: string;
  } | null>(null);
  const [storeModes, setStoreModes] = useState<Record<string, StoreMode>>({});
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimizeStatus, setOptimizeStatus] = useState<{
    phase: string;
    pct: number;
    tone?: "ok" | "warn";
  } | null>(null);
  const [shoppingMode, setShoppingMode] = useState(false);
  /** Per list-item coupon pick for the current plan (local; no re-optimize). */
  const [couponChoices, setCouponChoices] = useState<Record<string, CouponChoice>>(
    {},
  );
  const [accountUser, setAccountUser] = useState<PublicUser | null>(null);
  const [cloudSaveState, setCloudSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearedSnapshot, setClearedSnapshot] = useState<ListItem[] | null>(null);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<Record<string, true>>({});
  const [pendingDeletes, setPendingDeletes] = useState<
    Record<string, "grace" | "swipe" | "shrink">
  >({});
  const [freshItemIds, setFreshItemIds] = useState<string[]>([]);
  const deleteTimers = useRef<
    Record<
      string,
      {
        confirm?: number;
        grace?: number;
        swipe?: number;
        shrink?: number;
      }
    >
  >({});

  const { preferredStoreIds, excludedStoreIds } = useMemo(
    () => modesToFilters(storeModes),
    [storeModes],
  );

  const activeStoreIds = useMemo(
    () => resolveActiveStoreIds(stores, preferredStoreIds, excludedStoreIds),
    [stores, preferredStoreIds, excludedStoreIds],
  );

  function markFreshItem(id: string) {
    setFreshItemIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }

  function withTrailingEmptyRow(
    items: ListItem[],
    options?: { animate?: boolean },
  ): ListItem[] {
    const base = items.length ? items : [newItem()];
    const last = base[base.length - 1];
    if (!last.query.trim()) return base;
    const spawned = newItem();
    if (options?.animate) {
      queueMicrotask(() => markFreshItem(spawned.id));
    }
    return [...base, spawned];
  }

  function applyListPayload(groceryList: GroceryList, sync: ListSync) {
    setList(groceryList);
    setListSync(sync);
    setDraftItems(
      withTrailingEmptyRow(
        groceryList.items.length ? groceryList.items : [newItem()],
        { animate: false },
      ),
    );
    setPreferLocal(groceryList.preferLocal);
    setPreferOrganic(Boolean(groceryList.preferOrganic));
    setPreferKosher(Boolean(groceryList.preferKosher));
    setThreshold(groceryList.savingsThresholdUsd);
    setZip(groceryList.zip);
    if (groceryList.shareId && typeof window !== "undefined") {
      setShareUrl(`${window.location.origin}/l/${groceryList.shareId}`);
    } else {
      setShareUrl(null);
    }
    if (sync === "device") {
      localStorage.setItem(DEVICE_LIST_KEY, groceryList.id);
    } else {
      localStorage.removeItem(DEVICE_LIST_KEY);
    }
  }

  async function loadList() {
    const deviceId = localStorage.getItem(DEVICE_LIST_KEY);
    const params = new URLSearchParams({ zip });
    if (deviceId) params.set("id", deviceId);
    const res = await fetch(`/api/lists?${params}`, { headers: authHeaders() });
    const data = await res.json();
    applyListPayload(data.list as GroceryList, data.sync === "cloud" ? "cloud" : "device");
  }

  function applyStores(nextStores: Store[]) {
    const list = nextStores.length ? nextStores : AREA_STORES;
    setStores(list);
    setStoreModes((prev) => {
      const next = { ...prev };
      for (const store of list) {
        // Live-first cold start: Kroger FM/QFC stay included; demo-only banners default exclude
        if (!next[store.id]) {
          next[store.id] = store.krogerLocationId ? "include" : "exclude";
        }
      }
      return next;
    });
  }

  useEffect(() => {
    void (async () => {
      const [storesRes, krogerRes] = await Promise.all([
        fetch(`/api/stores?zip=${encodeURIComponent(zip)}`),
        fetch("/api/kroger/status"),
      ]);
      const storesData = storesRes.ok ? await storesRes.json() : { stores: [] };
      applyStores((storesData.stores as Store[]) ?? []);
      if (krogerRes.ok) {
        const k = await krogerRes.json();
        setKrogerStatus({
          configured: Boolean(k.configured),
          circuitOpen: Boolean(k.circuitOpen),
          lastLiveAt: k.lastLiveAt ?? null,
          message: String(k.message ?? ""),
        });
      }
      await loadList();
    })();
    // intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetch(`/api/stores?zip=${encodeURIComponent(zip)}`)
        .then((res) => (res.ok ? res.json() : Promise.resolve({ stores: [] })))
        .then((data: { stores: Store[] }) => {
          applyStores(data.stores ?? []);
        })
        .catch(() => applyStores([]));
    }, 400);
    return () => window.clearTimeout(handle);
  }, [zip]);

  // Debounced cloud/device persistence while editing
  useEffect(() => {
    if (!list) return;
    const handle = window.setTimeout(() => {
      const cleaned = draftItems
        .map((item) => ({
          ...item,
          query: item.query.trim(),
          quantity: Math.max(1, Number(item.quantity) || 1),
          checked: Boolean(item.checked),
        }))
        .filter((item) => item.query.length > 0);
      setCloudSaveState("saving");
      void fetch(`/api/lists/${list.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          items: cleaned,
          preferLocal,
          preferOrganic,
          preferKosher,
          savingsThresholdUsd: threshold,
          zip,
        }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json();
          setList(data.list);
          setListSync(data.sync === "cloud" ? "cloud" : "device");
          setCloudSaveState("saved");
        })
        .catch(() => setCloudSaveState("idle"));
    }, 700);
    return () => window.clearTimeout(handle);
  }, [
    list?.id,
    draftItems,
    preferLocal,
    preferOrganic,
    preferKosher,
    threshold,
    zip,
    accountUser?.id,
  ]);

  function updateItem(id: string, patch: Partial<ListItem>) {
    setDraftItems((items) => {
      const next = items.map((item) => (item.id === id ? { ...item, ...patch } : item));
      return withTrailingEmptyRow(next, { animate: true });
    });
  }

  function addItem() {
    setDraftItems((items) => {
      const last = items[items.length - 1];
      if (last && !last.query.trim()) return items;
      const spawned = newItem();
      queueMicrotask(() => markFreshItem(spawned.id));
      return [...items, spawned];
    });
  }

  function addRandomDevItems() {
    const pool = [...DEV_FILL_QUERIES];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picks = pool.slice(0, 15);
    setDraftItems((items) => {
      const kept = items.filter((item) => item.query.trim().length > 0);
      const existing = new Set(kept.map((item) => item.query.trim().toLowerCase()));
      const additions = picks
        .filter((query) => !existing.has(query.toLowerCase()))
        .map((query) => newItem(query));
      for (const item of additions) {
        queueMicrotask(() => markFreshItem(item.id));
      }
      return withTrailingEmptyRow([...kept, ...additions], { animate: true });
    });
  }

  function removeItem(id: string) {
    finishRemovingItem(id);
  }

  function clearItemDeleteTimers(id: string) {
    const timers = deleteTimers.current[id];
    if (!timers) return;
    if (timers.confirm) window.clearTimeout(timers.confirm);
    if (timers.grace) window.clearTimeout(timers.grace);
    if (timers.swipe) window.clearTimeout(timers.swipe);
    if (timers.shrink) window.clearTimeout(timers.shrink);
    delete deleteTimers.current[id];
  }

  function finishRemovingItem(id: string) {
    clearItemDeleteTimers(id);
    setDraftItems((items) => {
      const next = items.filter((item) => item.id !== id);
      return next.length ? next : [newItem()];
    });
    setConfirmDeleteIds((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setPendingDeletes((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function requestDeleteItem(id: string) {
    if (pendingDeletes[id]) return;

    if (!confirmDeleteIds[id]) {
      setConfirmDeleteIds((current) => ({ ...current, [id]: true }));
      clearItemDeleteTimers(id);
      deleteTimers.current[id] = {
        confirm: window.setTimeout(() => {
          setConfirmDeleteIds((current) => {
            if (!current[id]) return current;
            const next = { ...current };
            delete next[id];
            return next;
          });
          delete deleteTimers.current[id];
        }, 4000),
      };
      return;
    }

    clearItemDeleteTimers(id);
    setConfirmDeleteIds((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setPendingDeletes((current) => ({ ...current, [id]: "grace" }));
    deleteTimers.current[id] = {
      grace: window.setTimeout(() => {
        setPendingDeletes((current) =>
          current[id] === "grace" ? { ...current, [id]: "swipe" } : current,
        );
        const existing = deleteTimers.current[id] ?? {};
        existing.swipe = window.setTimeout(() => {
          setPendingDeletes((current) =>
            current[id] === "swipe" ? { ...current, [id]: "shrink" } : current,
          );
          const nested = deleteTimers.current[id] ?? {};
          nested.shrink = window.setTimeout(() => {
            finishRemovingItem(id);
          }, 200);
          deleteTimers.current[id] = nested;
        }, 320);
        deleteTimers.current[id] = existing;
      }, 2500),
    };
  }

  function revertPendingDelete(id: string) {
    clearItemDeleteTimers(id);
    setPendingDeletes((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setConfirmDeleteIds((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function onDeleteAnimationEnd(
    id: string,
    event: React.AnimationEvent<HTMLLIElement>,
  ) {
    if (event.target !== event.currentTarget) return;
    const name = event.animationName;
    if (name === "grocer-item-swipe") {
      const timers = deleteTimers.current[id];
      if (timers?.swipe) window.clearTimeout(timers.swipe);
      setPendingDeletes((current) =>
        current[id] === "swipe" ? { ...current, [id]: "shrink" } : current,
      );
      const nextTimers = deleteTimers.current[id] ?? {};
      nextTimers.shrink = window.setTimeout(() => {
        finishRemovingItem(id);
      }, 200);
      deleteTimers.current[id] = nextTimers;
      return;
    }
    if (name === "grocer-item-shrink") {
      finishRemovingItem(id);
    }
  }

  function clearList() {
    const snapshot = draftItems
      .map((item) => ({ ...item }))
      .filter((item) => item.query.trim().length > 0);
    setClearedSnapshot(snapshot.length ? snapshot : null);
    const spawned = newItem();
    queueMicrotask(() => markFreshItem(spawned.id));
    setDraftItems([spawned]);
    setResult(null);
    setCouponChoices({});
    setConfirmClear(false);
  }

  function requestClearList() {
    if (!confirmClear) {
      setConfirmClear(true);
      window.setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    clearList();
  }

  function revertClearedList() {
    if (!clearedSnapshot?.length) return;
    setDraftItems(
      withTrailingEmptyRow(
        clearedSnapshot.map((item) => ({ ...item })),
        { animate: true },
      ),
    );
    setClearedSnapshot(null);
    setConfirmClear(false);
  }

  function toggleChecked(id: string) {
    setDraftItems((items) =>
      items.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item,
      ),
    );
  }

  async function shareList() {
    if (!list) return;
    if (!accountUser) {
      setShareMessage("Login to share");
      return;
    }
    const token = getStoredToken();
    if (!token || listSync !== "cloud") {
      setShareMessage("Sign in so this becomes a cloud list, then you can share it.");
      return;
    }
    setShareMessage(null);
    const res = await fetch(`/api/lists/${list.id}/share`, {
      method: "POST",
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      setShareMessage(typeof data.error === "string" ? data.error : "Could not share list.");
      return;
    }
    setList(data.list);
    setShareUrl(data.shareUrl);
    setShareMessage("Share link ready — anyone can open it and cross out items (no account).");
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      setShareMessage("Share link copied. Anyone can open it and cross out items (no account).");
    } catch {
      // clipboard may be blocked; URL still shown
    }
  }

  function selectSuggestion(itemId: string, suggestion: Suggestion) {
    if (suggestion.kind === "generic") {
      updateItem(itemId, {
        query: suggestion.name,
        selectedOfferId: undefined,
        preferredProductId: suggestion.productId,
        preferredBrand: undefined,
      });
      return;
    }
    updateItem(itemId, {
      query: suggestion.name,
      selectedOfferId: undefined,
      preferredProductId: suggestion.productId,
      preferredBrand: suggestion.brand || suggestion.name,
    });
  }

  function cleanedDraftItems() {
    return draftItems
      .map((item) => ({
        ...item,
        query: item.query.trim(),
        quantity: Math.max(1, Number(item.quantity) || 1),
        checked: Boolean(item.checked),
      }))
      .filter((item) => item.query.length > 0);
  }

  async function flushCurrentList() {
    if (!list) return;
    const cleaned = cleanedDraftItems();
    await fetch(`/api/lists/${list.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        items: cleaned,
        preferLocal,
        preferOrganic,
        preferKosher,
        savingsThresholdUsd: threshold,
        zip,
      }),
    }).catch(() => undefined);
  }

  function applyFrequentItems(items: FrequentItem[]) {
    if (!items.length) return;
    setDraftItems((current) => {
      const existing = new Set(
        current.map((item) => item.query.trim().toLowerCase()).filter(Boolean),
      );
      const additions = items
        .filter((item) => !existing.has(item.query.trim().toLowerCase()))
        .map((item) => ({
          id: newId(),
          query: item.query,
          quantity: item.quantity || 1,
          notes: item.notes,
          checked: false,
        }));
      const base = current.some((item) => item.query.trim())
        ? current.filter((item) => item.query.trim())
        : [];
      return withTrailingEmptyRow([...base, ...additions], { animate: true });
    });
  }

  async function handleAuthChange(user: PublicUser | null) {
    setAccountUser(user);
    setShareMessage(null);

    if (user) {
      // Persist guest edits, then merge into the account cloud list.
      if (list && listSync === "device") {
        localStorage.setItem(DEVICE_LIST_KEY, list.id);
        await flushCurrentList();
      } else if (list) {
        await flushCurrentList();
      }
      await loadList();
      return;
    }

    // Sign-out: keep the visible list as a new device-only copy.
    const cleaned = cleanedDraftItems();
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: list?.name ?? "My grocery list",
        zip,
        preferLocal,
        preferOrganic,
        preferKosher,
        savingsThresholdUsd: threshold,
        items: cleaned,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      applyListPayload(data.list as GroceryList, "device");
    } else {
      localStorage.removeItem(DEVICE_LIST_KEY);
      await loadList();
    }
  }

  function optimize() {
    if (!list) return;
    setError(null);

    if (!activeStoreIds.length) {
      setError("Include or prefer at least one store.");
      return;
    }

    startTransition(async () => {
      let tick: number | undefined;
      try {
        setOptimizeStatus({ phase: "Saving your list…", pct: 8 });

        const cleaned = draftItems
          .map((item) => ({
            ...item,
            query: item.query.trim(),
            quantity: Math.max(1, Number(item.quantity) || 1),
          }))
          .filter((item) => item.query.length > 0);

        if (!cleaned.length) {
          setError("Add at least one grocery item.");
          setOptimizeStatus(null);
          return;
        }

        const patchRes = await fetch(`/api/lists/${list.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            items: cleaned,
            preferLocal,
            preferOrganic,
            preferKosher,
            savingsThresholdUsd: threshold,
            zip,
          }),
        });
        if (!patchRes.ok) throw new Error("Could not save your list.");
        const patched = await patchRes.json();
        setList(patched.list);
        setListSync(patched.sync === "cloud" ? "cloud" : "device");

        setOptimizeStatus({
          phase: "Checking live Kroger prices across selected stores…",
          pct: 28,
        });
        tick = window.setInterval(() => {
          setOptimizeStatus((prev) => {
            if (!prev || prev.pct >= 82) return prev;
            const next = Math.min(82, prev.pct + 3);
            const phase =
              next < 50
                ? "Checking live Kroger prices across selected stores…"
                : next < 70
                  ? "Comparing shelves and sales…"
                  : "Almost there — building stop plans…";
            return { phase, pct: next };
          });
        }, 700);

        const optRes = await fetch(`/api/lists/${list.id}/optimize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferLocal,
            preferOrganic,
            preferKosher,
            savingsThresholdUsd: threshold,
            storeIds: activeStoreIds,
            preferFewerStops,
            maxStops: maxStops === "" ? undefined : maxStops,
          }),
        });
        if (tick) window.clearInterval(tick);
        tick = undefined;

        if (!optRes.ok) {
          const body = (await optRes.json().catch(() => null)) as {
            error?: string | { formErrors?: string[] };
          } | null;
          const msg =
            typeof body?.error === "string"
              ? body.error
              : "Optimization failed. Try again in a moment.";
          throw new Error(msg);
        }

        setOptimizeStatus({ phase: "Finishing plan…", pct: 92 });
        const data = (await optRes.json()) as OptimizeResponse;
        setResult(data);
        setSelectedPlanId(data.recommendedPlanId);
        setCouponChoices({});
        setList(data.list);
        setDraftItems(data.list.items);
        if (data.stores?.length) applyStores(data.stores);

        const liveStores = data.progress?.liveStoreCount ?? 0;
        const liveOffers = data.progress?.liveOfferCount ?? 0;
        const completion = optimizeLiveCompletion(
          liveOffers,
          liveStores,
          cleaned.length,
        );
        setOptimizeStatus({
          phase: completion.phase,
          pct: 100,
          tone: completion.tone,
        });

        void fetch("/api/kroger/status")
          .then((res) => (res.ok ? res.json() : null))
          .then((k) => {
            if (!k) return;
            setKrogerStatus({
              configured: Boolean(k.configured),
              circuitOpen: Boolean(k.circuitOpen),
              lastLiveAt: k.lastLiveAt ?? null,
              message: String(k.message ?? ""),
            });
          })
          .catch(() => undefined);

        window.setTimeout(
          () => setOptimizeStatus(null),
          completion.tone === "warn" ? 5200 : 1800,
        );
      } catch (err) {
        if (tick) window.clearInterval(tick);
        setOptimizeStatus(null);
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function selectMatch(itemId: string, offerId: string) {
    if (!list || !result) return;

    const current = result.matches.find((m) => m.itemId === itemId);
    // Same lock already applied — skip rebuild to avoid remount churn.
    if (current?.selectedOfferId === offerId) return;

    const matched = current?.matches.find((m) => m.offer.id === offerId);
    // Brand only (never full product name): names blow past schema max(80) and
    // make brandsMatch(includes) treat unrelated SKUs as the same brand.
    const brand = matched?.offer.brand?.trim().slice(0, 80) || undefined;

    const nextItems = draftItems.map((item) =>
      item.id === itemId
        ? {
            ...item,
            selectedOfferId: offerId,
            preferredProductId: matched?.offer.productId ?? item.preferredProductId,
            preferredBrand: brand ?? item.preferredBrand,
          }
        : item,
    );
    const nextList: GroceryList = { ...list, items: nextItems };

    const nextMatches = result.matches.map((m) =>
      m.itemId === itemId
        ? {
            ...m,
            selectedOfferId: offerId,
            preferredProductId: matched?.offer.productId ?? m.preferredProductId,
            preferredBrand: brand ?? m.preferredBrand,
          }
        : m,
    );

    let rebuilt: OptimizeResult;
    try {
      rebuilt = buildPlansFromMatches(
        nextList,
        nextMatches,
        result.stores ?? [],
        result.coupons ?? [],
        {
          storeIds: activeStoreIds,
          savingsThresholdUsd: threshold,
          preferFewerStops,
          maxStops: maxStops === "" ? undefined : maxStops,
        },
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update plan from that pick.",
      );
      return;
    }

    const nextResult: OptimizeResponse = {
      ...rebuilt,
      list: nextList,
      stores: result.stores,
      coupons: result.coupons,
      progress: result.progress,
    };

    setDraftItems(nextItems);
    setList(nextList);
    setResult(nextResult);
    setSelectedPlanId(
      rebuilt.plans.some((p) => p.id === selectedPlanId)
        ? selectedPlanId
        : rebuilt.recommendedPlanId,
    );
    // New offer → reset that line to Auto coupon until the shopper picks again.
    setCouponChoices((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });

    // Persist lock only — do not re-hit optimize / Kroger.
    const cleaned = nextItems
      .map((item) => ({
        ...item,
        query: item.query.trim(),
        quantity: Math.max(1, Number(item.quantity) || 1),
        preferredBrand: item.preferredBrand?.slice(0, 80),
      }))
      .filter((item) => item.query.length > 0);
    void fetch(`/api/lists/${list.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ items: cleaned }),
    });
  }

  const selectedPlanRaw =
    result?.plans.find((p) => p.id === selectedPlanId) ?? result?.plans[0];

  const selectedPlan = useMemo(() => {
    if (!selectedPlanRaw || !result) return selectedPlanRaw;
    return applyCouponChoicesToPlan(
      selectedPlanRaw,
      couponChoices,
      result.coupons ?? [],
    );
  }, [selectedPlanRaw, couponChoices, result]);

  const baselineSingleRaw = useMemo(
    () => (result ? bestSingleStopPlan(result.plans) : undefined),
    [result],
  );

  const baselineSingle = useMemo(() => {
    if (!baselineSingleRaw || !result) return baselineSingleRaw;
    return applyCouponChoicesToPlan(
      baselineSingleRaw,
      couponChoices,
      result.coupons ?? [],
    );
  }, [baselineSingleRaw, couponChoices, result]);

  function selectCoupon(itemId: string, choice: CouponChoice) {
    setCouponChoices((prev) => {
      if (choice === "auto") {
        if (!(itemId in prev)) return prev;
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: choice };
    });
  }

  const checkedById = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const item of draftItems) map[item.id] = Boolean(item.checked);
    return map;
  }, [draftItems]);

  useEffect(() => {
    if (!result) setShoppingMode(false);
  }, [result]);

  const shopProgress = useMemo(() => {
    if (!selectedPlan) return null;
    const total = selectedPlan.lines.length;
    const done = selectedPlan.lines.filter((l) => checkedById[l.itemId]).length;
    return { done, total };
  }, [selectedPlan, checkedById]);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-5 py-8 md:px-8 md:py-12">
      <AccountMenu
        zip={zip}
        onApplyFrequentItems={applyFrequentItems}
        onAuthChange={(user) => void handleAuthChange(user)}
      />
      <header className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-end">
        <div>
          <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-[var(--leaf)] uppercase">
            Free forever · savings first
          </p>
          <h1
            className="max-w-xl text-5xl leading-[0.95] font-semibold tracking-tight text-[var(--ink)] md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Grocer
          </h1>
          <p className="mt-4 max-w-lg text-lg text-[var(--ink-muted)]">
            Quality groceries at fair prices — cross-shop local stores, stack sales and
            coupons, and only make another stop when the savings are worth it. No
            paywall, no premium tier: built to cut your bill in an expensive world.
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
            Test bed ZIP <strong className="font-semibold text-[var(--ink)]">98042</strong>{" "}
            (Covington / Kent area). Demo stores ship with the app; add Kroger API keys in{" "}
            <code className="text-[var(--ink)]">.env.local</code> for live Fred Meyer / QFC
            prices. Optional later: sponsored placements — never locked features.
          </p>
        </div>
      </header>

      {krogerStatus && (
        <p
          className={`border px-4 py-3 text-sm ${
            krogerStatus.configured && !krogerStatus.circuitOpen
              ? "border-[var(--leaf)]/40 bg-[var(--leaf)]/10 text-[var(--ink)]"
              : "border-[var(--line)] bg-[var(--card)] text-[var(--ink-muted)]"
          }`}
          role="status"
        >
          {krogerStatus.configured && !krogerStatus.circuitOpen
            ? krogerStatus.lastLiveAt
              ? "Kroger live pricing is available for Fred Meyer / QFC searches."
              : "Kroger credentials loaded — live prices appear on suggest and optimize when the API responds."
            : "Live Kroger unavailable; using modeled prices for Fred Meyer / QFC. Receipt uploads still preferred when present."}
        </p>
      )}

      {shoppingMode && selectedPlan && result ? (
        <section className="mx-auto w-full max-w-3xl pb-8">
          <div className="grocer-safe-sticky sticky top-0 z-30 -mx-5 border-b border-[var(--line)] bg-[var(--bg)]/95 px-5 py-3 backdrop-blur-md md:-mx-8 md:px-8">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <button
                type="button"
                onClick={() => setShoppingMode(false)}
                className="min-h-11 shrink-0 border border-[var(--line)] bg-[var(--card)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--leaf)]"
              >
                Back to plan
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-[0.14em] text-[var(--leaf)] uppercase">
                  Shopping
                </p>
                <p
                  className="truncate text-lg font-semibold leading-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {selectedPlan.label}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-semibold tabular-nums">
                  {formatUsd(selectedPlan.subtotalUsd)}
                </p>
                {shopProgress ? (
                  <p className="text-xs text-[var(--ink-muted)]">
                    {shopProgress.done}/{shopProgress.total} done
                  </p>
                ) : null}
              </div>
            </div>
            {shopProgress && shopProgress.total > 0 ? (
              <div className="mx-auto mt-3 h-2 max-w-3xl overflow-hidden border border-[var(--line)] bg-[var(--bg-deep)]">
                <div
                  className="h-full bg-[var(--leaf)] transition-[width] duration-300"
                  style={{
                    width: `${Math.round((shopProgress.done / shopProgress.total) * 100)}%`,
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-4 border border-[var(--line)] bg-[var(--card)] p-4 md:p-6">
            <p className="text-sm text-[var(--ink-muted)]">
              Tap the large checkbox to cross items off. Stops stay grouped for walking the
              store. Use <span className="font-semibold text-[var(--ink)]">Back to plan</span>{" "}
              anytime to edit the list.
            </p>
            <PlanDetail
              plan={selectedPlan}
              baselineSingle={baselineSingle}
              matches={result.matches}
              coupons={result.coupons ?? []}
              couponChoices={couponChoices}
              onCouponChange={selectCoupon}
              onSelect={selectMatch}
              shoppingMode
              checkedById={checkedById}
              onToggleChecked={toggleChecked}
            />
            {shopProgress &&
            shopProgress.total > 0 &&
            shopProgress.done === shopProgress.total ? (
              <p className="mt-5 text-center text-base font-semibold text-[var(--sale)]">
                List complete — nice run.
              </p>
            ) : null}
          </div>
        </section>
      ) : (
      <section className="grid gap-8 lg:grid-cols-[1fr_1.05fr]">
        <div className="space-y-6">
          <div className="border border-[var(--line)] bg-[var(--card)] p-5 md:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2
                  className="text-2xl font-semibold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Your list
                </h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {listSync === "cloud" ? (
                    <>
                      <span className="font-semibold text-[var(--leaf-deep)]">Cloud list</span>
                      {" · "}
                      sign in on phone or PC to use the same list
                      {cloudSaveState === "saving"
                        ? " · saving…"
                        : cloudSaveState === "saved"
                          ? " · saved"
                          : ""}
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">This device only</span>
                      {" · "}
                      create a free account to sync across devices
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addItem}
                  className="border border-[var(--leaf)] p-2 text-[var(--leaf-deep)] transition hover:bg-[var(--leaf)] hover:text-white"
                  aria-label="Add item"
                  title="Add item"
                >
                  <PlusIcon />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!accountUser) return;
                    void shareList();
                  }}
                  disabled={!accountUser}
                  className="border border-[var(--line)] p-2 text-[var(--ink)] transition hover:border-[var(--leaf)] hover:text-[var(--leaf-deep)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--ink-muted)] disabled:opacity-40 disabled:hover:border-[var(--line)] disabled:hover:text-[var(--ink-muted)]"
                  aria-label={accountUser ? "Share list" : "Login to share"}
                  title={accountUser ? "Share list" : "Login to share"}
                >
                  <ShareIcon />
                </button>
              </div>
            </div>

            <div className="mb-4">
              <button
                type="button"
                onClick={addRandomDevItems}
                className="border border-dashed border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold tracking-wide text-[var(--ink-muted)] uppercase transition hover:border-[var(--leaf)] hover:text-[var(--leaf-deep)]"
                title="Dev: add 15 random list items"
              >
                Dev +15
              </button>
            </div>

            {shareUrl ? (
              <p className="mb-4 break-all text-sm text-[var(--ink-muted)]">
                Shared link:{" "}
                <a
                  href={shareUrl}
                  className="font-semibold text-[var(--leaf-deep)] underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {shareUrl}
                </a>
              </p>
            ) : null}
            {shareMessage ? (
              <p className="mb-4 text-sm text-[var(--sale)]">{shareMessage}</p>
            ) : null}

            <ul className="space-y-3">
              {draftItems.map((item) => {
                const isConfirming = Boolean(confirmDeleteIds[item.id]);
                const deleteState = pendingDeletes[item.id] ?? null;
                const isPendingDelete = deleteState != null;
                const isGreyed = Boolean(item.checked) || isPendingDelete;
                const isFresh = freshItemIds.includes(item.id);

                return (
                  <li
                    key={item.id}
                    onAnimationEnd={(event) => {
                      if (
                        event.animationName === "grocer-item-materialize" &&
                        isFresh
                      ) {
                        setFreshItemIds((ids) => ids.filter((id) => id !== item.id));
                      }
                      if (deleteState === "swipe" || deleteState === "shrink") {
                        onDeleteAnimationEnd(item.id, event);
                      }
                    }}
                    className={`grid grid-cols-[auto_1fr_72px_auto] items-start gap-2 border-b border-[var(--line)] pb-3 ${
                      isGreyed ? "text-[var(--ink-muted)]" : ""
                    } ${isFresh ? "grocer-item-materialize" : ""} ${
                      deleteState === "swipe" ? "grocer-item-swipe overflow-hidden" : ""
                    } ${deleteState === "shrink" ? "grocer-item-shrink" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleChecked(item.id)}
                      disabled={isPendingDelete}
                      className={`mt-2 flex h-5 w-5 shrink-0 items-center justify-center border ${
                        item.checked
                          ? "border-[var(--ink-muted)] bg-[var(--ink-muted)] text-xs text-white"
                          : "border-[var(--line)]"
                      }`}
                      aria-label={item.checked ? "Unmark item" : "Cross out item"}
                      title="Cross out while shopping"
                    >
                      {item.checked ? "✓" : ""}
                    </button>
                    <div
                      className={
                        isGreyed
                          ? "text-[var(--ink-muted)] line-through decoration-[var(--ink-muted)] opacity-55"
                          : ""
                      }
                    >
                      <ItemSuggestInput
                        value={item.query}
                        zip={zip}
                        preferLocal={preferLocal}
                        preferOrganic={preferOrganic}
                        preferKosher={preferKosher}
                        preferredStoreIds={preferredStoreIds}
                        excludedStoreIds={excludedStoreIds}
                        dimmed={isGreyed}
                        placeholder="e.g. whole milk, eggs, local coffee"
                        onChange={(query) =>
                          updateItem(item.id, {
                            query,
                            selectedOfferId: undefined,
                            preferredProductId: undefined,
                            preferredBrand: undefined,
                          })
                        }
                        onSelect={(suggestion) => selectSuggestion(item.id, suggestion)}
                      />
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(item.id, { quantity: Number(e.target.value) })
                      }
                      className={`mt-1 w-full border border-[var(--line)] px-2 py-2 text-center ${
                        isGreyed
                          ? "text-[var(--ink-muted)] line-through opacity-55"
                          : ""
                      }`}
                      aria-label="Quantity"
                      disabled={isPendingDelete}
                    />
                    {deleteState === "grace" ? (
                      <button
                        type="button"
                        onClick={() => revertPendingDelete(item.id)}
                        className="mt-1.5 border border-[var(--line)] p-1.5 text-[var(--ink-muted)] transition hover:border-[var(--leaf)] hover:text-[var(--leaf-deep)]"
                        aria-label="Restore item"
                        title="Restore item"
                      >
                        <RevertIcon />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => requestDeleteItem(item.id)}
                        disabled={isPendingDelete}
                        className={`mt-1.5 p-1.5 ${
                          isConfirming
                            ? "border border-[var(--warn)] bg-[var(--warn)] text-white"
                            : "text-[var(--ink-muted)] hover:text-[var(--warn)]"
                        }`}
                        aria-label={
                          isConfirming ? "Tap again to delete item" : "Delete item"
                        }
                        title={
                          isConfirming ? "Tap again to delete" : "Delete item"
                        }
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex justify-end">
              {clearedSnapshot ? (
                <button
                  type="button"
                  onClick={revertClearedList}
                  className="border border-[var(--line)] p-2 text-[var(--ink-muted)] transition hover:border-[var(--leaf)] hover:text-[var(--leaf-deep)]"
                  aria-label="Restore previous list"
                  title="Restore previous list"
                >
                  <RevertIcon />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={requestClearList}
                  className={`border px-3 py-1.5 text-sm transition ${
                    confirmClear
                      ? "border-[var(--warn)] bg-[var(--warn)] font-semibold text-white"
                      : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--warn)] hover:text-[var(--warn)]"
                  }`}
                >
                  {confirmClear ? "Tap again to clear" : "Clear list"}
                </button>
              )}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={preferLocal}
                  onChange={(e) => setPreferLocal(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold text-[var(--ink)]">
                    Prefer locally sourced
                  </span>
                  <span className="mt-1 block text-[var(--ink-muted)]">
                    Boosts local producers when the price delta stays modest.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={preferOrganic}
                  onChange={(e) => setPreferOrganic(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold text-[var(--ink)]">
                    Prefer organic / non-GMO
                  </span>
                  <span className="mt-1 block text-[var(--ink-muted)]">
                    Ranks organic and non-GMO labeled items higher.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={preferKosher}
                  onChange={(e) => setPreferKosher(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold text-[var(--ink)]">Prefer kosher</span>
                  <span className="mt-1 block text-[var(--ink-muted)]">
                    Favors kosher-certified options when close in price.
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
                <span className="mt-1 block text-[var(--ink-muted)]">
                  Only recommend extra stores when total savings clear this bar.
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={preferFewerStops}
                  onChange={(e) => setPreferFewerStops(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold text-[var(--ink)]">
                    Prefer fewer stops
                  </span>
                  <span className="mt-1 block text-[var(--ink-muted)]">
                    Drop weak detours — a one-item stop only stays if that item is
                    pricey and on a strong sale (or saves a lot).
                  </span>
                </span>
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-[var(--ink)]">Max stops</span>
                <select
                  value={maxStops === "" ? "" : String(maxStops)}
                  onChange={(e) =>
                    setMaxStops(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="mt-2 w-full border border-[var(--line)] bg-white px-3 py-2"
                >
                  <option value="">No hard cap</option>
                  <option value="1">1 — single store only</option>
                  <option value="2">2 stops max</option>
                  <option value="3">3 stops max</option>
                </select>
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
            {optimizeStatus ? (
              <div className="mt-4 space-y-2" role="status" aria-live="polite">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span
                    className={
                      optimizeStatus.tone === "warn"
                        ? "font-medium text-[var(--warn)]"
                        : "text-[var(--ink-muted)]"
                    }
                  >
                    {optimizeStatus.phase}
                  </span>
                  <span className="tabular-nums text-[var(--ink)]">
                    {Math.round(optimizeStatus.pct)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden border border-[var(--line)] bg-[var(--bg-deep)]">
                  <div
                    className={`grocer-opt-bar h-full transition-[width] duration-500 ease-out ${
                      optimizeStatus.tone === "warn"
                        ? "bg-[var(--warn)]"
                        : "bg-[var(--leaf)]"
                    }`}
                    style={{ width: `${optimizeStatus.pct}%` }}
                  />
                </div>
              </div>
            ) : null}
            {error ? <p className="mt-3 text-sm text-[var(--warn)]">{error}</p> : null}
          </div>

          <div className="border border-[var(--line)] bg-[var(--card)] p-5 md:p-6">
            <StorePicker
              stores={stores}
              modes={storeModes}
              onChange={(storeId, mode) =>
                setStoreModes((prev) => ({ ...prev, [storeId]: mode }))
              }
            />
          </div>
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

                <PlanSavingsCompare
                  plans={result.plans}
                  selectedPlanId={selectedPlan?.id}
                  recommendedPlanId={result.recommendedPlanId}
                  onSelect={setSelectedPlanId}
                />

                {selectedPlan ? (
                  <>
                    <PlanDetail
                      plan={selectedPlan}
                      baselineSingle={baselineSingle}
                      matches={result.matches}
                      coupons={result.coupons ?? []}
                      couponChoices={couponChoices}
                      onCouponChange={selectCoupon}
                      onSelect={selectMatch}
                    />
                    <button
                      type="button"
                      onClick={() => setShoppingMode(true)}
                      className="mt-6 w-full bg-[var(--ink)] px-4 py-3 text-base font-semibold text-white transition hover:bg-[var(--leaf-deep)]"
                    >
                      Let’s shop
                    </button>
                  </>
                ) : null}
              </div>

              <MatchesPanel
                matches={result.matches}
                onSelect={selectMatch}
                preferLocal={preferLocal}
                preferOrganic={preferOrganic}
                preferKosher={preferKosher}
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
                Start typing an item to see live matches and estimated prices. Prefer or
                exclude stores below, then optimize when you’re ready.
              </p>
            </div>
          )}
        </div>
      </section>
      )}
    </main>
  );
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.8 15.8 6.2" />
      <path d="M8.2 13.2 15.8 17.8" />
    </svg>
  );
}

function RevertIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function bestSingleStopPlan(plans: CartPlan[]): CartPlan | undefined {
  return plans
    .filter((plan) => plan.stops === 1)
    .sort((a, b) => a.subtotalUsd - b.subtotalUsd)[0];
}

function savingsVsPlan(plan: CartPlan, baseline?: CartPlan): number | null {
  if (!baseline) return null;
  return Math.round((baseline.subtotalUsd - plan.subtotalUsd) * 100) / 100;
}

function formatSavingsDelta(delta: number | null): string {
  if (delta == null) return "—";
  if (Math.abs(delta) < 0.005) return "Same total";
  if (delta > 0) return `Save ${formatUsd(delta)}`;
  return `+${formatUsd(Math.abs(delta))} more`;
}

function PlanSavingsCompare({
  plans,
  selectedPlanId,
  recommendedPlanId,
  onSelect,
}: {
  plans: CartPlan[];
  selectedPlanId?: string;
  recommendedPlanId: string;
  onSelect: (planId: string) => void;
}) {
  const baseline = bestSingleStopPlan(plans);
  const ranked = [...plans].sort((a, b) => {
    if (a.stops !== b.stops) return a.stops - b.stops;
    return a.subtotalUsd - b.subtotalUsd;
  });

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {ranked.map((plan) => {
        const delta = savingsVsPlan(plan, baseline);
        return (
          <PlanChip
            key={plan.id}
            plan={plan}
            savingsLabel={
              plan.stops === 1 && baseline?.id === plan.id
                ? "1-stop baseline"
                : formatSavingsDelta(delta)
            }
            savingsPositive={delta != null && delta > 0}
            active={plan.id === selectedPlanId}
            recommended={plan.id === recommendedPlanId}
            onClick={() => onSelect(plan.id)}
          />
        );
      })}
    </div>
  );
}

function PlanChip({
  plan,
  active,
  recommended,
  savingsLabel,
  savingsPositive,
  onClick,
}: {
  plan: CartPlan;
  active: boolean;
  recommended: boolean;
  savingsLabel: string;
  savingsPositive: boolean;
  onClick: () => void;
}) {
  const honesty = summarizeLinePriceHonesty(
    plan.lines
      .filter((l) => l.storeId !== "__unmatched__")
      .map((l) => l.offer.priceSource),
  );
  const honestyTag = priceHonestyShortTag(honesty);
  const honestyOk = priceHonestyIsAuthoritative(honesty);

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
        <span
          className={
            active
              ? honestyOk
                ? " text-white/75"
                : " font-semibold text-white"
              : honestyOk
                ? ""
                : " font-semibold text-[var(--warn)]"
          }
        >
          {" "}
          · {honestyTag}
        </span>
      </span>
      <span
        className={`mt-0.5 block text-xs font-semibold ${
          active
            ? "text-white"
            : savingsPositive
              ? "text-[var(--sale)]"
              : "text-[var(--ink-muted)]"
        }`}
      >
        {savingsLabel}
      </span>
    </button>
  );
}

function PlanDetail({
  plan,
  baselineSingle,
  matches,
  coupons = [],
  couponChoices = {},
  onCouponChange,
  onSelect,
  shoppingMode = false,
  checkedById = {},
  onToggleChecked,
}: {
  plan: CartPlan;
  baselineSingle?: CartPlan;
  matches: ItemMatchResult[];
  coupons?: Coupon[];
  couponChoices?: Record<string, CouponChoice>;
  onCouponChange?: (itemId: string, choice: CouponChoice) => void;
  onSelect: (itemId: string, offerId: string) => void;
  shoppingMode?: boolean;
  checkedById?: Record<string, boolean>;
  onToggleChecked?: (itemId: string) => void;
}) {
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const byStore = plan.storeIds.map((storeId) => ({
    storeId,
    storeName: plan.lines.find((l) => l.storeId === storeId)?.storeName ?? storeId,
    lines: plan.lines.filter((l) => l.storeId === storeId),
  }));
  const delta = savingsVsPlan(plan, baselineSingle);
  const extraStops = Math.max(0, plan.stops - 1);
  const perStop =
    delta != null && delta > 0 && extraStops > 0
      ? Math.round((delta / extraStops) * 100) / 100
      : null;
  const matchByItem = new Map(matches.map((m) => [m.itemId, m]));
  const pricedLines = plan.lines.filter((l) => l.storeId !== "__unmatched__");
  const planHonesty = summarizeLinePriceHonesty(
    pricedLines.map((l) => l.offer.priceSource),
  );
  const planHonestyOk = priceHonestyIsAuthoritative(planHonesty);

  return (
    <div className={shoppingMode ? "mt-4 space-y-6" : "mt-6 space-y-5"}>
      {!shoppingMode ? (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat
              label="Total"
              value={`${formatUsd(plan.subtotalUsd)} · ${priceHonestyShortTag(planHonesty)}`}
            />
            <Stat label="Stops" value={String(plan.stops)} />
            <Stat
              label="vs 1-stop"
              value={
                plan.stops === 1 && baselineSingle?.id === plan.id
                  ? "Baseline"
                  : formatSavingsDelta(delta)
              }
            />
            <Stat
              label="Per extra stop"
              value={
                perStop != null
                  ? formatUsd(perStop)
                  : extraStops === 0
                    ? "—"
                    : "—"
              }
            />
          </div>
          {!planHonestyOk && pricedLines.length > 0 ? (
            <p className="text-sm text-[var(--warn)]">
              This plan is mostly modeled/est. prices — not a fully live-priced result.
              Prefer Fred Meyer / QFC when live data is available.
            </p>
          ) : null}
          {delta != null && plan.stops > 1 ? (
            <p className="text-sm text-[var(--ink-muted)]">
              {delta > 0
                ? `This plan saves ${formatUsd(delta)} versus shopping everything at ${baselineSingle?.label ?? "one store"}${
                    perStop != null
                      ? ` — about ${formatUsd(perStop)} per extra stop. Worth it if that tradeoff feels fair for your time.`
                      : "."
                  }`
                : delta < 0
                  ? `This plan costs ${formatUsd(Math.abs(delta))} more than the best one-stop option — usually not worth the extra trip.`
                  : "Same total as the best one-stop plan."}
            </p>
          ) : null}
          <p className="text-sm text-[var(--ink-muted)]">
            Tap an item to compare priced options. Choose a coupon per line (None / Auto /
            clip) to update the price instantly — no new API call.
          </p>
        </>
      ) : null}
      {byStore.map((group) => {
        const groupDone = shoppingMode
          ? group.lines.every((l) => checkedById[l.itemId])
          : false;
        const stopHonesty =
          group.storeId === "__unmatched__"
            ? null
            : summarizeLinePriceHonesty(group.lines.map((l) => l.offer.priceSource));
        const stopTag = stopHonesty ? priceHonestyShortTag(stopHonesty) : null;
        const stopOk = stopHonesty
          ? priceHonestyIsAuthoritative(stopHonesty)
          : true;
        return (
          <div
            key={group.storeId}
            className={groupDone ? "opacity-55" : undefined}
          >
            <h3
              className={`mb-2 font-semibold text-[var(--leaf-deep)] ${
                shoppingMode ? "text-base" : ""
              }`}
            >
              {group.storeName}
              {stopTag ? (
                <span
                  className={`ml-2 text-sm font-semibold ${
                    stopOk ? "font-normal text-[var(--ink-muted)]" : "text-[var(--warn)]"
                  }`}
                >
                  · {stopTag}
                </span>
              ) : null}
              {shoppingMode ? (
                <span className="ml-2 font-normal text-[var(--ink-muted)]">
                  · {group.lines.filter((l) => checkedById[l.itemId]).length}/
                  {group.lines.length}
                </span>
              ) : null}
            </h3>
            {group.storeId === "__unmatched__" ? (
              <p className="mb-2 text-sm text-[var(--warn)]">
                These were on your list but didn’t get a confident price match. Cross them
                off when you grab something in-store.
              </p>
            ) : null}
            <ul className={shoppingMode ? "space-y-3" : "space-y-2"}>
              {group.lines.map((line) => {
                const itemMatch = matchByItem.get(line.itemId);
                const open = !shoppingMode && openItemId === line.itemId;
                const checked = Boolean(checkedById[line.itemId]);
                const choice = couponChoices[line.itemId] ?? "auto";
                const lineCoupons =
                  line.storeId === "__unmatched__"
                    ? []
                    : selectableCouponsForOffer(line.offer, coupons);
                const savings = couponSavingsUsd(line.offer, coupons, choice);
                return (
                  <li
                    key={line.itemId}
                    className={`border-b border-[var(--line)] ${
                      shoppingMode ? "pb-3" : "pb-2 text-sm"
                    }`}
                  >
                    {shoppingMode ? (
                      <button
                        type="button"
                        onClick={() => onToggleChecked?.(line.itemId)}
                        className={`flex w-full items-center gap-4 py-1 text-left transition ${
                          checked ? "opacity-55" : ""
                        }`}
                        aria-pressed={checked}
                        aria-label={
                          checked
                            ? `Unmark ${line.offer.name}`
                            : `Cross out ${line.offer.name}`
                        }
                      >
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center border-2 text-lg font-bold ${
                            checked
                              ? "border-[var(--leaf)] bg-[var(--leaf)] text-white"
                              : "border-[var(--line)] text-transparent"
                          }`}
                          aria-hidden
                        >
                          ✓
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-base font-medium leading-snug ${
                              checked ? "text-[var(--ink-muted)] line-through" : ""
                            }`}
                          >
                            {line.quantity}× {line.offer.name}
                          </span>
                          <span
                            className={`mt-0.5 block text-sm text-[var(--ink-muted)] ${
                              checked ? "line-through" : ""
                            }`}
                          >
                            for “{line.query}”
                            {line.offer.onSale ? " · sale" : ""}
                            {line.appliedCouponIds.length ? " · coupon" : ""}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 text-base font-semibold tabular-nums whitespace-nowrap ${
                            checked ? "line-through text-[var(--ink-muted)]" : ""
                          }`}
                        >
                          {line.storeId === "__unmatched__"
                            ? "TBD"
                            : formatUsdWithSource(
                                line.lineTotalUsd,
                                line.offer.priceSource,
                              )}
                        </span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenItemId((id) =>
                              id === line.itemId ? null : line.itemId,
                            )
                          }
                          className="flex w-full items-start justify-between gap-3 text-left transition hover:text-[var(--leaf-deep)]"
                          aria-expanded={open}
                        >
                          <div>
                            <p className="font-medium">
                              {line.offer.priceSource === "ad" ? (
                                <span className="mr-1.5 text-[10px] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
                                  Ad
                                </span>
                              ) : null}
                              <DealBadge
                                signal={line.offer.dealSignal}
                                className="mr-1.5"
                              />
                              {line.quantity}× {line.offer.name}
                            </p>
                            <p className="text-[var(--ink-muted)]">
                              for “{line.query}”
                              {line.brandPreferred ? " · brand preference" : ""}
                              {line.offer.onSale ? " · sale" : ""}
                              {line.appliedCouponIds.length ? " · coupon applied" : ""}
                              {line.isLocal ? " · local" : ""}
                              {itemMatch && itemMatch.matches.length > 1
                                ? open
                                  ? " · hide options"
                                  : " · see options"
                                : ""}
                            </p>
                            {line.recommendedReplacement ? (
                              <p className="mt-1 text-[var(--sale)]">
                                Recommended: {line.recommendedReplacement.offer.name} at{" "}
                                {line.recommendedReplacement.storeName} — save{" "}
                                {formatUsd(line.recommendedReplacement.savingsUsd)}
                              </p>
                            ) : null}
                          </div>
                          <p className="font-semibold whitespace-nowrap">
                            {line.storeId === "__unmatched__"
                              ? "TBD"
                              : formatUsdWithSource(
                                  line.lineTotalUsd,
                                  line.offer.priceSource,
                                )}
                          </p>
                        </button>
                        {line.storeId !== "__unmatched__" &&
                        (lineCoupons.length > 0 || line.appliedCouponIds.length > 0) ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <label className="sr-only" htmlFor={`coupon-${line.itemId}`}>
                              Coupon for {line.offer.name}
                            </label>
                            <select
                              id={`coupon-${line.itemId}`}
                              value={choice}
                              onChange={(e) =>
                                onCouponChange?.(
                                  line.itemId,
                                  e.target.value as CouponChoice,
                                )
                              }
                              onClick={(e) => e.stopPropagation()}
                              className="max-w-full border border-[var(--line)] bg-[var(--card)] px-2 py-1.5 text-sm text-[var(--ink)]"
                            >
                              <option value="auto">Coupon: Auto (best)</option>
                              <option value="none">Coupon: None</option>
                              {lineCoupons.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.title}
                                </option>
                              ))}
                            </select>
                            {savings > 0 ? (
                              <span className="text-sm font-semibold text-[var(--sale)]">
                                Save {formatUsd(savings)}
                              </span>
                            ) : choice === "none" ? (
                              <span className="text-sm text-[var(--ink-muted)]">
                                No coupon
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {open && itemMatch ? (
                          <ul className="mt-3 space-y-2">
                            {!itemMatch.matches.length ? (
                              <li className="text-[var(--warn)]">No other matches.</li>
                            ) : (
                              itemMatch.matches.slice(0, 6).map((m) => {
                                const selected =
                                  itemMatch.selectedOfferId === m.offer.id ||
                                  (!itemMatch.selectedOfferId &&
                                    m.offer.id === line.offer.id);
                                return (
                                  <li key={m.offer.id}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onSelect(line.itemId, m.offer.id);
                                        setOpenItemId(null);
                                      }}
                                      className={`flex w-full items-start justify-between gap-3 border px-3 py-2 text-left text-sm transition ${
                                        selected
                                          ? "border-[var(--leaf)] bg-[#eef6f0]"
                                          : "border-[var(--line)] bg-[var(--card)] hover:border-[var(--leaf)] hover:bg-[#f7faf6]"
                                      }`}
                                    >
                                      <span>
                                        <span className="flex flex-wrap items-baseline gap-2">
                                          {m.offer.priceSource === "ad" ? (
                                            <span className="text-[10px] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
                                              Ad
                                            </span>
                                          ) : null}
                                          <DealBadge signal={m.offer.dealSignal} />
                                          <span className="font-medium">{m.offer.name}</span>
                                          {m.offer.isLocal ? (
                                            <span
                                              className="text-base font-bold tracking-wide"
                                              style={{ color: "var(--local)" }}
                                            >
                                              Local
                                            </span>
                                          ) : null}
                                        </span>
                                        <span className="mt-1 block text-[var(--ink-muted)]">
                                          {m.store.name}
                                          {m.offer.isOrganic ? " · organic" : ""}
                                          {!m.offer.isOrganic && m.offer.isNonGmo
                                            ? " · non-GMO"
                                            : ""}
                                          {m.offer.isKosher ? " · kosher" : ""}
                                          {m.offer.onSale ? " · sale" : ""}
                                          {m.appliedCouponIds.length ? " · coupon" : ""}
                                        </span>
                                      </span>
                                      <span className="font-semibold whitespace-nowrap">
                                        {formatUsdWithSource(
                                          m.effectivePriceUsd * line.quantity,
                                          m.offer.priceSource,
                                        )}
                                      </span>
                                    </button>
                                  </li>
                                );
                              })
                            )}
                          </ul>
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
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
  preferOrganic,
  preferKosher,
}: {
  matches: ItemMatchResult[];
  onSelect: (itemId: string, offerId: string) => void;
  preferLocal: boolean;
  preferOrganic: boolean;
  preferKosher: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const preferenceNote = [
    preferLocal ? "local" : null,
    preferOrganic ? "organic/non-GMO" : null,
    preferKosher ? "kosher" : null,
  ]
    .filter(Boolean)
    .join(", ");
  const matchedCount = matches.filter((m) => m.matches.length > 0).length;
  const unmatchedCount = matches.length - matchedCount;
  const collapsedSummary =
    matches.length === 0
      ? "No items yet"
      : `Matches · ${matches.length} item${matches.length === 1 ? "" : "s"}${
          matchedCount ? ` · ${matchedCount} matched` : ""
        }${unmatchedCount ? ` · ${unmatchedCount} unmatched` : ""}`;

  return (
    <div className="border border-[var(--line)] bg-[var(--card)] p-5 md:p-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h2
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Item matches
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {open
              ? `Tap an item to compare offers, then pick one to lock it into the plan (updates instantly, no new price fetch).${
                  preferenceNote
                    ? ` Preferring ${preferenceNote} when prices stay close.`
                    : ""
                }`
              : collapsedSummary}
          </p>
        </div>
        <span
          className="mt-0.5 shrink-0 text-sm font-semibold text-[var(--leaf)]"
          aria-hidden
        >
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open ? (
        <div className="mt-5 space-y-1">
          {matches.map((match) => {
            const itemOpen = openItemId === match.itemId;
            const locked =
              match.matches.find((m) => m.offer.id === match.selectedOfferId) ??
              match.matches[0];
            const hasOptions = match.matches.length > 0;
            return (
              <div key={match.itemId} className="border-t border-[var(--line)] pt-4 pb-3">
                <button
                  type="button"
                  onClick={() =>
                    setOpenItemId((id) => (id === match.itemId ? null : match.itemId))
                  }
                  className="flex w-full items-start justify-between gap-3 text-left transition hover:text-[var(--leaf-deep)]"
                  aria-expanded={itemOpen}
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {match.query}{" "}
                      <span className="font-normal text-[var(--ink-muted)]">
                        ×{match.quantity}
                      </span>
                    </p>
                    <p
                      className={`mt-1 text-sm ${
                        hasOptions ? "text-[var(--ink-muted)]" : "text-[var(--warn)]"
                      }`}
                    >
                      {hasOptions && locked
                        ? `${locked.offer.name} · ${locked.store.name} · ${formatUsdWithSource(
                            locked.effectivePriceUsd,
                            locked.offer.priceSource,
                          )}`
                        : "No matches found."}
                      {hasOptions
                        ? itemOpen
                          ? " · hide options"
                          : match.matches.length > 1
                            ? " · see options"
                            : " · see match"
                        : ""}
                    </p>
                  </div>
                  <span
                    className="mt-0.5 shrink-0 text-sm font-semibold text-[var(--leaf)]"
                    aria-hidden
                  >
                    {itemOpen ? "Hide" : "Show"}
                  </span>
                </button>
                {itemOpen ? (
                  !hasOptions ? (
                    <p className="mt-3 text-sm text-[var(--warn)]">No matches found.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {match.matches.slice(0, 4).map((m) => {
                        const selected = match.selectedOfferId === m.offer.id;
                        return (
                          <li key={m.offer.id}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onSelect(match.itemId, m.offer.id);
                                setOpenItemId(null);
                              }}
                              className={`flex w-full items-start justify-between gap-3 border px-3 py-2 text-left text-sm transition ${
                                selected
                                  ? "border-[var(--leaf)] bg-[#eef6f0]"
                                  : "border-[var(--line)] bg-[var(--card)] hover:border-[var(--leaf)] hover:bg-[#f7faf6]"
                              }`}
                            >
                              <span>
                                <span className="flex flex-wrap items-baseline gap-2">
                                  {m.offer.priceSource === "ad" ? (
                                    <span className="text-[10px] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
                                      Ad
                                    </span>
                                  ) : null}
                                  <DealBadge signal={m.offer.dealSignal} />
                                  <span className="font-medium">{m.offer.name}</span>
                                  {m.offer.isLocal ? (
                                    <span
                                      className="text-base font-bold tracking-wide"
                                      style={{ color: "var(--local)" }}
                                    >
                                      Local
                                    </span>
                                  ) : null}
                                </span>
                                <span className="mt-1 block text-[var(--ink-muted)]">
                                  {m.store.name}
                                  {m.offer.isOrganic ? " · organic" : ""}
                                  {!m.offer.isOrganic && m.offer.isNonGmo
                                    ? " · non-GMO"
                                    : ""}
                                  {m.offer.isKosher ? " · kosher" : ""}
                                  {m.offer.onSale ? " · sale" : ""}
                                  {m.appliedCouponIds.length ? " · coupon" : ""}
                                </span>
                              </span>
                              <span className="font-semibold whitespace-nowrap">
                                {formatUsdWithSource(
                                  m.effectivePriceUsd,
                                  m.offer.priceSource,
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
