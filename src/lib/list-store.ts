import { randomBytes, randomUUID } from "crypto";
import { initAppDb } from "./app-db";
import type { GroceryList, ListItem } from "./types";

type ListItemInput = Omit<ListItem, "id" | "quantity"> & {
  id?: string;
  quantity?: number;
};

type ListPatch = Partial<
  Omit<
    Pick<
      GroceryList,
      | "name"
      | "zip"
      | "preferLocal"
      | "preferOrganic"
      | "preferKosher"
      | "savingsThresholdUsd"
      | "items"
      | "userId"
      | "shareId"
    >,
    "items"
  >
> & { items?: ListItemInput[] };

type ListRow = {
  id: string;
  name: string;
  zip: string;
  prefer_local: number;
  prefer_organic: number;
  prefer_kosher: number;
  savings_threshold_usd: number;
  user_id: string | null;
  share_id: string | null;
  items_json: string;
  created_at: string;
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function withDietDefaults(list: GroceryList): GroceryList {
  return {
    ...list,
    preferLocal: Boolean(list.preferLocal),
    preferOrganic: Boolean(list.preferOrganic),
    preferKosher: Boolean(list.preferKosher),
    userId: list.userId ?? null,
    shareId: list.shareId ?? null,
  };
}

function rowToList(row: ListRow): GroceryList {
  let items: ListItem[] = [];
  try {
    const parsed = JSON.parse(row.items_json) as ListItem[];
    items = Array.isArray(parsed) ? parsed.map((item) => normalizeItem(item)) : [];
  } catch {
    items = [];
  }
  return withDietDefaults({
    id: row.id,
    name: row.name,
    zip: row.zip,
    preferLocal: Boolean(row.prefer_local),
    preferOrganic: Boolean(row.prefer_organic),
    preferKosher: Boolean(row.prefer_kosher),
    savingsThresholdUsd: row.savings_threshold_usd,
    userId: row.user_id,
    shareId: row.share_id,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function persistList(list: GroceryList): void {
  const db = initAppDb();
  db.prepare(
    `
    INSERT INTO lists (
      id, name, zip, prefer_local, prefer_organic, prefer_kosher,
      savings_threshold_usd, user_id, share_id, items_json, created_at, updated_at
    ) VALUES (
      @id, @name, @zip, @prefer_local, @prefer_organic, @prefer_kosher,
      @savings_threshold_usd, @user_id, @share_id, @items_json, @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      zip = excluded.zip,
      prefer_local = excluded.prefer_local,
      prefer_organic = excluded.prefer_organic,
      prefer_kosher = excluded.prefer_kosher,
      savings_threshold_usd = excluded.savings_threshold_usd,
      user_id = excluded.user_id,
      share_id = excluded.share_id,
      items_json = excluded.items_json,
      updated_at = excluded.updated_at
  `,
  ).run({
    id: list.id,
    name: list.name,
    zip: list.zip,
    prefer_local: list.preferLocal ? 1 : 0,
    prefer_organic: list.preferOrganic ? 1 : 0,
    prefer_kosher: list.preferKosher ? 1 : 0,
    savings_threshold_usd: list.savingsThresholdUsd,
    user_id: list.userId ?? null,
    share_id: list.shareId ?? null,
    items_json: JSON.stringify(list.items),
    created_at: list.createdAt,
    updated_at: list.updatedAt,
  });
}

export function createList(input: {
  id?: string;
  name?: string;
  zip?: string;
  preferLocal?: boolean;
  preferOrganic?: boolean;
  preferKosher?: boolean;
  savingsThresholdUsd?: number;
  userId?: string | null;
  shareId?: string | null;
  items?: Array<{
    id?: string;
    query: string;
    quantity?: number;
    notes?: string;
    selectedOfferId?: string;
    preferredProductId?: string;
    preferredBrand?: string;
    checked?: boolean;
  }>;
}): GroceryList {
  const createdAt = nowIso();
  const list: GroceryList = {
    id: input.id ?? randomUUID(),
    name: input.name?.trim() || "My grocery list",
    zip: input.zip?.trim() || "98042",
    preferLocal: input.preferLocal ?? false,
    preferOrganic: input.preferOrganic ?? false,
    preferKosher: input.preferKosher ?? false,
    savingsThresholdUsd: input.savingsThresholdUsd ?? 8,
    userId: input.userId ?? null,
    shareId: input.shareId ?? null,
    items: (input.items ?? []).map((item) => normalizeItem(item)),
    createdAt,
    updatedAt: createdAt,
  };
  persistList(list);
  return list;
}

export function getList(id: string): GroceryList | undefined {
  const db = initAppDb();
  const row = db.prepare(`SELECT * FROM lists WHERE id = ?`).get(id) as ListRow | undefined;
  return row ? rowToList(row) : undefined;
}

export function getListByShareId(shareId: string): GroceryList | undefined {
  const db = initAppDb();
  const row = db
    .prepare(`SELECT * FROM lists WHERE share_id = ?`)
    .get(shareId) as ListRow | undefined;
  return row ? rowToList(row) : undefined;
}

export function updateList(id: string, patch: ListPatch): GroceryList | undefined {
  const existing = getList(id);
  if (!existing) return undefined;
  const next: GroceryList = {
    ...existing,
    name: patch.name ?? existing.name,
    zip: patch.zip ?? existing.zip,
    preferLocal: patch.preferLocal ?? existing.preferLocal,
    preferOrganic: patch.preferOrganic ?? existing.preferOrganic,
    preferKosher: patch.preferKosher ?? existing.preferKosher,
    savingsThresholdUsd: patch.savingsThresholdUsd ?? existing.savingsThresholdUsd,
    userId: patch.userId !== undefined ? patch.userId : existing.userId,
    shareId: patch.shareId !== undefined ? patch.shareId : existing.shareId,
    items: patch.items
      ? patch.items.map((item) => normalizeItem(item))
      : existing.items,
    updatedAt: nowIso(),
  };
  persistList(next);
  return next;
}

/** Update an existing list, or recreate it when the store was wiped (HMR/restart). */
export function upsertList(id: string, patch: ListPatch): GroceryList {
  const updated = updateList(id, patch);
  if (updated) return updated;
  return createList({
    id,
    name: patch.name,
    zip: patch.zip,
    preferLocal: patch.preferLocal,
    preferOrganic: patch.preferOrganic,
    preferKosher: patch.preferKosher,
    savingsThresholdUsd: patch.savingsThresholdUsd,
    userId: patch.userId,
    shareId: patch.shareId,
    items: patch.items,
  });
}

function normalizeItem(item: ListItemInput): ListItem {
  return {
    id: item.id || randomUUID(),
    query: item.query.trim(),
    quantity: Math.max(1, Number(item.quantity) || 1),
    notes: item.notes,
    selectedOfferId: item.selectedOfferId,
    preferredProductId: item.preferredProductId,
    preferredBrand: item.preferredBrand,
    checked: Boolean(item.checked),
  };
}

export function listsForUser(userId: string): GroceryList[] {
  const db = initAppDb();
  const rows = db
    .prepare(`SELECT * FROM lists WHERE user_id = ? ORDER BY updated_at DESC`)
    .all(userId) as ListRow[];
  return rows.map(rowToList);
}

export function ensureUserCloudList(userId: string, zip = "98042"): GroceryList {
  const existing = listsForUser(userId)[0];
  if (existing) return existing;
  return createList({
    name: "Cloud grocery list",
    zip,
    preferLocal: true,
    userId,
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

/** Attach a device list to an account so it syncs across devices. */
export function claimListForUser(listId: string, userId: string): GroceryList | undefined {
  const list = getList(listId);
  if (!list) return undefined;
  if (list.userId && list.userId !== userId) return undefined;
  return updateList(listId, { userId }) ?? undefined;
}

function itemKey(query: string) {
  return query.trim().toLowerCase();
}

/**
 * On login: keep guest items. If the account already has a cloud list, merge
 * unique guest items into it; otherwise promote the guest list.
 */
export function mergeDeviceListIntoUserCloud(
  deviceListId: string | null | undefined,
  userId: string,
  zip = "98042",
): GroceryList {
  const device = deviceListId ? getList(deviceListId) : undefined;
  const canUseDevice =
    device && (!device.userId || device.userId === userId) ? device : undefined;
  const cloudLists = listsForUser(userId);
  let cloud = cloudLists[0];

  if (!cloud) {
    if (canUseDevice) {
      return claimListForUser(canUseDevice.id, userId) ?? ensureUserCloudList(userId, zip);
    }
    return ensureUserCloudList(userId, zip);
  }

  if (canUseDevice && canUseDevice.id !== cloud.id) {
    const existingKeys = new Set(
      cloud.items.map((item) => itemKey(item.query)).filter(Boolean),
    );
    const additions = canUseDevice.items
      .filter((item) => {
        const key = itemKey(item.query);
        return key.length > 0 && !existingKeys.has(key);
      })
      .map((item) => ({
        ...item,
        id: randomUUID(),
      }));
    if (additions.length) {
      cloud =
        updateList(cloud.id, {
          items: [...cloud.items, ...additions],
        }) ?? cloud;
    }
  }

  return cloud;
}

export function ensureGuestList(id?: string | null, zip = "98042"): GroceryList {
  if (id) {
    const existing = getList(id);
    if (existing && !existing.userId) return existing;
  }
  return createList({
    name: "My grocery list",
    zip,
    preferLocal: true,
    userId: null,
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

/** Account owners can create a public share link (no login required to open). */
export function enableListSharing(listId: string, userId: string): GroceryList | { error: string } {
  const list = getList(listId);
  if (!list) return { error: "List not found." };
  if (!list.userId || list.userId !== userId) {
    return { error: "Only the account that owns this cloud list can share it." };
  }
  if (list.shareId) return list;
  const shareId = randomBytes(6).toString("base64url");
  return updateList(listId, { shareId }) ?? { error: "Could not enable sharing." };
}

export function setSharedItemChecked(
  shareId: string,
  itemId: string,
  checked: boolean,
): GroceryList | { error: string } {
  const list = getListByShareId(shareId);
  if (!list) return { error: "Shared list not found." };
  const items = list.items.map((item) =>
    item.id === itemId ? { ...item, checked } : item,
  );
  if (!list.items.some((item) => item.id === itemId)) {
    return { error: "Item not found." };
  }
  return updateList(list.id, { items }) ?? { error: "Could not update item." };
}

export function clearListItems(listId: string): GroceryList | undefined {
  return updateList(listId, { items: [] });
}

/** Permanently remove lists owned by a user (account deletion). */
export function deleteListsForUser(userId: string): number {
  const db = initAppDb();
  const result = db.prepare(`DELETE FROM lists WHERE user_id = ?`).run(userId);
  return result.changes;
}

/** @deprecated use ensureGuestList / ensureUserCloudList */
export function ensureDemoList(): GroceryList {
  return ensureGuestList();
}
