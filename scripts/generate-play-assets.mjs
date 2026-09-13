/**
 * Render Play Store branding assets from local HTML (Fraunces / Source Sans 3).
 *
 * Outputs:
 *   docs/play-assets/icon-512.png           (512×512)
 *   docs/play-assets/feature-1024x500.png   (1024×500)
 *
 * Usage: node scripts/generate-play-assets.mjs
 *
 * Needs network once so Google Fonts can load. Playwright must be installed
 * (same as capture-play-screenshots.mjs).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "play-assets");
const TEMPLATES = path.join(__dirname, "play-assets");

const ASSETS = [
  {
    html: "icon.html",
    out: "icon-512.png",
    width: 512,
    height: 512,
  },
  {
    html: "feature.html",
    out: "feature-1024x500.png",
    width: 1024,
    height: 500,
  },
];

fs.mkdirSync(OUT, { recursive: true });

async function waitForFonts(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  // Extra beat so webfont swap settles before capture
  await page.waitForTimeout(400);
}

async function renderOne(browser, asset) {
  const htmlPath = path.join(TEMPLATES, asset.html);
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Missing template: ${htmlPath}`);
  }
  const url = pathToFileURL(htmlPath).href;
  const outPath = path.join(OUT, asset.out);

  const page = await browser.newPage({
    viewport: { width: asset.width, height: asset.height },
    deviceScaleFactor: 1,
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await waitForFonts(page);

  const target = page.locator("#capture");
  await target.waitFor({ state: "visible" });
  await target.screenshot({
    path: outPath,
    type: "png",
    omitBackground: false,
  });

  await page.close();

  const stat = fs.statSync(outPath);
  console.log(`Wrote ${path.relative(ROOT, outPath)} (${stat.size} bytes)`);
  return outPath;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const asset of ASSETS) {
      await renderOne(browser, asset);
    }
  } finally {
    await browser.close();
  }
  console.log("Done. Upload from docs/play-assets/ in Play Console.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
