import { randomUUID } from "crypto";
import type {
  PriceObservation,
  Receipt,
  ReceiptImageMeta,
  ReceiptLine,
} from "./account-types";
import { initAppDb } from "./app-db";
import { awardBadge, awardPoints, getUser, saveUser } from "./user-store";
import { SEED_STORES } from "./seed";

type ReceiptRow = {
  id: string;
  user_id: string;
  store_id: string | null;
  store_name: string;
  zip: string;
  purchased_at: string;
  uploaded_at: string;
  raw_text: string;
  lines_json: string;
  total_usd: number;
  points_awarded: number;
  badges_awarded_json: string;
  image_meta_json?: string | null;
};

type ObsRow = {
  id: string;
  store_id: string;
  store_name: string;
  zip: string;
  name: string;
  product_id: string;
  price_usd: number;
  quantity: number;
  observed_at: string;
  source: string;
  receipt_id: string;
  user_id: string;
};

function nowIso() {
  return new Date().toISOString();
}

function slugProductId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "item";
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToReceipt(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    userId: row.user_id,
    storeId: row.store_id ?? undefined,
    storeName: row.store_name,
    zip: row.zip,
    purchasedAt: row.purchased_at,
    uploadedAt: row.uploaded_at,
    rawText: row.raw_text,
    lines: parseJson<ReceiptLine[]>(row.lines_json, []),
    totalUsd: row.total_usd,
    pointsAwarded: row.points_awarded,
    badgesAwarded: parseJson<string[]>(row.badges_awarded_json, []),
    imageMeta: row.image_meta_json
      ? parseJson<ReceiptImageMeta | null>(row.image_meta_json, null)
      : null,
  };
}

function rowToObs(row: ObsRow): PriceObservation {
  return {
    id: row.id,
    storeId: row.store_id,
    storeName: row.store_name,
    zip: row.zip,
    name: row.name,
    productId: row.product_id,
    priceUsd: row.price_usd,
    quantity: row.quantity,
    observedAt: row.observed_at,
    source: "receipt",
    receiptId: row.receipt_id,
    userId: row.user_id,
  };
}

function persistReceipt(receipt: Receipt): void {
  const db = initAppDb();
  db.prepare(
    `
    INSERT INTO receipts (
      id, user_id, store_id, store_name, zip, purchased_at, uploaded_at,
      raw_text, lines_json, total_usd, points_awarded, badges_awarded_json,
      image_meta_json
    ) VALUES (
      @id, @user_id, @store_id, @store_name, @zip, @purchased_at, @uploaded_at,
      @raw_text, @lines_json, @total_usd, @points_awarded, @badges_awarded_json,
      @image_meta_json
    )
    ON CONFLICT(id) DO UPDATE SET
      store_id = excluded.store_id,
      store_name = excluded.store_name,
      zip = excluded.zip,
      purchased_at = excluded.purchased_at,
      uploaded_at = excluded.uploaded_at,
      raw_text = excluded.raw_text,
      lines_json = excluded.lines_json,
      total_usd = excluded.total_usd,
      points_awarded = excluded.points_awarded,
      badges_awarded_json = excluded.badges_awarded_json,
      image_meta_json = excluded.image_meta_json
  `,
  ).run({
    id: receipt.id,
    user_id: receipt.userId,
    store_id: receipt.storeId ?? null,
    store_name: receipt.storeName,
    zip: receipt.zip,
    purchased_at: receipt.purchasedAt,
    uploaded_at: receipt.uploadedAt,
    raw_text: receipt.rawText,
    lines_json: JSON.stringify(receipt.lines),
    total_usd: receipt.totalUsd,
    points_awarded: receipt.pointsAwarded,
    badges_awarded_json: JSON.stringify(receipt.badgesAwarded),
    image_meta_json: receipt.imageMeta
      ? JSON.stringify(receipt.imageMeta)
      : null,
  });
}

function persistObservation(obs: PriceObservation): void {
  const db = initAppDb();
  db.prepare(
    `
    INSERT INTO crowd_observations (
      id, store_id, store_name, zip, name, product_id, price_usd, quantity,
      observed_at, source, receipt_id, user_id
    ) VALUES (
      @id, @store_id, @store_name, @zip, @name, @product_id, @price_usd, @quantity,
      @observed_at, @source, @receipt_id, @user_id
    )
    ON CONFLICT(id) DO UPDATE SET
      store_id = excluded.store_id,
      store_name = excluded.store_name,
      zip = excluded.zip,
      name = excluded.name,
      product_id = excluded.product_id,
      price_usd = excluded.price_usd,
      quantity = excluded.quantity,
      observed_at = excluded.observed_at,
      source = excluded.source,
      receipt_id = excluded.receipt_id,
      user_id = excluded.user_id
  `,
  ).run({
    id: obs.id,
    store_id: obs.storeId,
    store_name: obs.storeName,
    zip: obs.zip,
    name: obs.name,
    product_id: obs.productId,
    price_usd: obs.priceUsd,
    quantity: obs.quantity,
    observed_at: obs.observedAt,
    source: obs.source,
    receipt_id: obs.receiptId,
    user_id: obs.userId,
  });
}

