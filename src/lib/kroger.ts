import type { Offer, Store } from "./types";

const TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token";
const API_BASE = "https://api.kroger.com/v1";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

export function krogerConfigured(): boolean {
  return Boolean(process.env.KROGER_CLIENT_ID && process.env.KROGER_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string | null> {
  if (!krogerConfigured()) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.accessToken;
  }

  const id = process.env.KROGER_CLIENT_ID!;
  const secret = process.env.KROGER_CLIENT_SECRET!;
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=product.compact",
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("Kroger token error", res.status, await res.text());
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
  return tokenCache.accessToken;
}

async function krogerFetch(path: string): Promise<unknown | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("Kroger API error", path, res.status, await res.text());
    return null;
  }
  return res.json();
}

export async function resolveKrogerLocationId(zip: string): Promise<string | null> {
  if (process.env.KROGER_LOCATION_ID) return process.env.KROGER_LOCATION_ID;
  const data = (await krogerFetch(
    `/locations?filter.zipCode.near=${encodeURIComponent(zip)}&filter.limit=1`,
  )) as { data?: Array<{ locationId: string }> } | null;
  return data?.data?.[0]?.locationId ?? null;
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
    id: `kroger-live-${product.productId}`,
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
  };
}

export async function fetchKrogerStore(zip: string): Promise<Store | null> {
  if (!krogerConfigured()) return null;
  const locationId = await resolveKrogerLocationId(zip);
  if (!locationId) return null;

  const data = (await krogerFetch(`/locations/${locationId}`)) as {
    data?: {
      locationId: string;
      name?: string;
      chain?: string;
      address?: {
        addressLine1?: string;
        city?: string;
        state?: string;
        zipCode?: string;
      };
      geolocation?: { latitude?: number; longitude?: number };
    };
  } | null;

  const loc = data?.data;
  if (!loc) {
    return {
      id: "kroger-live",
      name: "Kroger",
      chain: "Kroger",
      address: "Nearby Kroger",
      zip,
      lat: 0,
      lng: 0,
      source: "kroger",
    };
  }

  return {
    id: "kroger-live",
    name: loc.name ?? loc.chain ?? "Kroger",
    chain: loc.chain,
    address: [loc.address?.addressLine1, loc.address?.city, loc.address?.state]
      .filter(Boolean)
      .join(", "),
    zip: loc.address?.zipCode ?? zip,
    lat: loc.geolocation?.latitude ?? 0,
    lng: loc.geolocation?.longitude ?? 0,
    source: "kroger",
  };
}

export async function searchKrogerProducts(
  term: string,
  zip: string,
  limit = 8,
): Promise<Offer[]> {
  if (!krogerConfigured() || !term.trim()) return [];
  const locationId = await resolveKrogerLocationId(zip);
  if (!locationId) return [];

  const data = (await krogerFetch(
    `/products?filter.term=${encodeURIComponent(term)}&filter.locationId=${encodeURIComponent(locationId)}&filter.limit=${limit}`,
  )) as { data?: KrogerProduct[] } | null;

  return (data?.data ?? [])
    .map((p) => mapProduct(p, "kroger-live"))
    .filter((o): o is Offer => o != null);
}
