/**
 * Warm the durable price cache: popular terms × Kroger banner locationIds.
 * Usage: npm run prices:refresh
 * Reads .env.local for Kroger credentials (same as kroger:probe).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { krogerBannerStores } from "../src/lib/area-stores";
import {
  closePriceDb,
  initPriceDb,
  priceDbStats,
  upsertLiveOffers,
} from "../src/lib/price-db";
import { PRODUCT_GENERIC_LABELS } from "../src/lib/product-generics";
import {
  krogerConfigured,
  resetKrogerCircuit,
  searchKrogerProductsBatch,
} from "../src/lib/kroger";

const ROOT = resolve(import.meta.dirname, "..");
const ENV_PATH = resolve(ROOT, ".env.local");

const EXTRA_TERMS = [
  "whole milk",
  "eggs",
  "bread",
  "bananas",
  "chicken breast",
  "rice",
  "coffee",
  "olive oil",
  "yogurt",
  "cheddar cheese",
  "ground beef",
  "paper towels",
  "butter",
  "apples",
  "pasta",
];

function loadEnvLocal() {
  if (!existsSync(ENV_PATH)) return;
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    if (!(key in process.env) || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

function popularTerms(): string[] {
  const fromGenerics = Object.values(PRODUCT_GENERIC_LABELS);
  return [...new Set([...fromGenerics, ...EXTRA_TERMS].map((t) => t.trim()).filter(Boolean))];
}

async function main() {
  loadEnvLocal();
  process.chdir(ROOT);

  if (!krogerConfigured()) {
    console.error("Missing KROGER_CLIENT_ID / KROGER_CLIENT_SECRET (set in .env.local)");
    process.exit(1);
  }

  initPriceDb();
  const terms = popularTerms();
  const locationIds = krogerBannerStores()
    .map((s) => s.krogerLocationId)
    .filter((id): id is string => Boolean(id));

  console.log(
    `prices:refresh — ${terms.length} terms × ${locationIds.length} locations (throttled)`,
  );

  resetKrogerCircuit();
  let written = 0;
  // Chunk terms so one Cert storm doesn't wipe the whole run.
  const chunkSize = 4;
  for (let i = 0; i < terms.length; i += chunkSize) {
    const chunk = terms.slice(i, i + chunkSize);
    const offers = await searchKrogerProductsBatch(chunk, locationIds, 4);
    if (!offers.length) {
      console.log(`  chunk ${i / chunkSize + 1}: 0 offers`);
      continue;
    }
    const queryByOfferId: Record<string, string> = {};
    for (const offer of offers) {
      const hay = `${offer.name} ${offer.brand ?? ""}`.toLowerCase();
      const hit =
        chunk.find((t) =>
          t
            .toLowerCase()
            .split(/\s+/)
            .every((w) => !w || hay.includes(w)),
        ) ?? chunk[0];
      if (hit) queryByOfferId[offer.id] = hit;
    }
    written += upsertLiveOffers(offers, { queryByOfferId });
    console.log(`  chunk ${i / chunkSize + 1}: +${offers.length} offers (total writes ${written})`);
  }

  const stats = priceDbStats();
  console.log("\nCache stats:");
  console.log(`  path: ${stats.path}`);
  console.log(`  products: ${stats.products}`);
  console.log(`  observations: ${stats.observations}`);
  console.log(`  price_latest: ${stats.latest}`);
  console.log(`  query_index: ${stats.queryIndex}`);
  console.log(`  oldest latest: ${stats.oldestLatestAt ?? "(empty)"}`);
  console.log(`  newest latest: ${stats.newestLatestAt ?? "(empty)"}`);
  closePriceDb();
}

main().catch((err) => {
  console.error(err);
  closePriceDb();
  process.exit(1);
});
