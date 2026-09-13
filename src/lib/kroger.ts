/**
 * Kroger integration uses Products only.
 * Store metadata + locationIds are hardcoded in area-stores.ts — no Locations API calls.
 *
 * Token shape verified by `npm run kroger:probe` (minimal headers + form body on api-ce).
 */

import { krogerBannerStores, storeIdForLocationId } from "./area-stores";
import type { Offer, Store } from "./types";

/** Certification apps use api-ce; production apps use api.kroger.com. */
const KROGER_HOST =
  process.env.KROGER_API_BASE?.replace(/\/$/, "") ||
  (process.env.KROGER_ENV === "production"
    ? "https://api.kroger.com/v1"
    : "https://api-ce.kroger.com/v1");

const TOKEN_URL = `${KROGER_HOST}/connect/oauth2/token`;
const API_BASE = KROGER_HOST;

/** Avoid wedging Next when the edge hangs or returns Akamai HTML. */
const FETCH_TIMEOUT_MS = 5_000;
/** Short cool-down — Cert often 503s under burst; don't lock out for 5 minutes. */
const CIRCUIT_OPEN_MS = 45_000;
const PRODUCT_CONCURRENCY = 3;

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;
/** Single-flight so parallel product searches don't stampede the token endpoint. */
let tokenInFlight: Promise<string | null> | null = null;
let circuitOpenUntil = 0;
let consecutiveFailures = 0;
let lastLiveAt: number | null = null;
let lastError: string | null = null;

export function krogerConfigured(): boolean {
  return Boolean(process.env.KROGER_CLIENT_ID && process.env.KROGER_CLIENT_SECRET);
}

export function krogerLiveStatus(): {
  configured: boolean;
  env: "certification" | "production";
  circuitOpen: boolean;
  lastLiveAt: number | null;
  lastError: string | null;
} {
  return {
    configured: krogerConfigured(),
    env: process.env.KROGER_ENV === "production" ? "production" : "certification",
    circuitOpen: Date.now() < circuitOpenUntil,
    lastLiveAt,
    lastError,
  };
}

function circuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

function noteSuccess() {
  consecutiveFailures = 0;
  lastLiveAt = Date.now();
  lastError = null;
}

function noteFailure(reason: string) {
  consecutiveFailures += 1;
  lastError = reason;
  // Need several failures before opening — a couple of 503s under load are normal.
  const threshold = /503|timeout/i.test(reason) ? 5 : 2;
  if (consecutiveFailures >= threshold) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
    consecutiveFailures = 0;
    console.warn(
      `Kroger API circuit open for ${CIRCUIT_OPEN_MS / 1000}s after repeated failures (${reason})`,
    );
  }
}

/** Run async work with a fixed concurrency limit. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function getAccessToken(): Promise<string | null> {
  if (!krogerConfigured() || circuitOpen()) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.accessToken;
  }
  if (tokenInFlight) return tokenInFlight;

  tokenInFlight = (async () => {
    const id = process.env.KROGER_CLIENT_ID!;
    const secret = process.env.KROGER_CLIENT_SECRET!;
    const basic = Buffer.from(`${id}:${secret}`).toString("base64");
    // Probe-verified: minimal headers + form body (custom UA previously correlated with Akamai 403s).
    const body = "grant_type=client_credentials&scope=product.compact";

    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        const text = (await res.text()).slice(0, 200);
        console.error("Kroger token error", res.status, text);
        noteFailure(`token ${res.status}`);
        return null;
      }

      const data = (await res.json()) as {
        access_token: string;
        expires_in: number;
      };

      tokenCache = {
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };
      noteSuccess();
      return tokenCache.accessToken;
    } catch (err) {
      console.error("Kroger token fetch failed", err);
      noteFailure("token timeout/network");
      return null;
    } finally {
      tokenInFlight = null;
    }
  })();

  return tokenInFlight;
}

async function krogerFetch(path: string): Promise<unknown | null> {
  if (circuitOpen()) return null;
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("Kroger API error", path, res.status, text.slice(0, 300));
      // Cert Products often returns transient 503s under parallel load — don't open the circuit.
      if (res.status !== 503 && res.status !== 429) {
        noteFailure(`api ${res.status}`);
      }
      return null;
    }
    noteSuccess();
    return res.json();
  } catch (err) {
    console.error("Kroger API fetch failed", path, err);
    noteFailure("api timeout/network");
    return null;
  }
}

/** Static roster from area-stores — never hits Locations API. */
export function listKrogerBannerStores(): Store[] {
  return krogerBannerStores().map((s) => ({
    ...s,
    source: krogerConfigured() ? ("kroger" as const) : s.source,
  }));
}

