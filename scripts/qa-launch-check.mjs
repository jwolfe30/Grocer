#!/usr/bin/env node
/**
 * Launch-readiness file checklist (no network, no Docker, no Fly login).
 * Usage: npm run qa:launch
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ id: string; critical: boolean; check: () => string | null }} */
const items = [
  {
    id: "Release AAB",
    critical: true,
    check: () =>
      existsFile("android/app/build/outputs/bundle/release/app-release.aab"),
  },
  {
    id: "Play screenshots",
    critical: true,
    check: () => dirHasPngs("docs/play-screenshots", 1),
  },
  {
    id: "Play assets (icon + feature)",
    critical: true,
    check: () => {
      const icon = existsFile("docs/play-assets/icon-512.png");
      const feature = existsFile("docs/play-assets/feature-1024x500.png");
      if (!icon && !feature) return null;
      return [icon, feature].filter(Boolean).join(", ");
    },
  },
  {
    id: "Dockerfile",
    critical: true,
    check: () => existsFile("Dockerfile"),
  },
  {
    id: "fly.toml",
    critical: false,
    check: () => existsFile("fly.toml"),
  },
  {
    id: "assetlinks.json",
    critical: true,
    check: () => existsFile("public/.well-known/assetlinks.json"),
  },
  {
    id: "LAUNCH_GATES.md",
    critical: true,
    check: () => existsFile("docs/LAUNCH_GATES.md"),
  },
  {
    id: "ios/ scaffold",
    critical: true,
    check: () => existsDir("ios"),
  },
  {
    id: "Privacy route",
    critical: true,
    check: () => existsFile("src/app/privacy/page.tsx"),
  },
  {
    id: "DEPLOY.md (Fly.io)",
    critical: false,
    check: () => {
      const p = path.join(root, "docs/DEPLOY.md");
      if (!fs.existsSync(p)) return "docs/DEPLOY.md";
      const text = fs.readFileSync(p, "utf8");
      if (!/Fly\.io/i.test(text)) return "docs/DEPLOY.md missing Fly.io section";
      return null;
    },
  },
  {
    id: "play-internal workflow",
    critical: false,
    check: () => existsFile(".github/workflows/play-internal.yml"),
  },
];

function existsFile(relPath) {
  const abs = path.join(root, relPath);
  return fs.existsSync(abs) && fs.statSync(abs).isFile()
    ? null
    : relPath;
}

function existsDir(relPath) {
  const abs = path.join(root, relPath);
  return fs.existsSync(abs) && fs.statSync(abs).isDirectory()
    ? null
    : relPath;
}

function dirHasPngs(relPath, min) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    return `${relPath}/`;
  }
  const pngs = fs
    .readdirSync(abs)
    .filter((f) => f.toLowerCase().endsWith(".png"));
  if (pngs.length < min) {
    return `${relPath}/ (need ≥${min} PNG, found ${pngs.length})`;
  }
  return null;
}

function main() {
  console.log("Grocer launch checklist\n");

  let failedCritical = 0;
  let failedOptional = 0;

  for (const item of items) {
    const miss = item.check();
    if (!miss) {
      console.log(`PASS  ${item.id}`);
      continue;
    }
    const tag = item.critical ? "FAIL" : "WARN";
    console.log(`${tag}  ${item.id}: missing ${miss}`);
    if (item.critical) failedCritical += 1;
    else failedOptional += 1;
  }

  console.log("");
  if (failedCritical > 0) {
    console.log(
      `Launch check failed: ${failedCritical} critical missing` +
        (failedOptional ? `, ${failedOptional} optional` : ""),
    );
    console.log("See docs/LAUNCH_GATES.md and docs/DEPLOY.md");
    process.exit(1);
  }

  if (failedOptional > 0) {
    console.log(
      `Launch check passed with ${failedOptional} optional warning(s).`,
    );
  } else {
    console.log("Launch check passed (all items present).");
  }
}

main();
