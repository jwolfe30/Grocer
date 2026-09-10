import { randomUUID } from "crypto";
import type { GroceryList, ListItem } from "./types";

const lists = new Map<string, GroceryList>();

function nowIso() {
  return new Date().toISOString();
}

export function createList(input: {
  name?: string;
  zip?: string;
  preferLocal?: boolean;
  savingsThresholdUsd?: number;
  items?: Array<{ query: string; quantity?: number; notes?: string }>;
}): GroceryList {
  const createdAt = nowIso();
  const list: GroceryList = {
    id: randomUUID(),
    name: input.name?.trim() || "My grocery list",
    zip: input.zip?.trim() || "97209",
    preferLocal: input.preferLocal ?? false,
    savingsThresholdUsd: input.savingsThresholdUsd ?? 8,
    items: (input.items ?? []).map((item) => ({
      id: randomUUID(),
      query: item.query.trim(),
      quantity: item.quantity ?? 1,
      notes: item.notes,
    })),
    createdAt,
    updatedAt: createdAt,
  };
  lists.set(list.id, list);
  return list;
}

export function getList(id: string): GroceryList | undefined {
  return lists.get(id);
}

type ListItemInput = Omit<ListItem, "id"> & { id?: string };

export function updateList(
  id: string,
  patch: Partial<
    Omit<Pick<GroceryList, "name" | "zip" | "preferLocal" | "savingsThresholdUsd" | "items">, "items">
  > & { items?: ListItemInput[] },
): GroceryList | undefined {
  const existing = lists.get(id);
  if (!existing) return undefined;
  const next: GroceryList = {
    ...existing,
    name: patch.name ?? existing.name,
    zip: patch.zip ?? existing.zip,
    preferLocal: patch.preferLocal ?? existing.preferLocal,
    savingsThresholdUsd: patch.savingsThresholdUsd ?? existing.savingsThresholdUsd,
    items: patch.items
      ? patch.items.map((item) => normalizeItem(item))
      : existing.items,
    updatedAt: nowIso(),
  };
  lists.set(id, next);
  return next;
}

function normalizeItem(item: ListItemInput): ListItem {
  return {
    id: item.id || randomUUID(),
    query: item.query.trim(),
    quantity: Math.max(1, item.quantity || 1),
    notes: item.notes,
    selectedOfferId: item.selectedOfferId,
    preferredProductId: item.preferredProductId,
  };
}

export function ensureDemoList(): GroceryList {
  const existing = [...lists.values()][0];
  if (existing) return existing;
  return createList({
    name: "Weeknight staples",
    zip: "97209",
    preferLocal: true,
    savingsThresholdUsd: 8,
    items: [
      { query: "whole milk", quantity: 1 },
      { query: "eggs", quantity: 1 },
      { query: "wheat bread", quantity: 1 },
      { query: "bananas", quantity: 2 },
      { query: "chicken breast", quantity: 2 },
      { query: "coffee", quantity: 1 },
    ],
  });
}
