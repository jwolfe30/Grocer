#!/usr/bin/env node
/**
 * Lightweight API/UI smoke for local Grocer.
 * Usage: npm run qa:smoke   (expects dev server on BASE_URL, default http://localhost:3000)
 */

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}: ${err.message || err}`);
    process.exitCode = 1;
  }
}

async function json(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function main() {
  console.log(`Grocer QA smoke @ ${BASE}\n`);

  await check("GET /", async () => {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const html = await res.text();
    if (!/Grocer/i.test(html)) throw new Error("homepage missing Grocer brand");
  });

  await check("GET /api/stores?zip=98042", async () => {
    const data = await json("/api/stores?zip=98042");
    const stores = data.stores ?? [];
    if (stores.length < 10) {
      throw new Error(`expected ≥10 stores, got ${stores.length}`);
    }
    const names = stores.map((s) => s.name).join(", ");
    console.log(`      ${stores.length} stores: ${names.slice(0, 120)}…`);
  });

  await check("GET /api/kroger/status", async () => {
    const data = await json("/api/kroger/status");
    if (typeof data.configured !== "boolean") throw new Error("missing configured");
  });

  await check("GET /api/suggest?q=milk&zip=98042", async () => {
    const data = await json(
      "/api/suggest?q=milk&zip=98042&preferLocal=1&preferOrganic=0&preferKosher=0",
    );
    const suggestions = data.suggestions ?? data.offers ?? [];
    if (!Array.isArray(suggestions) && !data.catalog) {
      // suggest route shape: { suggestions: [...] }
      if (!data.suggestions?.length && !data.offers?.length) {
        // still ok if empty array — just ensure JSON
        if (!("suggestions" in data) && !("offers" in data)) {
          throw new Error(`unexpected suggest shape: ${Object.keys(data).join(",")}`);
        }
      }
    }
  });

  if (process.exitCode) {
    console.log("\nSmoke failed. See docs/QA.md");
    process.exit(process.exitCode);
  }
  console.log("\nSmoke passed. Continue with manual UI checklist in docs/QA.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
