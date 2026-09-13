#!/usr/bin/env node
/**
 * Safe Kroger OAuth/Products probe.
 * Reads .env.local — never prints client secret or access tokens.
 *
 * Usage: node scripts/kroger-probe.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ENV_PATH = resolve(ROOT, ".env.local");
const LOCATION_ID = process.env.KROGER_LOCATION_ID || "70100053";
const TIMEOUT_MS = 8_000;

function loadEnvLocal() {
  const out = {};
  if (!existsSync(ENV_PATH)) {
    console.error("Missing .env.local");
    process.exit(1);
  }
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function bodyKind(text) {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) return "json";
  if (/access denied|akamai|edgesuite/i.test(t)) return "akamai-html";
  if (t.startsWith("<")) return "html";
  return "other";
}

/** Never echo access tokens / secrets in console snippets. */
function safeSnippet(text) {
  return text
    .slice(0, 160)
    .replace(/\s+/g, " ")
    .replace(/("access_token"\s*:\s*")[^"]+/gi, "$1[redacted]")
    .replace(/("refresh_token"\s*:\s*")[^"]+/gi, "$1[redacted]");
}

async function timedFetch(url, init) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      kind: bodyKind(text),
      snippet: safeSnippet(text),
      text,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      kind: "error",
      snippet: String(err?.message ?? err),
      text: "",
    };
  }
}

const HOSTS = [
  { name: "certification", base: "https://api-ce.kroger.com/v1" },
  { name: "production", base: "https://api.kroger.com/v1" },
];

const HEADER_VARIANTS = [
  {
    name: "minimal",
    headers: (basic) => ({
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    }),
  },
  {
    name: "postman-ua",
    headers: (basic) => ({
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "PostmanRuntime/7.43.0",
    }),
  },
  {
    name: "grocer-ua",
    headers: (basic) => ({
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "Grocer/0.1 (local-dev; +https://developer.kroger.com)",
    }),
  },
];

const BODY_VARIANTS = [
  {
    name: "form-body",
    url: (base) => `${base}/connect/oauth2/token`,
    body: "grant_type=client_credentials&scope=product.compact",
  },
  {
    name: "query-string",
    url: (base) =>
      `${base}/connect/oauth2/token?grant_type=client_credentials&scope=product.compact`,
    body: "",
  },
];

async function main() {
  const env = loadEnvLocal();
  const clientId = env.KROGER_CLIENT_ID;
  const clientSecret = env.KROGER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("KROGER_CLIENT_ID / KROGER_CLIENT_SECRET missing in .env.local");
    process.exit(1);
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  console.log("Kroger probe");
  console.log(`  client_id: ${clientId.slice(0, 8)}… (${clientId.length} chars)`);
  console.log(`  locationId: ${LOCATION_ID}`);
  console.log(`  env file: .env.local (secret not printed)`);
  console.log("");

  let firstToken = null;
  let firstHost = null;
  let firstVariant = null;

  for (const host of HOSTS) {
    console.log(`== ${host.name} (${host.base}) ==`);
    for (const headers of HEADER_VARIANTS) {
      for (const body of BODY_VARIANTS) {
        const label = `${headers.name} + ${body.name}`;
        const res = await timedFetch(body.url(host.base), {
          method: "POST",
          headers: headers.headers(basic),
          body: body.body || undefined,
          cache: "no-store",
        });
        console.log(
          `  token [${label}] → ${res.status} ${res.kind} ${res.ms}ms ${res.snippet}`,
        );
        if (res.ok && res.kind === "json" && !firstToken) {
          try {
            const json = JSON.parse(res.text);
            if (json.access_token) {
              firstToken = json.access_token;
              firstHost = host;
              firstVariant = label;
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
    console.log("");
  }

  if (!firstToken) {
    console.log("RESULT: no working token. Cert/Prod both failed for this network/app.");
    console.log("Next: Postman on this machine + hotspot; or Production Public app credentials.");
    process.exitCode = 2;
    return;
  }

  console.log(`RESULT: token OK on ${firstHost.name} via ${firstVariant}`);
  const productUrl = `${firstHost.base}/products?filter.term=milk&filter.locationId=${encodeURIComponent(LOCATION_ID)}&filter.limit=2`;
  const prod = await timedFetch(productUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${firstToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  console.log(
    `  products milk@${LOCATION_ID} → ${prod.status} ${prod.kind} ${prod.ms}ms ${prod.snippet}`,
  );
  if (prod.ok && prod.kind === "json") {
    try {
      const n = JSON.parse(prod.text)?.data?.length ?? 0;
      console.log(`  products returned: ${n}`);
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