/** Prefer env override, else Covington, else first banner store. */
export function primaryKrogerLocationId(): string {
  return (
    process.env.KROGER_LOCATION_ID ||
    krogerBannerStores().find((s) => s.zip === "98042")?.krogerLocationId ||
    krogerBannerStores()[0]?.krogerLocationId ||
    "70100053"
  );
}

interface KrogerProduct {
  productId: string;
  upc?: string;
  brand?: string;
  description?: string;
  categories?: string[];
  items?: Array<{
    price?: { regular?: number; promo?: number };
    size?: string;
    preferred?: boolean;
  }>;
}

function mapProduct(product: KrogerProduct, storeId: string): Offer | null {
  const item = product.items?.find((i) => i.preferred) ?? product.items?.[0];
  const regular = item?.price?.regular;
  if (regular == null) return null;
  const promo = item?.price?.promo;
  const onSale = promo != null && promo > 0 && promo < regular;

  return {
    id: `${storeId}-${product.productId}`,
    storeId,
    productId: `kroger-${product.productId}`,
    name: product.description ?? "Kroger item",
    brand: product.brand,
    category: product.categories?.[0]?.toLowerCase() ?? "grocery",
    sizeLabel: item?.size ?? "each",
    priceUsd: regular,
    unitAmount: 1,
    unitName: "each",
    upc: product.upc,
    isLocal: false,
    onSale,
    salePriceUsd: onSale ? promo : undefined,
    couponIds: [],
    priceSource: "live",
    asOf: new Date().toISOString(),
  };
}

/** Products API only — pass a known locationId from area-stores. */
export async function searchKrogerProductsAtLocation(
  term: string,
  locationId: string,
  limit = 8,
): Promise<Offer[]> {
  if (!krogerConfigured() || circuitOpen() || !term.trim()) return [];
  const storeId =
    storeIdForLocationId(locationId) ?? `kroger-${locationId}`;

  const data = (await krogerFetch(
    `/products?filter.term=${encodeURIComponent(term)}&filter.locationId=${encodeURIComponent(locationId)}&filter.limit=${limit}`,
  )) as { data?: KrogerProduct[] } | null;

  return (data?.data ?? [])
    .map((p) => mapProduct(p, storeId))
    .filter((o): o is Offer => o != null);
}

/** Search one or more known banner locationIds (throttled). */
export async function searchKrogerProducts(
  term: string,
  locationIds?: string[],
  limit = 5,
): Promise<Offer[]> {
  if (!krogerConfigured() || circuitOpen()) return [];
  const ids =
    locationIds?.length
      ? locationIds
      : [primaryKrogerLocationId()];
  const batches = await mapPool(ids, PRODUCT_CONCURRENCY, (id) =>
    searchKrogerProductsAtLocation(term, id, limit),
  );
  return batches.flat();
}

/** Many terms × many locations — one shared pool so optimize doesn't stampede Cert. */
export async function searchKrogerProductsBatch(
  terms: string[],
  locationIds: string[],
  limit = 4,
): Promise<Offer[]> {
  if (!krogerConfigured() || circuitOpen() || !terms.length || !locationIds.length) {
    return [];
  }
  const jobs = terms.flatMap((term) =>
    locationIds.map((locationId) => ({ term, locationId })),
  );
  const batches = await mapPool(jobs, PRODUCT_CONCURRENCY, (job) =>
    searchKrogerProductsAtLocation(job.term, job.locationId, limit),
  );
  return batches.flat();
}

/** Clear a stuck open circuit (e.g. after cool-down or manual retry). */
export function resetKrogerCircuit() {
  circuitOpenUntil = 0;
  consecutiveFailures = 0;
}
