"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type SharedItem = {
  id: string;
  query: string;
  quantity: number;
  notes?: string;
  checked?: boolean;
};

type SharedList = {
  id: string;
  name: string;
  zip: string;
  shareId: string;
  items: SharedItem[];
  updatedAt: string;
};

export default function SharedListPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const [shareId, setShareId] = useState<string>("");
  const [list, setList] = useState<SharedList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void params.then((p) => setShareId(p.shareId));
  }, [params]);

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/share/${id}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Shared list not found.");
      setList(null);
      return;
    }
    setList(data.list);
    setError(null);
  }, []);

  useEffect(() => {
    if (!shareId) return;
    void load(shareId);
    const timer = window.setInterval(() => void load(shareId), 8000);
    return () => window.clearInterval(timer);
  }, [shareId, load]);

  async function toggleChecked(item: SharedItem) {
    if (!shareId) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/share/${shareId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked: !item.checked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update item.");
      setList(data.list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update item.");
    } finally {
      setBusyId(null);
    }
  }

  const remaining = list?.items.filter((item) => !item.checked).length ?? 0;

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-5 py-10">
      <p className="text-sm font-semibold tracking-[0.16em] text-[var(--leaf)] uppercase">
        Shared list · no account needed
      </p>
      <h1
        className="mt-3 text-4xl font-semibold tracking-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {list?.name ?? "Grocery list"}
      </h1>
      <p className="mt-2 text-[var(--ink-muted)]">
        Cross out items while you shop. You can’t delete or clear this shared list —
        only the owner can.
      </p>

      {error ? <p className="mt-4 text-sm text-[var(--warn)]">{error}</p> : null}

      {list ? (
        <>
          <p className="mt-6 text-sm text-[var(--ink-muted)]">
            {remaining} left · {list.items.length} total
          </p>
          <ul className="mt-4 space-y-2">
            {list.items.map((item) => {
              const checked = Boolean(item.checked);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void toggleChecked(item)}
                    className={`flex w-full items-center gap-3 border px-3 py-3 text-left transition ${
                      checked
                        ? "border-[var(--line)] bg-[#f3f6f1] text-[var(--ink-muted)] line-through opacity-55"
                        : "border-[var(--line)] bg-white hover:border-[var(--leaf)]"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                        checked
                          ? "border-[var(--ink-muted)] bg-[var(--ink-muted)] text-white"
                          : "border-[var(--line)]"
                      }`}
                      aria-hidden
                    >
                      {checked ? "✓" : ""}
                    </span>
                    <span>
                      <span className="font-medium">
                        {item.quantity > 1 ? `${item.quantity}× ` : ""}
                        {item.query}
                      </span>
                      {item.notes ? (
                        <span className="mt-0.5 block text-sm text-[var(--ink-muted)]">
                          {item.notes}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : !error ? (
        <p className="mt-8 text-[var(--ink-muted)]">Loading list…</p>
      ) : null}

      <p className="mt-10 text-sm text-[var(--ink-muted)]">
        Want to build your own free cross-shop list?{" "}
        <Link href="/" className="font-semibold text-[var(--leaf-deep)] underline-offset-2 hover:underline">
          Open Grocer
        </Link>
      </p>
    </main>
  );
}
