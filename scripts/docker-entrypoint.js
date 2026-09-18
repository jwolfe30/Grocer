#!/usr/bin/env node
/**
 * Fly/Docker entry: seed empty volume from image-baked data/seed/*.sqlite, then start Next.
 */
const { existsSync, copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawn } = require("node:child_process");

const root = process.cwd();
const dataDir = process.env.APP_DATA_DIR?.trim() || join(root, "data");
const seedDir = join(root, "data", "seed");

function resolvePath(envKey, fallbackName) {
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv) {
    return fromEnv.startsWith("/") || /^[A-Za-z]:[\\/]/.test(fromEnv)
      ? fromEnv
      : join(root, fromEnv);
  }
  return join(dataDir, fallbackName);
}

function seedIfMissing(targetPath, seedName) {
  const seedPath = join(seedDir, seedName);
  if (existsSync(targetPath)) {
    console.log(`[entrypoint] keep existing ${targetPath}`);
    return;
  }
  if (!existsSync(seedPath)) {
    console.log(`[entrypoint] no seed for ${seedName}; starting empty`);
    return;
  }
  mkdirSync(join(targetPath, ".."), { recursive: true });
  copyFileSync(seedPath, targetPath);
  console.log(`[entrypoint] seeded ${targetPath} from ${seedPath}`);
}

mkdirSync(dataDir, { recursive: true });
seedIfMissing(resolvePath("PRICE_CACHE_PATH", "prices.sqlite"), "prices.sqlite");
// Do not seed app.sqlite — accounts/lists must start empty in production.

const child = spawn("npm", ["start"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
