# Grocer handoff — pick up here

**Date:** 2026-09-17  
**Repo:** `C:\Users\josh_\Grocer` → `https://github.com/jwolfe30/Grocer`  
**Branch:** `master` (tracks `origin/master`)  
**Goal (incomplete):** Android launch first, then iOS. Launch bar = mostly **real** prices for covered stores (FM/QFC via Kroger). Free, no paywall. Default ZIP **98042**.

Do **not** mark the Android→iOS goal complete until HTTPS Android is live on Play and (for full objective) iOS is past scaffold.

---

## TL;DR for the next agent

| Status | Detail |
|--------|--------|
| Phases 0–1 | **Done** on `master` |
| Phase 2 Android closed test | **Done on emulator**; human in-store pending |
| Phase 3 Play public | **Blocked** — no Fly/HTTPS auth; Play Console is human |
| Phase 4 iOS | **Scaffold only** — needs Mac |
| Local build + Fly cost + handoff docs | Landed in repo (see recent commits); **push to origin if remote is behind** |

**Shortest unlock:** human runs `flyctl auth login` (or sets `FLY_API_TOKEN` / GH secret) → `.\scripts\fly-deploy.ps1` → point Cap at `https://cascadialabs-grocer.fly.dev` → `npm run cap:sync` → `npm run cap:aab` → Play Console upload.

---

## Recent local commits (may need `git push`)

After `011c2ea`, expect a commit that includes:

| File | Why |
|------|-----|
| `fly.toml` | Cost: `min_machines_running = 0`, memory `256mb` |
| `tsconfig.json` | Exclude `scripts`, `android`, `ios` so `next build` typecheck doesn’t pull scripts |
| `src/lib/pricing.ts` | `basePrice` accepts `Pick<Offer,…>` — production type fix |
| `docs/LAUNCH_GATES.md` | Cost ballpark |
| `docs/HANDOFF.md` | This handoff |
| `README.md` / `docs/GOAL_AUDIT.md` | Pointers to handoff |

Ignore locally: `.cursor/`, `data/prices-refresh-last.log`, `docs/android-closed-test*.png`.

`npm run build` was verified green after the tsconfig/pricing fixes (2026-09-13).

---

## What’s already on `origin/master` (before handoff commit)

Key commits:

- `2aa724d` — Android launch stack: durable SQLite, live-first optimize, Capacitor Android+iOS scaffold, Play assets, Docker/Fly config
- `011c2ea` — Fly deploy workflow + `docs/GOAL_AUDIT.md`

### Product / data

- Next.js 15 app: `src/app/page.tsx`, APIs under `src/app/api/`
- App DB: `src/lib/app-db.ts` → `data/app.sqlite`
- Price history: `src/lib/price-db.ts` → `data/prices.sqlite`
- Live-first plans: `src/lib/optimize.ts` + `src/lib/pricing.ts`
- Kroger client: `src/lib/kroger.ts`
- WebView UUID polyfill: `src/lib/id.ts`
- Account delete: `DELETE /api/account`
- Privacy page: `/privacy`

### Mobile

- App ID: `com.cascadialabs.grocer`
- Capacitor: `capacitor.config.ts` — default server `http://10.0.2.2:3000` (emulator)
- Android: `android/`; release AAB at `android/app/build/outputs/bundle/release/app-release.aab`
- Prerelease: https://github.com/jwolfe30/Grocer/releases/tag/android-closed-test-1
- iOS scaffold: `ios/` + `docs/IOS.md` (no Mac build yet)
- Emulator AVD: `Grocer_API_34`; JDK under `.tools/`

### Deploy / store

- Fly app name: `cascadialabs-grocer` (`fly.toml`)
- Scripts: `scripts/fly-deploy.ps1`, `scripts/android-env.ps1`, `scripts/android-cert-fingerprint.ps1`
- Workflows: `.github/workflows/fly-deploy.yml`, `play-internal.yml`, `prices-refresh.yml`
- Listing: `docs/PLAY_STORE.md`, `docs/play-screenshots/`, `docs/play-assets/`
- App Links stub: `public/.well-known/assetlinks.json` (fingerprint still placeholder)

---

## Hard blockers (agent alone cannot finish)