/** Parse pasted receipt text into lines. Supports "Name 3.49" and "Name · $3.49". */
export function parseReceiptText(rawText: string): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  for (const row of rawText.split(/\r?\n/)) {
    const text = row.trim();
    if (!text || /^(total|subtotal|tax|change|visa|mastercard|cash)\b/i.test(text)) {
      continue;
    }
    const match =
      text.match(/^(.*?)(?:\s+[·\-–—]\s+|\s+)\$?(\d+\.\d{2})\s*(?:x\s*(\d+))?$/i) ??
      text.match(/^(.*?)\s+\$?(\d+\.\d{2})$/);
    if (!match) continue;
    const name = match[1].replace(/\s+/g, " ").trim();
    const priceUsd = Number(match[2]);
    const quantity = match[3] ? Number(match[3]) : 1;
    if (!name || Number.isNaN(priceUsd)) continue;
    lines.push({
      id: randomUUID(),
      name,
      quantity: Math.max(1, quantity || 1),
      priceUsd,
      productId: slugProductId(name),
    });
  }
  return lines;
}

function resolveStoreId(storeName: string): string | undefined {
  const q = storeName.toLowerCase();
  const hit = SEED_STORES.find(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      q.includes(s.name.toLowerCase().split(" ")[0] ?? "") ||
      (s.chain && q.includes(s.chain.toLowerCase())),
  );
  if (hit) return hit.id;
  if (/fred\s*meyer/i.test(storeName)) return "kroger-70100053";
  if (/qfc/i.test(storeName)) return "qfc-70500803";
  if (/safeway/i.test(storeName)) return "safeway-covington";
  if (/albertsons/i.test(storeName)) return "albertsons-kent";
  if (/costco/i.test(storeName)) return "costco-kent";
  if (/kroger/i.test(storeName)) return "kroger-70100053";
  return undefined;
}

