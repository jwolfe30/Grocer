# Grocer

Help people get **quality groceries at fair prices** by cross-shopping local stores — including sales, coupons, and discounts — without delivery premiums or paywalls.

**Free to use.** No subscriptions, no locked features. If the product monetizes later, it will be through **optional ads** (product placement or store promotions), never by charging shoppers for savings tools.

This is the opposite of Instacart-style convenience markup: optimize what you *pay*, and only split trips when savings clear your threshold.

## Product principles

- **Savings first** — every plan should make the money story obvious
- **Free for consumers** — core comparison and list tools stay open; **no account required**
- **Accounts add value** — **cloud grocery lists** (PC ↔ mobile), saved frequent items, sale/coupon alerts, receipt history, points & wholesome badges (flair only)
- **Receipts help everyone** — uploads personalize spending insights and contribute crowd price estimates
- **Honest data** — label live vs estimate vs demo vs crowd; don’t invent shelf prices
- **Ads ≠ advantages** — sponsored placements may appear later; they must not hide cheaper options

## Features (MVP)

- Grocery list builder with live suggestions, check-off, delete, and clear
- **Shareable list URLs** (account owners) — guests open the link with no login; shared viewers can only cross out items
- Approximate item matching across stores
- Prefer / exclude stores; prefer local, organic/non-GMO, kosher
- Single-store vs multi-store plans with a **savings threshold**
- Coupons, sales, and effective-price totals
- Hybrid catalog: seeded South King County stores + optional **Kroger Products API** (Fred Meyer / QFC)
- REST API under `/api/*` for a future mobile client

## Agent / launch handoff

Phases 0–2 are largely done; **Play public + iOS are not.** Start here: **[docs/HANDOFF.md](docs/HANDOFF.md)** (blockers, exact next commands). Also [LAUNCH_GATES.md](docs/LAUNCH_GATES.md), [ROADMAP.md](docs/ROADMAP.md).

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Zod validation on API payloads
- SQLite (`data/app.sqlite`, `data/prices.sqlite`) for durable lists and price cache
- **Android (Phase 2):** Capacitor WebView (`com.cascadialabs.grocer`) loading the hosted/dev Next URL — see [docs/ANDROID.md](docs/ANDROID.md)
- **iOS (Phase 4 prep):** same Capacitor appId + `ios/` scaffold — build/run on a Mac; see [docs/IOS.md](docs/IOS.md)

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Default test ZIP: **98042** (Covington / Kent, WA). Store roster: `src/lib/area-stores.ts` (Fred Meyer, QFC, Safeway, Albertsons, Costco, co-op demos).

### Optional: live Kroger / Fred Meyer / QFC prices