1. **Fly HTTPS host** — `flyctl` is installed (`%USERPROFILE%\.fly\bin`); **not logged in**; no `FLY_API_TOKEN` in env. Interactive `fly auth login` required, or token + GH secret `FLY_API_TOKEN` then Actions → **fly-deploy**.
2. **No Docker Desktop** on this Windows machine — Compose path unavailable; Fly remote builder is the intended path.
3. **Play Console** — create app, Data safety, upload AAB, internal → production (human + $25).
4. **Production Kroger secrets** on the host (`KROGER_ENV=production` + client id/secret).
5. **Placeholders to replace:** `privacy@cascadialabs.example`, assetlinks SHA256, Cap `CAPACITOR_SERVER_URL` for store builds.
6. **Mac + Xcode** for TestFlight (`docs/IOS.md`).

---

## Exact next steps (ordered)

### A. Human unlock (required)

```powershell
$env:Path = "$env:USERPROFILE\.fly\bin;$env:Path"
flyctl auth login
# optional: also add GitHub Actions secret FLY_API_TOKEN for CI deploys
```

Then from repo root (after committing the 4 local files above):

```powershell
.\scripts\fly-deploy.ps1
flyctl secrets set -a cascadialabs-grocer KROGER_ENV=production KROGER_CLIENT_ID=... KROGER_CLIENT_SECRET=...
```

### B. Point Android at HTTPS and rebuild AAB

```powershell
$env:CAPACITOR_SERVER_URL = "https://cascadialabs-grocer.fly.dev"
npm run cap:sync
npm run cap:aab
# Fill public/.well-known/assetlinks.json via:
. .\scripts\android-env.ps1
.\scripts\android-cert-fingerprint.ps1
```

### C. Play Console

Follow `docs/PLAY_STORE.md`. Upload AAB + screenshots/assets; set privacy URL to `https://cascadialabs-grocer.fly.dev/privacy`.

### D. iOS (later)

On a Mac: `docs/IOS.md` — same `CAPACITOR_SERVER_URL`, sync, Xcode, TestFlight.

---

## Verify before claiming progress

```powershell
npm run build          # must pass (tsconfig excludes scripts/)
npm run qa:launch      # artifact presence checklist
# With Next listening on :3000:
npm run qa:smoke       # see docs/QA.md — stores, optimize, plan clicks, Let’s shop
npm run qa:launch-bar  # typical 98042 list → mostly live on recommended plan
npm run prices:stats   # cache health; refresh if stale: npm run prices:refresh
```

Workspace rule: after UI/feature changes, smoke must pass and walk `docs/QA.md` for touched areas. Do not claim done if stores vanish, optimize hangs without status, or shopping mode hides the editor with no Back.

---

## Doc map

| Doc | Use |
|-----|-----|
| [ROADMAP.md](ROADMAP.md) | Phase definitions + north star |
| [LAUNCH_GATES.md](LAUNCH_GATES.md) | Agent vs human gates + costs |
| [GOAL_AUDIT.md](GOAL_AUDIT.md) | Requirement → evidence matrix |
| [DEPLOY.md](DEPLOY.md) | Fly / Docker / Cap server URL |
| [ANDROID.md](ANDROID.md) | Emulator, sync, AAB |
| [IOS.md](IOS.md) | Mac / TestFlight |
| [PLAY_STORE.md](PLAY_STORE.md) | Listing checklist |
| [QA.md](QA.md) | Manual UI checklist |
| **This file** | Session handoff |

---

## Known pitfalls

- Cap WebView **does not** run Next API routes offline — always need a reachable `CAPACITOR_SERVER_URL`.
- Vercel is a bad fit for SQLite persistence; prefer Fly volume at `/app/data` or Docker bind mount.
- Stale `node` on port 3000 can 500 after code changes — kill and `npm run start` / `npm run dev`.
- Including `scripts/**` in Next typecheck previously broke `next build` (“pricing.ts is not a module”). Keep `scripts` excluded in `tsconfig.json`.
- Localtunnel / trycloudflare was tried as interim HTTPS; unstable for store launch — use Fly.
- Auth is MVP (scrypt + durable sessions + rate limit), not full OAuth — acceptable for v1 unless Play/review demands more.

---

## Success criteria (goal complete only when all true)

1. Production HTTPS host serves Grocer with persistent `data/*.sqlite`.
2. Android release build loads that HTTPS origin; AAB on Play (at least internal, ideally production).
3. Default ZIP optimize for FM/QFC is mostly `live` prices.
4. iOS: beyond scaffold — Simulator/TestFlight path verified on Mac (full objective).

Until then keep the goal **active / incomplete**.
