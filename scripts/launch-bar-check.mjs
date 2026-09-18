/**
 * Launch-bar check: typical 98042 list → recommended plan should be mostly live.
 * Requires Next on :3000 (`npm run start` or `npm run dev`).
 * Usage: node scripts/launch-bar-check.mjs
 */
const BASE = process.env.GROCER_BASE_URL ?? "http://127.0.0.1:3000";

async function main() {
  const createRes = await fetch(`${BASE}/api/lists`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Launch bar check",
      zip: "98042",
      items: [
        { query: "whole milk", quantity: 1 },
        { query: "eggs", quantity: 1 },
        { query: "bread", quantity: 1 },
        { query: "bananas", quantity: 1 },
        { query: "chicken breast", quantity: 1 },
      ],
    }),
  });
  if (!createRes.ok) {
    throw new Error(`create list ${createRes.status}: ${await createRes.text()}`);
  }
  const created = await createRes.json();
  const id = created.list?.id;
  if (!id) throw new Error("create list: missing list.id");

  const optRes = await fetch(`${BASE}/api/lists/${id}/optimize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ zip: "98042", savingsThresholdUsd: 5 }),
  });
  if (!optRes.ok) {
    throw new Error(`optimize ${optRes.status}: ${await optRes.text()}`);
  }
  const opt = await optRes.json();
  const plan = opt.plans?.[0];
  if (!plan) throw new Error(`no plans: ${opt.error ?? JSON.stringify(opt).slice(0, 200)}`);

  const lines = plan.lines ?? [];
  const live = lines.filter((l) => l.offer?.priceSource === "live").length;
  const ratio = lines.length ? live / lines.length : 0;
  console.log(`plan: ${plan.label ?? plan.id}`);
  console.log(`live lines: ${live}/${lines.length} (${(ratio * 100).toFixed(0)}%)`);
  console.log(
    `pool: ${opt.progress?.liveOfferCount ?? "?"} live offers / ${opt.progress?.liveStoreCount ?? "?"} stores`,
  );
  for (const l of lines) {
    console.log(`  ${l.offer?.priceSource}\t${l.storeId}\t${(l.offer?.name ?? "").slice(0, 48)}`);
  }

  // Launch bar: majority live on recommended plan for covered FM/QFC ZIP.
  if (ratio < 0.5) {
    console.error("FAIL: recommended plan is not mostly live.");
    process.exit(1);
  }
  console.log("PASS: launch bar (mostly live) met for this list.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