export function createReceipt(input: {
  userId: string;
  storeName: string;
  zip?: string;
  purchasedAt?: string;
  rawText: string;
  lines?: ReceiptLine[];
  imageMeta?: ReceiptImageMeta | null;
}): Receipt | { error: string } {
  const user = getUser(input.userId);
  if (!user) return { error: "Account required to upload receipts." };

  const imageMeta = input.imageMeta
    ? {
        name: input.imageMeta.name.trim().slice(0, 200) || "receipt.jpg",
        mimeType: input.imageMeta.mimeType.trim().slice(0, 120) || "image/*",
        sizeBytes: Math.max(0, Math.floor(input.imageMeta.sizeBytes || 0)),
        capturedAt: input.imageMeta.capturedAt || nowIso(),
      }
    : null;

  let rawText = (input.rawText || "").trim();
  if (imageMeta && !rawText) {
    // OCR follow-up: no auto extract yet — keep paste path for crowd prices.
    rawText = `[Photo attached: ${imageMeta.name} — OCR not available yet; paste priced lines to contribute crowd prices.]`;
  }

  const parsed = input.lines?.length ? input.lines : parseReceiptText(rawText);
  if (!parsed.length && !imageMeta) {
    return {
      error:
        "Could not read any priced lines. Try lines like “Whole milk 3.49” or “Eggs · 2.99”, or attach a receipt photo.",
    };
  }

  const storeName = input.storeName.trim() || "Unknown store";
  const storeId = resolveStoreId(storeName);
  const totalUsd =
    Math.round(parsed.reduce((s, l) => s + l.priceUsd * l.quantity, 0) * 100) /
    100;
  const userReceipts = listReceiptsForUser(user.id);
  const badgesAwarded: string[] = [];
  let points = imageMeta && !parsed.length ? 8 : 15 + parsed.length * 2;

  if (userReceipts.length === 0 && awardBadge(user, "first-receipt")) {
    badgesAwarded.push("first-receipt");
    points += 10;
  }
  if (userReceipts.length + 1 >= 3 && awardBadge(user, "aisle-archivist")) {
    badgesAwarded.push("aisle-archivist");
    points += 10;
  }

  const receipt: Receipt = {
    id: randomUUID(),
    userId: user.id,
    storeId,
    storeName,
    zip: input.zip?.trim() || user.zip || "98042",
    purchasedAt: input.purchasedAt || nowIso().slice(0, 10),
    uploadedAt: nowIso(),
    rawText,
    lines: parsed,
    totalUsd,
    pointsAwarded: points,
    badgesAwarded,
    imageMeta,
  };

  const observations: PriceObservation[] = [];
  for (const line of parsed) {
    observations.push({
      id: randomUUID(),
      storeId: storeId || `crowd-${slugProductId(storeName)}`,
      storeName,
      zip: receipt.zip,
      name: line.name,
      productId: line.productId || slugProductId(line.name),
      priceUsd: line.priceUsd,
      quantity: line.quantity,
      observedAt: receipt.purchasedAt,
      source: "receipt",
      receiptId: receipt.id,
      userId: user.id,
    });
  }

  const db = initAppDb();
  const priorCrowd = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM crowd_observations WHERE user_id = ?`)
      .get(user.id) as { n: number }
  ).n;
  const crowdCount = priorCrowd + observations.length;
  if (crowdCount >= 5 && awardBadge(user, "price-scout")) {
    badgesAwarded.push("price-scout");
    receipt.badgesAwarded = badgesAwarded;
    points += 10;
    receipt.pointsAwarded = points;
  }

  if (
    parsed.some((l) => /sale|coupon|\$?\d+\s*off/i.test(l.name)) &&
    awardBadge(user, "coupon-cryptid")
  ) {
    badgesAwarded.push("coupon-cryptid");
    receipt.badgesAwarded = badgesAwarded;
  }

  const tx = db.transaction(() => {
    persistReceipt(receipt);
    for (const obs of observations) persistObservation(obs);
  });
  tx();

  awardPoints(user, points);
  saveUser(user);
  return receipt;
}

export function listReceiptsForUser(userId: string): Receipt[] {
  const db = initAppDb();
  const rows = db
    .prepare(`SELECT * FROM receipts WHERE user_id = ? ORDER BY uploaded_at DESC`)
    .all(userId) as ReceiptRow[];
  return rows.map(rowToReceipt);
}

/** Remove receipts and crowd observations for a user (account deletion). */
export function deleteReceiptsForUser(userId: string): {
  receipts: number;
  crowdObservations: number;
} {
  const db = initAppDb();
  const crowdObservations = db
    .prepare(`DELETE FROM crowd_observations WHERE user_id = ?`)
    .run(userId).changes;
  const receipts = db.prepare(`DELETE FROM receipts WHERE user_id = ?`).run(userId).changes;
  return { receipts, crowdObservations };
}

export function spendingSummary(userId: string): {
  receiptCount: number;
  totalSpentUsd: number;
  byStore: Array<{ storeName: string; totalUsd: number; trips: number }>;
  recentLines: Array<{ name: string; priceUsd: number; storeName: string; purchasedAt: string }>;
} {
  const mine = listReceiptsForUser(userId);
  const byStoreMap = new Map<string, { totalUsd: number; trips: number }>();
  for (const receipt of mine) {
    const row = byStoreMap.get(receipt.storeName) ?? { totalUsd: 0, trips: 0 };
    row.totalUsd += receipt.totalUsd;
    row.trips += 1;
    byStoreMap.set(receipt.storeName, row);
  }
  const recentLines = mine.flatMap((r) =>
    r.lines.map((l) => ({
      name: l.name,
      priceUsd: l.priceUsd,
      storeName: r.storeName,
      purchasedAt: r.purchasedAt,
    })),
  );
  return {
    receiptCount: mine.length,
    totalSpentUsd: Math.round(mine.reduce((s, r) => s + r.totalUsd, 0) * 100) / 100,
    byStore: [...byStoreMap.entries()].map(([storeName, v]) => ({
      storeName,
      totalUsd: Math.round(v.totalUsd * 100) / 100,
      trips: v.trips,
    })),
    recentLines: recentLines.slice(0, 40),
  };
}

export function listCrowdObservations(zip?: string): PriceObservation[] {
  const db = initAppDb();
  let rows: ObsRow[];
  if (!zip) {
    rows = db.prepare(`SELECT * FROM crowd_observations`).all() as ObsRow[];
  } else {
    const prefix = zip.slice(0, 3);
    rows = db
      .prepare(
        `SELECT * FROM crowd_observations WHERE zip = ? OR substr(zip, 1, 3) = ?`,
      )
      .all(zip, prefix) as ObsRow[];
  }
  return rows.map(rowToObs);
}

export function latestCrowdOfferMap(zip: string) {
  const byKey = new Map<string, PriceObservation>();
  for (const obs of listCrowdObservations(zip)) {
    const key = `${obs.storeId}::${obs.productId}`;
    const prev = byKey.get(key);
    if (!prev || obs.observedAt >= prev.observedAt) byKey.set(key, obs);
  }
  return byKey;
}
