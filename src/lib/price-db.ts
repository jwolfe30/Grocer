/**
 * Durable price cache + append-only price history (SQLite).
 * Write-through from live Kroger fetches; read path serves optimize/suggest.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import Database from "better-sqlite3";
import type { Offer, OptimizeResult } from "./types";
import {
  basePrice,
  dealSignalFromHistory,
  type DealSignal,
} from "./pricing";

export type PriceObservationSource = "live" | "crowd" | "ad" | "modeled";

export interface PriceObservationInput {
  storeId: string;
  productKey: string;
  /** Original Offer.productId for remapping (e.g. kroger-…). */
  productId?: string | null;
  priceUsd: number;
  salePriceUsd?: number | null;
  onSale: boolean;
  source: PriceObservationSource;
  observedAt?: string;
  queryTerm?: string | null;
  upc?: string | null;
  name: string;
  brand?: string | null;
  category?: string | null;
  sizeLabel?: string | null;
  unitAmount?: number | null;
  unitName?: string | null;
}

export interface PriceHistoryPoint {
  priceUsd: number;
  salePriceUsd: number | null;
  onSale: boolean;
  source: string;
  observedAt: string;
}

type SqliteDb = Database.Database;

interface PriceStmts {
  upsertProduct: Database.Statement;
  insertObs: Database.Statement;
  upsertLatest: Database.Statement;
  upsertQuery: Database.Statement;
}

let dbSingleton: SqliteDb | null = null;
let stmts: PriceStmts | null = null;

function getStmts(db: SqliteDb): PriceStmts {
  if (stmts) return stmts;
  stmts = {
    upsertProduct: db.prepare(`
      INSERT INTO products (
        product_key, upc, product_id, name, brand, category, size_label, unit_amount, unit_name, updated_at
      ) VALUES (
        @product_key, @upc, @product_id, @name, @brand, @category, @size_label, @unit_amount, @unit_name, @updated_at
      )
      ON CONFLICT(product_key) DO UPDATE SET
        upc = COALESCE(excluded.upc, products.upc),
        product_id = COALESCE(excluded.product_id, products.product_id),
        name = excluded.name,
        brand = COALESCE(excluded.brand, products.brand),
        category = COALESCE(excluded.category, products.category),
        size_label = COALESCE(excluded.size_label, products.size_label),
        unit_amount = COALESCE(excluded.unit_amount, products.unit_amount),
        unit_name = COALESCE(excluded.unit_name, products.unit_name),
        updated_at = excluded.updated_at
    `),
    insertObs: db.prepare(`
      INSERT INTO price_observations (
        store_id, product_key, price_usd, sale_price_usd, on_sale, source, observed_at, query_term
      ) VALUES (
        @store_id, @product_key, @price_usd, @sale_price_usd, @on_sale, @source, @observed_at, @query_term
      )
    `),
    upsertLatest: db.prepare(`
      INSERT INTO price_latest (
        store_id, product_key, price_usd, sale_price_usd, on_sale, source, observed_at,
        name, brand, size_label, category, unit_amount, unit_name, upc, product_id
      ) VALUES (
        @store_id, @product_key, @price_usd, @sale_price_usd, @on_sale, @source, @observed_at,
        @name, @brand, @size_label, @category, @unit_amount, @unit_name, @upc, @product_id
      )
      ON CONFLICT(store_id, product_key) DO UPDATE SET
        price_usd = excluded.price_usd,
        sale_price_usd = excluded.sale_price_usd,
        on_sale = excluded.on_sale,
        source = excluded.source,
        observed_at = excluded.observed_at,
        name = excluded.name,
        brand = COALESCE(excluded.brand, price_latest.brand),
        size_label = COALESCE(excluded.size_label, price_latest.size_label),
        category = COALESCE(excluded.category, price_latest.category),
        unit_amount = COALESCE(excluded.unit_amount, price_latest.unit_amount),
        unit_name = COALESCE(excluded.unit_name, price_latest.unit_name),
        upc = COALESCE(excluded.upc, price_latest.upc),
        product_id = COALESCE(excluded.product_id, price_latest.product_id)
    `),
    upsertQuery: db.prepare(`
      INSERT OR IGNORE INTO query_index (store_id, normalized_query, product_key)
      VALUES (@store_id, @normalized_query, @product_key)
    `),
  };
  return stmts;
}

