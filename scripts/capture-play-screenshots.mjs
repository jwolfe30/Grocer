/**
 * Capture Play Store phone screenshots against local Next.js (Capacitor WebView UI).
 * Usage: node scripts/capture-play-screenshots.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.GROCER_URL ?? "http://127.0.0.1:3000";
const OUT = path.resolve("docs/play-screenshots");
const OPTIMIZE_TIMEOUT_MS = 180_000;

fs.mkdirSync(OUT, { recursive: true });

function shotPath(name) {
  return path.join(OUT, name);
}

async function settle(page, ms = 500) {
  await page.waitForTimeout(ms);
}

/** Frame element near the top of the viewport (Play Store phone crop). */
async function frameAtTop(page, locator, offset = 8) {
  const handle = await locator.elementHandle();
  if (!handle) return;
  await page.evaluate(
    ({ el, offset }) => {
      const y = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo(0, Math.max(0, y));
    },
    { el: handle, offset },
  );
  await settle(page, 350);
}

async function hideDevChrome(page) {
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-next-badge-root],
      [data-nextjs-toast],
      #__next-build-watcher,
      button[aria-label="Open Next.js Dev Tools"],
      [data-nextjs-dev-tools-button] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `,
  });
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal, [data-next-badge-root]").forEach((n) => n.remove());
  });
}

async function ensureZip(page) {
  const zipLabel = page.getByText(/ZIP for nearby stores/i);
  await zipLabel.waitFor({ timeout: 30_000 });
  const input = page.locator("header label").filter({ hasText: /ZIP/i }).locator("input");
  await input.fill("98042");
  await input.blur();
  await settle(page, 600);
}

async function waitForStores(page) {
  await page.getByRole("heading", { name: /^Stores$/i }).waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    () => /\d+\s+stores/i.test(document.body.innerText),
    { timeout: 60_000 },
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 3, // 1080×2400 physical
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);

  console.log("goto", BASE);
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page, 1000);
  await hideDevChrome(page);
  await ensureZip(page);
  await waitForStores(page);

  // Prefer Fred Meyer / QFC for live-first plan labels
  const storesToggle = page.getByRole("button", { name: /Stores/i }).first();
  if ((await storesToggle.getAttribute("aria-expanded")) !== "true") {
    await storesToggle.click();
    await settle(page, 400);
  }
  const preferButtons = page.getByRole("button", { name: /^Prefer$/ });
  const preferCount = await preferButtons.count();
  // Prefer first few Kroger banner stores (usually listed first)
  for (let i = 0; i < Math.min(preferCount, 6); i++) {
    await preferButtons.nth(i).click();
  }
  await settle(page, 300);
  // Collapse for later shots
  if ((await storesToggle.getAttribute("aria-expanded")) === "true") {
    await storesToggle.click();
    await settle(page, 200);
  }

  // Seed list
  await page.getByRole("button", { name: /Dev \+15/i }).click();
  await settle(page, 1200);

  // --- 01 home: ZIP + list visible (scroll brand off; keep ZIP card + items) ---
  await page.evaluate(() => {
    const zip = [...document.querySelectorAll("label")].find((l) =>
      /ZIP for nearby stores/i.test(l.textContent || ""),
    );
    if (!zip) return;
    const y = zip.getBoundingClientRect().top + window.scrollY - 6;
    window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
  });
  await settle(page, 500);
  // Guard: if list stole scroll focus, snap back to ZIP once more
  await page.evaluate(() => {
    const zip = [...document.querySelectorAll("label")].find((l) =>
      /ZIP for nearby stores/i.test(l.textContent || ""),
    );
    if (!zip) return;
    const top = zip.getBoundingClientRect().top;
    if (top < -20 || top > 80) {
      const y = zip.getBoundingClientRect().top + window.scrollY - 6;
      window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
    }
  });
  await hideDevChrome(page);
  const topHint = await page.evaluate(() => document.elementFromPoint(180, 24)?.textContent?.slice(0, 80));
  console.log("01 viewport top hint:", topHint);
  await page.screenshot({ path: shotPath("01-home-list.png"), fullPage: false });
  console.log("wrote 01-home-list.png");

  // --- 02 stores expanded ---
  if ((await storesToggle.getAttribute("aria-expanded")) !== "true") {
    await storesToggle.click();
    await settle(page, 400);
  }
  await frameAtTop(page, page.getByRole("heading", { name: /^Stores$/i }), 16);
  await hideDevChrome(page);
  await page.screenshot({ path: shotPath("02-stores.png"), fullPage: false });
  console.log("wrote 02-stores.png");

  if ((await storesToggle.getAttribute("aria-expanded")) === "true") {
    await storesToggle.click();
    await settle(page, 200);
  }

  // --- 03 optimize plan ---
  await page.getByRole("button", { name: /Optimize cart/i }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: /Optimize cart/i }).click();
  console.log("optimize started; waiting up to", OPTIMIZE_TIMEOUT_MS, "ms");
  await page.getByRole("heading", { name: /Recommended plan/i }).waitFor({
    timeout: OPTIMIZE_TIMEOUT_MS,
  });
  // Wait for plan stats (Total / live tag) rather than empty shell
  await page.waitForFunction(
    () => {
      const h = [...document.querySelectorAll("h2")].find((el) =>
        /Recommended plan/i.test(el.textContent || ""),
      );
      const card = h?.closest("div.border, div");
      const t = card?.innerText || "";
      return /Total/i.test(t) && /(\$|live|modeled|est\.)/i.test(t);
    },
    { timeout: OPTIMIZE_TIMEOUT_MS },
  );
  await settle(page, 800);

  await frameAtTop(page, page.getByRole("heading", { name: /Recommended plan/i }), 8);
  await hideDevChrome(page);

  const planSnippet = await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((el) =>
      /Recommended plan/i.test(el.textContent || ""),
    );
    if (!h) return "";
    let card = h.parentElement;
    for (let i = 0; i < 5 && card; i++) {
      if (card.classList?.contains("border")) break;
      card = card.parentElement;
    }
    return (card?.innerText || h.parentElement?.innerText || "").slice(0, 3000);
  });
  const planHasLiveLabel = /\b(mostly live|· live|\blive\b)/i.test(planSnippet);
  const planWarnModeled = /This plan is mostly modeled/i.test(planSnippet);
  const showedLive = planHasLiveLabel && !planWarnModeled;

  await page.screenshot({ path: shotPath("03-plan-live.png"), fullPage: false });
  console.log("wrote 03-plan-live.png; live=", showedLive);

  // --- 04 shopping mode ---
  await page.getByRole("button", { name: /Let’s shop|Let's shop/i }).click();
  await page.getByRole("button", { name: /Back to plan/i }).waitFor({ timeout: 15_000 });
  await settle(page, 500);
  // Scroll so sticky Back bar sits near top (under any residual header)
  await frameAtTop(page, page.getByRole("button", { name: /Back to plan/i }), 4);
  // Nudge so checklist body is also visible under the sticky bar
  await page.evaluate(() => window.scrollBy(0, -4));
  await hideDevChrome(page);
  await settle(page, 300);
  await page.screenshot({ path: shotPath("04-shop.png"), fullPage: false });
  console.log("wrote 04-shop.png");

  const meta = {
    capturedAt: new Date().toISOString(),
    url: BASE,
    viewport: "360x800 CSS @ deviceScaleFactor 3 → 1080x2400",
    planShowedLive: showedLive,
    planSnippetPreview: planSnippet.slice(0, 800),
  };
  fs.writeFileSync(path.join(OUT, "_capture-meta.json"), JSON.stringify(meta, null, 2));
  console.log("META", JSON.stringify(meta, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
