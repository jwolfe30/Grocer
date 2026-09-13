"use client";

import { useState } from "react";
import type { Store } from "@/lib/types";

export type StoreMode = "include" | "prefer" | "exclude";

type Props = {
  stores: Store[];
  modes: Record<string, StoreMode>;
  onChange: (storeId: string, mode: StoreMode) => void;
};

const MODES: { id: StoreMode; label: string }[] = [
  { id: "include", label: "Include" },
  { id: "prefer", label: "Prefer" },
  { id: "exclude", label: "Exclude" },
];

export function StorePicker({ stores, modes, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const preferred = stores.filter((s) => (modes[s.id] ?? "include") === "prefer").length;
  const excluded = stores.filter((s) => (modes[s.id] ?? "include") === "exclude").length;
  const previewNames = stores
    .slice(0, 4)
    .map((s) => s.name)
    .join(", ");
  const more = stores.length > 4 ? ` +${stores.length - 4} more` : "";

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h3 className="font-semibold text-[var(--ink)]">Stores</h3>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {open
              ? "Prefer stores to rank them higher in suggestions, or exclude ones you don’t want. Included stores still appear."
              : stores.length === 0
                ? "No stores loaded yet — tap to retry / expand."
                : `${stores.length} stores${preferred ? ` · ${preferred} preferred` : ""}${
                    excluded ? ` · ${excluded} excluded` : ""
                  }`}
          </p>
          {!open && stores.length > 0 ? (
            <p className="mt-2 text-sm text-[var(--ink)]">
              {previewNames}
              {more}
            </p>
          ) : null}
        </div>
        <span
          className="mt-0.5 shrink-0 text-sm font-semibold text-[var(--leaf)]"
          aria-hidden
        >
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open ? (
        stores.length === 0 ? (
          <p className="text-sm text-[var(--warn)]">
            Store list is empty. Refresh the page or check that the app can reach{" "}
            <code className="text-[var(--ink)]">/api/stores</code>.
          </p>
        ) : (
          <ul className="space-y-3">
            {stores.map((store) => {
              const mode = modes[store.id] ?? "include";
              return (
                <li
                  key={store.id}
                  className="flex flex-col gap-2 border-b border-[var(--line)] pb-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{store.name}</p>
                    <p className="text-sm text-[var(--ink-muted)]">{store.address}</p>
                    {store.krogerLocationId ? (
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                        Live prices when Kroger/cache responds
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs font-semibold text-[var(--warn)]">
                        est. prices only (no live API yet)
                      </p>
                    )}
                  </div>
                  <div
                    className="flex gap-1"
                    role="group"
                    aria-label={`${store.name} preference`}
                  >
                    {MODES.map((option) => {
                      const active = mode === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onChange(store.id, option.id)}
                          className={`border px-2.5 py-1 text-xs font-semibold transition ${
                            active
                              ? option.id === "exclude"
                                ? "border-[var(--warn)] bg-[var(--warn)] text-white"
                                : option.id === "prefer"
                                  ? "border-[var(--leaf)] bg-[var(--leaf)] text-white"
                                  : "border-[var(--ink)] bg-[var(--ink)] text-white"
                              : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--leaf)]"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

export function modesToFilters(modes: Record<string, StoreMode>): {
  preferredStoreIds: string[];
  excludedStoreIds: string[];
} {
  const preferredStoreIds: string[] = [];
  const excludedStoreIds: string[] = [];
  for (const [id, mode] of Object.entries(modes)) {
    if (mode === "prefer") preferredStoreIds.push(id);
    if (mode === "exclude") excludedStoreIds.push(id);
  }
  return { preferredStoreIds, excludedStoreIds };
}
