"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatUsd, formatUsdWithSource } from "@/lib/pricing";
import type { Suggestion } from "@/lib/types";

const COLLAPSED_COUNT = 3;
const ROW_ESTIMATE_PX = 58;

type Props = {
  value: string;
  zip: string;
  preferLocal: boolean;
  preferOrganic: boolean;
  preferKosher: boolean;
  preferredStoreIds: string[];
  excludedStoreIds: string[];
  onChange: (value: string) => void;
  onSelect: (suggestion: Suggestion) => void;
  placeholder?: string;
  dimmed?: boolean;
};

export function ItemSuggestInput({
  value,
  zip,
  preferLocal,
  preferOrganic,
  preferKosher,
  preferredStoreIds,
  excludedStoreIds,
  onChange,
  onSelect,
  placeholder,
  dimmed = false,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [windowHeight, setWindowHeight] = useState(800);
  const requestId = useRef(0);

  const preferredKey = preferredStoreIds.join(",");
  const excludedKey = excludedStoreIds.join(",");

  useEffect(() => {
    return () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current);
    };
  }, []);

  useEffect(() => {
    function onDocMouseDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setExpanded(false);
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    function syncHeight() {
      setWindowHeight(window.innerHeight);
    }
    syncHeight();
    window.addEventListener("resize", syncHeight);
    return () => window.removeEventListener("resize", syncHeight);
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 1) {
      setSuggestions([]);
      setOpen(false);
      setExpanded(false);
      setLoading(false);
      return;
    }

    // Prefetch matches in the background, but never auto-open unless this field is focused.
    // Otherwise DEV/+15 / loaded lists open every row's dropdown at once.
    const handle = window.setTimeout(() => {
      const id = ++requestId.current;
      setLoading(true);
      const params = new URLSearchParams({
        q,
        zip,
        preferLocal: preferLocal ? "1" : "0",
        preferOrganic: preferOrganic ? "1" : "0",
        preferKosher: preferKosher ? "1" : "0",
      });
      if (preferredStoreIds.length) params.set("preferred", preferredKey);
      if (excludedStoreIds.length) params.set("excluded", excludedKey);

      void fetch(`/api/suggest?${params}`)
        .then(async (res) => {
          if (!res.ok) throw new Error("suggest failed");
          return res.json() as Promise<{ suggestions: Suggestion[] }>;
        })
        .then((data) => {
          if (id !== requestId.current) return;
          setSuggestions(data.suggestions);
          setActiveIndex(0);
          setExpanded(false);
          if (focused) setOpen(true);
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setSuggestions([]);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 180);

    return () => window.clearTimeout(handle);
  }, [
    value,
    zip,
    preferLocal,
    preferOrganic,
    preferKosher,
    preferredKey,
    excludedKey,
    preferredStoreIds.length,
    excludedStoreIds.length,
    focused,
  ]);

  const expandedSlotCount = Math.max(
    COLLAPSED_COUNT + 1,
    Math.min(8, Math.floor((windowHeight * 0.38) / ROW_ESTIMATE_PX)),
  );
  const hasMoreThanCollapsed = suggestions.length > COLLAPSED_COUNT;
  const listMaxHeight = expanded
    ? expandedSlotCount * ROW_ESTIMATE_PX
    : COLLAPSED_COUNT * ROW_ESTIMATE_PX;

  function choose(suggestion: Suggestion) {
    onSelect(suggestion);
    setOpen(false);
    setExpanded(false);
  }

  function clearBlurTimer() {
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }

  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 ${open && focused ? "z-50" : ""}`}
    >
      <input
        value={value}
        role="combobox"
        aria-expanded={open && focused}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          if (focused) setOpen(true);
        }}
        onFocus={() => {
          clearBlurTimer();
          setFocused(true);
          if (value.trim().length >= 1) setOpen(true);
        }}
        onBlur={() => {
          // Delay so suggestion / caret clicks still register.
          clearBlurTimer();
          blurTimer.current = window.setTimeout(() => {
            setFocused(false);
            setOpen(false);
            setExpanded(false);
          }, 120);
        }}
        onKeyDown={(e) => {
          if (!open || !suggestions.length) return;
          const collapsedLen = Math.min(COLLAPSED_COUNT, suggestions.length);
          const navLen = expanded ? suggestions.length : collapsedLen;

          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!expanded && activeIndex >= collapsedLen - 1 && hasMoreThanCollapsed) {
              setExpanded(true);
              setActiveIndex(collapsedLen);
              return;
            }
            setActiveIndex((i) => (i + 1) % navLen);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + navLen) % navLen);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = suggestions[activeIndex];
            if (pick) choose(pick);
          } else if (e.key === "Escape") {
            if (expanded) {
              setExpanded(false);
              setActiveIndex(Math.min(activeIndex, COLLAPSED_COUNT - 1));
            } else {
              setOpen(false);
            }
          }
        }}
        className={`w-full border border-transparent bg-transparent px-1 py-2 outline-none focus:border-[var(--line)] ${
          dimmed ? "text-[var(--ink-muted)] line-through opacity-70" : ""
        }`}
      />

      {open && focused && value.trim().length >= 1 ? (
        <div
          className="absolute top-full left-0 z-[60] mt-1.5 w-[min(100vw-2.5rem,28rem)] overflow-hidden border border-[var(--line)] bg-[var(--card)] ring-1 ring-[rgba(20,32,26,0.06)]"
          style={{
            boxShadow:
              "0 4px 6px rgba(20,32,26,0.06), 0 18px 44px rgba(20,32,26,0.18)",
          }}
        >
          <ul
            id={listId}
            role="listbox"
            className="overflow-y-auto overscroll-contain bg-[var(--card)]"
            style={{ maxHeight: listMaxHeight }}
          >
            {loading && !suggestions.length ? (
              <li className="bg-[var(--card)] px-3 py-3 text-sm text-[var(--ink-muted)]">
                Searching prices…
              </li>
            ) : null}
            {!loading && !suggestions.length ? (
              <li className="bg-[var(--card)] px-3 py-3 text-sm text-[var(--ink-muted)]">
                No matches in your selected stores.
              </li>
            ) : null}
            {(expanded ? suggestions : suggestions.slice(0, COLLAPSED_COUNT)).map(
              (suggestion, index) => {
                const active = index === activeIndex;
                return (
                  <li key={suggestion.offerId} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(suggestion)}
                      className={`flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left text-sm ${
                        active
                          ? "bg-[#eef6f0]"
                          : "bg-[var(--card)] hover:bg-[#f7faf6]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-baseline gap-2">
                          {suggestion.priceSource === "ad" ? (
                            <span className="shrink-0 text-[10px] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
                              Ad
                            </span>
                          ) : null}
                          <span className="truncate font-medium">{suggestion.name}</span>
                          {suggestion.kind === "generic" ? (
                            <span className="shrink-0 text-[10px] font-semibold tracking-wide text-[var(--leaf-deep)] uppercase">
                              Generic
                            </span>
                          ) : null}
                          {suggestion.isLocal ? (
                            <span
                              className="shrink-0 text-base font-bold tracking-wide"
                              style={{ color: "var(--local)" }}
                            >
                              Local
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[var(--ink-muted)]">
                          {suggestion.kind === "generic"
                            ? suggestion.sizeLabel
                            : `${suggestion.storeName} · ${suggestion.sizeLabel}`}
                          {suggestion.isOrganic ? " · organic" : ""}
                          {!suggestion.isOrganic && suggestion.isNonGmo
                            ? " · non-GMO"
                            : ""}
                          {suggestion.isKosher ? " · kosher" : ""}
                          {suggestion.onSale ? " · sale" : ""}
                          {suggestion.kind === "brand" && suggestion.appliedCouponIds.length
                            ? " · coupon"
                            : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold whitespace-nowrap">
                          {suggestion.kind === "generic" ? "from " : ""}
                          {formatUsdWithSource(
                            suggestion.effectivePriceUsd,
                            suggestion.priceSource,
                          )}
                        </span>
                        {suggestion.kind === "brand" &&
                        suggestion.effectivePriceUsd < suggestion.listPriceUsd ? (
                          <span className="block text-xs text-[var(--ink-muted)] line-through">
                            {formatUsd(suggestion.listPriceUsd)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              },
            )}
          </ul>

          {hasMoreThanCollapsed ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setExpanded((prev) => {
                  const next = !prev;
                  if (!next) {
                    setActiveIndex((i) => Math.min(i, COLLAPSED_COUNT - 1));
                  }
                  return next;
                });
              }}
              className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--line)] bg-[#f7faf6] px-3 py-2 text-xs font-semibold tracking-wide text-[var(--ink-muted)] uppercase transition hover:bg-[#eef6f0] hover:text-[var(--ink)]"
              aria-expanded={expanded}
              aria-controls={listId}
            >
              <CaretIcon expanded={expanded} />
              {expanded
                ? "Show less"
                : `Show more (${suggestions.length - COLLAPSED_COUNT})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CaretIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
      fill="currentColor"
      aria-hidden
    >
      <path d="M3.2 5.8a.75.75 0 0 1 1.06-.1L8 8.9l3.74-3.2a.75.75 0 1 1 .96 1.15l-4.22 3.61a.75.75 0 0 1-.96 0L3.3 6.85a.75.75 0 0 1-.1-1.05Z" />
    </svg>
  );
}