function defaultDbPath(): string {
  const fromEnv = process.env.PRICE_CACHE_PATH?.trim();
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : join(process.cwd(), fromEnv);
  }
  return join(process.cwd(), "data", "prices.sqlite");
}

export function priceCacheMaxAgeHours(): number {
  const raw = process.env.PRICE_CACHE_MAX_AGE_HOURS;
  const n = raw != null && raw !== "" ? Number(raw) : 24;
  return Number.isFinite(n) && n > 0 ? n : 24;
}

export function priceCacheOnly(): boolean {
  return process.env.PRICE_CACHE_ONLY === "1";
}

export function normalizeQuery(term: string): string {
  return term.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Prefer UPC; else kroger:{id}; else stable hash of store-agnostic productId. */
export function productKeyForOffer(offer: Pick<Offer, "upc" | "productId">): string {
  const upc = offer.upc?.trim();
  if (upc) return upc;
  const pid = offer.productId.trim();
  if (pid.startsWith("kroger-")) return `kroger:${pid.slice("kroger-".length)}`;
  if (pid.startsWith("kroger:")) return pid;
  return `id:${createHash("sha1").update(pid).digest("hex").slice(0, 16)}`;
}

function productIdFromKey(productKey: string): string {
  if (productKey.startsWith("kroger:")) {
    return `kroger-${productKey.slice("kroger:".length)}`;
  }
  if (productKey.startsWith("id:")) return productKey;
  // UPC-as-key — Offer still needs a productId
  return `upc-${productKey}`;
}

function ensureSchema(db: SqliteDb) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      product_key TEXT PRIMARY KEY,
      upc TEXT,
      product_id TEXT,
      name TEXT NOT NULL,
      brand TEXT,
      category TEXT,
      size_label TEXT,
      unit_amount REAL,
      unit_name TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL,
      product_key TEXT NOT NULL,
      price_usd REAL NOT NULL,
      sale_price_usd REAL,
      on_sale INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      query_term TEXT,
      FOREIGN KEY (product_key) REFERENCES products(product_key)
    );

    CREATE INDEX IF NOT EXISTS idx_obs_store_product_time
      ON price_observations (store_id, product_key, observed_at);

    CREATE TABLE IF NOT EXISTS price_latest (
      store_id TEXT NOT NULL,
      product_key TEXT NOT NULL,
      price_usd REAL NOT NULL,
      sale_price_usd REAL,
      on_sale INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      name TEXT NOT NULL,
      brand TEXT,
      size_label TEXT,
      category TEXT,
      unit_amount REAL,
      unit_name TEXT,
      upc TEXT,
      product_id TEXT,
      PRIMARY KEY (store_id, product_key)
    );

    CREATE INDEX IF NOT EXISTS idx_latest_observed
      ON price_latest (observed_at);
    CREATE INDEX IF NOT EXISTS idx_latest_store_observed
      ON price_latest (store_id, observed_at);

    CREATE TABLE IF NOT EXISTS query_index (
      store_id TEXT NOT NULL,
      normalized_query TEXT NOT NULL,
      product_key TEXT NOT NULL,
      PRIMARY KEY (store_id, normalized_query, product_key)
    );

    CREATE INDEX IF NOT EXISTS idx_query_store_term
      ON query_index (store_id, normalized_query);
  `);

  const productCols = db.prepare(`PRAGMA table_info(products)`).all() as Array<{ name: string }>;
  if (!productCols.some((c) => c.name === "product_id")) {
    db.exec(`ALTER TABLE products ADD COLUMN product_id TEXT`);
  }
  const latestCols = db.prepare(`PRAGMA table_info(price_latest)`).all() as Array<{ name: string }>;
  if (!latestCols.some((c) => c.name === "product_id")) {
    db.exec(`ALTER TABLE price_latest ADD COLUMN product_id TEXT`);
  }
}

export function initPriceDb(path = defaultDbPath()): SqliteDb {
  if (dbSingleton) return dbSingleton;
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);
  dbSingleton = db;
  return db;
}

/** Close singleton (tests / scripts). */
export function closePriceDb() {
  if (dbSingleton) {
    dbSingleton.close();
    dbSingleton = null;
    stmts = null;
  }
}

function rowToOffer(row: {
  store_id: string;
  product_key: string;
  price_usd: number;
  sale_price_usd: number | null;
  on_sale: number;
  source: string;
  observed_at: string;
  name: string;
  brand: string | null;
  size_label: string | null;
  category: string | null;
  unit_amount: number | null;
  unit_name: string | null;
  upc: string | null;
  product_id: string | null;
}): Offer {
  const unitName = (row.unit_name ?? "each") as Offer["unitName"];
  const safeUnit: Offer["unitName"] = ["oz", "lb", "ct", "gal", "each"].includes(
    unitName,
  )
    ? unitName
    : "each";
  const onSale = Boolean(row.on_sale);
  return {
    id: `${row.store_id}-${row.product_key}`,
    storeId: row.store_id,
    productId: row.product_id || productIdFromKey(row.product_key),
    name: row.name,
    brand: row.brand ?? undefined,
    category: row.category ?? "grocery",
    sizeLabel: row.size_label ?? "each",
    priceUsd: row.price_usd,
    unitAmount: row.unit_amount ?? 1,
    unitName: safeUnit,
    upc: row.upc ?? (row.product_key.match(/^\d+$/) ? row.product_key : undefined),
    isLocal: false,
    onSale,
    salePriceUsd: onSale && row.sale_price_usd != null ? row.sale_price_usd : undefined,
    couponIds: [],
    // Cached live Kroger prices still surface as "live" for UI precedence.
    priceSource: "live",
    asOf: row.observed_at,
  };
}

function cutoffIso(maxAgeHours: number): string {
  return new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
}

function writeObservation(db: SqliteDb, input: PriceObservationInput): void {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const onSale = input.onSale ? 1 : 0;
  const upc = input.upc?.trim() || null;
  const s = getStmts(db);

  s.upsertProduct.run({
    product_key: input.productKey,
    upc,
    product_id: input.productId ?? null,
    name: input.name,
    brand: input.brand ?? null,
    category: input.category ?? null,
    size_label: input.sizeLabel ?? null,
    unit_amount: input.unitAmount ?? null,
    unit_name: input.unitName ?? null,
    updated_at: observedAt,
  });

  s.insertObs.run({
    store_id: input.storeId,
    product_key: input.productKey,
    price_usd: input.priceUsd,
    sale_price_usd: input.salePriceUsd ?? null,
    on_sale: onSale,
    source: input.source,
    observed_at: observedAt,
    query_term: input.queryTerm ?? null,
  });

  s.upsertLatest.run({
    store_id: input.storeId,
    product_key: input.productKey,
    price_usd: input.priceUsd,
    sale_price_usd: input.salePriceUsd ?? null,
    on_sale: onSale,
    source: input.source,
    observed_at: observedAt,
    name: input.name,
    brand: input.brand ?? null,
    size_label: input.sizeLabel ?? null,
    category: input.category ?? null,
    unit_amount: input.unitAmount ?? null,
    unit_name: input.unitName ?? null,
    upc,
    product_id: input.productId ?? null,
  });

  const q = input.queryTerm ? normalizeQuery(input.queryTerm) : "";
  if (q) {
    s.upsertQuery.run({
      store_id: input.storeId,
      normalized_query: q,
      product_key: input.productKey,
    });
  }
}

export function recordObservation(input: PriceObservationInput): void {
  const db = initPriceDb();
  const tx = db.transaction(() => writeObservation(db, input));
  tx();
}

export function upsertLiveOffers(
  offers: Offer[],
  meta?: { queryTerm?: string; queryByOfferId?: Record<string, string> },
): number {
  if (!offers.length) return 0;
  const db = initPriceDb();
  const tx = db.transaction(() => {
    for (const offer of offers) {
      const queryTerm =
        meta?.queryByOfferId?.[offer.id] ?? meta?.queryTerm ?? null;
      writeObservation(db, {
        storeId: offer.storeId,
        productKey: productKeyForOffer(offer),
        productId: offer.productId,
        priceUsd: offer.priceUsd,
        salePriceUsd: offer.salePriceUsd ?? null,
        onSale: offer.onSale,
        source: "live",
        observedAt: offer.asOf ?? new Date().toISOString(),
        queryTerm,
        upc: offer.upc ?? null,
        name: offer.name,
        brand: offer.brand ?? null,
        category: offer.category ?? null,
        sizeLabel: offer.sizeLabel ?? null,
        unitAmount: offer.unitAmount ?? null,
        unitName: offer.unitName ?? null,
      });
    }
  });
  tx();
  return offers.length;
}

export function getLatestOffersForStores(
  storeIds: string[],
  maxAgeHours = priceCacheMaxAgeHours(),
): Offer[] {
  if (!storeIds.length) return [];
  const db = initPriceDb();
  const cutoff = cutoffIso(maxAgeHours);
  const placeholders = storeIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
      SELECT store_id, product_key, price_usd, sale_price_usd, on_sale, source,
             observed_at, name, brand, size_label, category, unit_amount, unit_name, upc, product_id
      FROM price_latest
      WHERE store_id IN (${placeholders})
        AND observed_at >= ?
        AND source = 'live'
    `,
    )
    .all(...storeIds, cutoff) as Array<Parameters<typeof rowToOffer>[0]>;
  return rows.map(rowToOffer);
}

