/**
 * Print durable price cache row counts + freshness.
 * Usage:
 *   npm run prices:stats
 *   npm run prices:refresh:check   # exit 1 if empty or older than PRICE_CACHE_MAX_AGE_HOURS
 */

import { resolve } from "node:path";
import {
  closePriceDb,
  initPriceDb,
  priceCacheMaxAgeHours,
  priceDbStats,
} from "../src/lib/price-db";

const ROOT = resolve(import.meta.dirname, "..");
const checkMode = process.argv.includes("--check");

function formatAgeHours(h: number | null): string {
  if (h == null) return "n/a";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

function main() {
  process.chdir(ROOT);
  initPriceDb();
  const stats = priceDbStats();
  const maxAge = priceCacheMaxAgeHours();

  console.log("Price cache stats");
  console.log(`  path:            ${stats.path}`);
  console.log(`  products:        ${stats.products}`);
  console.log(`  observations:    ${stats.observations}`);
  console.log(`  price_latest:    ${stats.latest}`);
  console.log(`  query_index:     ${stats.queryIndex}`);
  console.log(`  oldest latest:   ${stats.oldestLatestAt ?? "(empty)"}`);
  console.log(`  newest latest:   ${stats.newestLatestAt ?? "(empty)"}`);
  console.log(`  newest age:      ${formatAgeHours(stats.newestAgeHours)}`);
  console.log(`  max age (env):   ${maxAge}h`);

  if (checkMode) {
    if (!stats.newestLatestAt || stats.newestAgeHours == null) {
      console.error("\nprices:refresh:check FAILED — no price_latest rows");
      closePriceDb();
      process.exit(1);
    }
    if (stats.newestAgeHours > maxAge) {
      console.error(
        `\nprices:refresh:check FAILED — newest row is ${formatAgeHours(stats.newestAgeHours)} old (limit ${maxAge}h)`,
      );
      closePriceDb();
      process.exit(1);
    }
    console.log("\nprices:refresh:check OK — cache is within max age");
  }

  closePriceDb();
}

main();