1. Register an app at [developer.kroger.com](https://developer.kroger.com/) (Certification **or** Production Products with `product.compact`)
2. Copy `.env.example` to `.env.local` and set credentials that match the host:

```env
KROGER_ENV=certification   # or production — must match the app you registered
KROGER_CLIENT_ID=...
KROGER_CLIENT_SECRET=...
KROGER_LOCATION_ID=70100053   # optional primary; full roster in src/lib/area-stores.ts
KROGER_ZIP=98042
```

3. Diagnose auth/products: `npm run kroger:probe` (never prints secrets)

Cert credentials return **401** on `api.kroger.com` — that is expected. Use a separate Production Public app for prod.

Without credentials (or when the live edge is down), Fred Meyer / QFC use **modeled** seed prices; receipt crowd prices win over modeled when both exist.

Live Kroger results are write-through to a local SQLite price history (`data/prices.sqlite`). Optimize/suggest prefer fresh cached rows (default max age 24h) to cut daytime API bursts; run `npm run prices:refresh` to warm popular terms, `npm run prices:stats` for counts + freshness, and `npm run prices:refresh:check` to fail if the newest `price_latest` row is older than `PRICE_CACHE_MAX_AGE_HOURS`. History is append-only so future “cheaper vs 30-day median” features need no migration.

### Production launch checklist

Ops path only — does not flip your local env to production by itself. Credentials stay in `.env.local` / host secrets (never commit them). Full host + Capacitor AAB steps: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

1. **Cert vs Prod** — Use a **Production** Public app (`KROGER_ENV=production`) for stable live FM/QFC. Cert is for API development; Cert keys get **401** on `api.kroger.com`. Confirm with `npm run kroger:probe`.
2. **Daily refresh** — On the machine that owns `data/prices.sqlite`, schedule `npm run prices:refresh` once per day (see Windows Task Scheduler below). Cold start needs a warm cache, not daytime API storms.
3. **Freshness** — After refresh: `npm run prices:stats` (oldest/newest latest rows) and `npm run prices:refresh:check` (exit 1 if stale/empty).
4. **Cache max age** — Keep `PRICE_CACHE_MAX_AGE_HOURS` aligned with the refresh cadence (default **24**). Rows older than this are treated as stale for optimize/suggest preference.
5. **GitHub Action (optional)** — `.github/workflows/prices-refresh.yml` runs daily / on demand. Soft-skips (no failure) until repo secrets `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, and `KROGER_ENV` are set. Uploads `prices.sqlite` as an artifact for inspection — **it does not auto-replace** a self-hosted app DB. Prefer scheduling refresh on the app host.
6. **Ship host** — `npm run build && npm run start` (or Vercel with SQLite caveats), set `CAPACITOR_SERVER_URL=https://…`, rebuild AAB, privacy at `https://host/privacy` — see [DEPLOY.md](docs/DEPLOY.md).

#### Windows: daily Task Scheduler (app host)

Run from an elevated PowerShell (adjust paths):

```powershell
$grocer = "C:\Users\josh_\Grocer"
$action = New-ScheduledTaskAction -Execute "npm.cmd" -Argument "run prices:refresh" -WorkingDirectory $grocer
$trigger = New-ScheduledTaskTrigger -Daily -At 6:00AM
Register-ScheduledTask -TaskName "GrocerPricesRefresh" -Action $action -Trigger $trigger -Description "Warm Grocer Kroger price cache"
```

Ensure `.env.local` on that host has matching Kroger credentials. Confirm with `npm run prices:refresh:check` after the first run.

## API overview

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/kroger/status` | Live/offline Kroger status for UI banner |
| `GET` | `/api/stores` | Nearby / seeded stores |
| `GET` | `/api/catalog?q=` | Search catalog (+ Kroger when configured) |
| `GET` | `/api/suggest?q=` | Typedown suggestions with effective prices |
| `POST` | `/api/auth/register` | Create optional free account |
| `POST` | `/api/auth/login` | Sign in |
| `GET`/`PATCH`/`DELETE` | `/api/account` | Profile / prefs; **DELETE** removes the signed-in account |
| `GET`/`POST` | `/api/receipts` | Spending history + receipt upload (crowd prices) |
| `POST` | `/api/lists` | Create a grocery list |
| `GET` | `/api/lists/:id` | Fetch a list |
| `PATCH` | `/api/lists/:id` | Update list items / prefs |
| `POST` | `/api/lists/:id/match` | Match list lines to store offers |
| `POST` | `/api/lists/:id/optimize` | Build single- and multi-store plans |

### Optimize body

```json
{
  "savingsThresholdUsd": 8,
  "preferLocal": true,
  "preferOrganic": false,
  "preferKosher": false,
  "storeIds": ["kroger-70100053", "qfc-70500803", "safeway-covington", "costco-kent"]
}
```

Returns the cheapest single-store cart, a multi-store split plan, and whether multi-store is recommended given the threshold.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run kroger:probe
npm run prices:refresh        # warm popular terms → data/prices.sqlite
npm run prices:stats          # counts + oldest/newest latest
npm run prices:refresh:check  # exit 1 if cache empty or past max age
npm run qa:smoke
npm run cap:sync              # sync Capacitor android + ios (after CAPACITOR_SERVER_URL)
npm run cap:open:android      # open android/ in Android Studio
npm run cap:android           # run on emulator/device
npm run cap:open:ios          # open ios/ in Xcode (Mac only)
```

## Android closed test

Capacitor wraps the **same Next.js UI** in an Android WebView. The app always talks to a running backend — local `npm run dev` or a deployed URL. Full steps: **[docs/ANDROID.md](docs/ANDROID.md)**. iOS scaffold / Mac steps: **[docs/IOS.md](docs/IOS.md)**.

**Quick path (emulator):**

1. Prerequisites: Android Studio + JDK, `npm install`, emulator created.
2. Terminal A: `npm run dev`
3. Terminal B (PowerShell):

   ```powershell
   $env:CAPACITOR_SERVER_URL = "http://10.0.2.2:3000"   # emulator → host; default if unset
   npm run cap:sync
   npm run cap:open:android
   ```

4. Run ▶ in Android Studio on an emulator.

**Physical device:** set `CAPACITOR_SERVER_URL` to your PC’s LAN IP (e.g. `http://192.168.1.42:3000`) and bind Next with `-H 0.0.0.0` if needed.

**Deep links:** `grocer://l/{shareId}` (custom scheme) and `https://grocer.example.com/l/{shareId}` (App Links placeholder host — replace in `android/.../strings.xml` before production).

Play Store listing assets are Phase 3 — closed test only for now.