/** Fresh offers previously indexed under these list/search terms. */
export function getCachedOffersForQueries(
  queries: string[],
  storeIds: string[],
  maxAgeHours = priceCacheMaxAgeHours(),
): { offers: Offer[]; coveredTerms: string[] } {
  if (!queries.length || !storeIds.length) {
    return { offers: [], coveredTerms: [] };
  }
  const db = initPriceDb();
  const cutoff = cutoffIso(maxAgeHours);
  const norms = [...new Set(queries.map(normalizeQuery).filter(Boolean))];
  const storePh = storeIds.map(() => "?").join(",");
  const queryPh = norms.map(() => "?").join(",");

  const rows = db
    .prepare(
      `
      SELECT DISTINCT
        pl.store_id, pl.product_key, pl.price_usd, pl.sale_price_usd, pl.on_sale, pl.source,
        pl.observed_at, pl.name, pl.brand, pl.size_label, pl.category, pl.unit_amount,
        pl.unit_name, pl.upc, pl.product_id, qi.normalized_query
      FROM query_index qi
      JOIN price_latest pl
        ON pl.store_id = qi.store_id AND pl.product_key = qi.product_key
      WHERE qi.store_id IN (${storePh})
        AND qi.normalized_query IN (${queryPh})
        AND pl.observed_at >= ?
        AND pl.source = 'live'
    `,
    )
    .all(...storeIds, ...norms, cutoff) as Array<
    Parameters<typeof rowToOffer>[0] & { normalized_query: string }
  >;

  const covered = new Set<string>();
  const offers: Offer[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    covered.add(row.normalized_query);
    const key = `${row.store_id}|${row.product_key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    offers.push(rowToOffer(row));
  }

  return { offers, coveredTerms: [...covered] };
}

/** Terms that already have at least one fresh cached hit for the store set. */
export function termsCoveredByCache(
  queries: string[],
  storeIds: string[],
  maxAgeHours = priceCacheMaxAgeHours(),
): Set<string> {
  const { coveredTerms } = getCachedOffersForQueries(queries, storeIds, maxAgeHours);
  return new Set(coveredTerms);
}

/**
 * Reads append-only observations for deal surfacing (cheaper vs 30-day median).
 */
export function getPriceHistory(
  storeId: string,
  productKey: string,
  days = 30,
): PriceHistoryPoint[] {
  const db = initPriceDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = db
    .prepare(
      `
      SELECT price_usd, sale_price_usd, on_sale, source, observed_at
      FROM price_observations
      WHERE store_id = ? AND product_key = ? AND observed_at >= ?
      ORDER BY observed_at ASC
    `,
    )
    .all(storeId, productKey, since) as Array<{
    price_usd: number;
    sale_price_usd: number | null;
    on_sale: number;
    source: string;
    observed_at: string;
  }>;

  return rows.map((r) => ({
    priceUsd: r.price_usd,
    salePriceUsd: r.sale_price_usd,
    onSale: Boolean(r.on_sale),
    source: r.source,
    observedAt: r.observed_at,
  }));
}

/**
 * Deal badge for live/cache offers when current price is meaningfully
 * below the 30-day median. Insufficient history → null (no badge).
 */
export function getDealSignalForOffer(
  offer: Pick<
    Offer,
    | "storeId"
    | "upc"
    | "productId"
    | "priceUsd"
    | "salePriceUsd"
    | "onSale"
    | "priceSource"
  >,
): DealSignal | null {
  if (offer.priceSource !== "live") return null;
  const history = getPriceHistory(
    offer.storeId,
    productKeyForOffer(offer),
    30,
  );
  return dealSignalFromHistory(basePrice(offer), history);
}

function annotateOfferDeal(offer: Offer, cache: Map<string, DealSignal | null>): Offer {
  if (offer.dealSignal) return offer;
  if (offer.priceSource !== "live") return offer;
  const key = `${offer.storeId}|${productKeyForOffer(offer)}|${basePrice(offer)}`;
  let signal = cache.get(key);
  if (signal === undefined) {
    signal = getDealSignalForOffer(offer);
    cache.set(key, signal);
  }
  if (!signal) return offer;
  return { ...offer, dealSignal: signal };
}

/** Attach dealSignal onto live offers in an optimize result (in-place-safe copy). */
export function annotateOptimizeDeals(result: OptimizeResult): OptimizeResult {
  const cache = new Map<string, DealSignal | null>();
  return {
    ...result,
    matches: result.matches.map((item) => ({
      ...item,
      matches: item.matches.map((m) => ({
        ...m,
        offer: annotateOfferDeal(m.offer, cache),
      })),
    })),
    plans: result.plans.map((plan) => ({
      ...plan,
      lines: plan.lines.map((line) => ({
        ...line,
        offer: annotateOfferDeal(line.offer, cache),
        recommendedReplacement: line.recommendedReplacement
          ? {
              ...line.recommendedReplacement,
              offer: annotateOfferDeal(line.recommendedReplacement.offer, cache),
            }
          : undefined,
      })),
    })),
  };
}

export function priceDbStats(): {
  products: number;
  observations: number;
  latest: number;
  queryIndex: number;
  path: string;
  /** Oldest `observed_at` among `price_latest` rows (ISO), or null if empty. */
  oldestLatestAt: string | null;
  /** Newest `observed_at` among `price_latest` rows (ISO), or null if empty. */
  newestLatestAt: string | null;
  /** Hours since newest latest row; null if empty or unparseable. */
  newestAgeHours: number | null;
} {
  const path = defaultDbPath();
  const db = initPriceDb(path);
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  const bounds = db
    .prepare(
      `SELECT MIN(observed_at) AS oldest, MAX(observed_at) AS newest FROM price_latest`,
    )
    .get() as { oldest: string | null; newest: string | null };
  const oldestLatestAt = bounds.oldest ?? null;
  const newestLatestAt = bounds.newest ?? null;
  let newestAgeHours: number | null = null;
  if (newestLatestAt) {
    const ms = Date.now() - Date.parse(newestLatestAt);
    if (Number.isFinite(ms)) newestAgeHours = Math.max(0, ms / 3_600_000);
  }
  return {
    products: count("products"),
    observations: count("price_observations"),
    latest: count("price_latest"),
    queryIndex: count("query_index"),
    path,
    oldestLatestAt,
    newestLatestAt,
    newestAgeHours,
  };
}
