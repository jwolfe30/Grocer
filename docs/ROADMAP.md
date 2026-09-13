# Grocer roadmap

**North star:** Help people get quality groceries at fair prices by cross-shopping local stores — free, no paywall, honest live vs estimate labels.

**Platform order:** **Android first → iOS second.** Ship a useful Android app before investing in App Store polish. Share one backend + API; mobile clients consume `/api/*`.

**Launch bar (any store):** First optimize session is mostly **real** prices for the stores we claim to cover. Fake-complete plans with modeled totals are not launch-ready.

---

## Now → Android launch

### Phase 0 — Foundation (blocking) — **DONE**

Exit met: durable `data/app.sqlite` (lists/users/sessions/receipts), price cache + daily refresh ops, live-first optimize/plan honesty. Auth sessions persist; scrypt params documented; login/register in-memory rate limits (10/min per IP).

Everything else sat on this.

| Work | Why |
|------|-----|
| Durable DB for lists, users, sessions, receipts | In-memory dies on restart; kills trust and multi-device |
| Production Kroger (or stable live path) + daily `prices:refresh` | Cold start needs live FM/QFC, not Cert flakiness |
| Price cache as default path | Cut API bursts; keep `price_observations` growing |
| Live-first optimize UX | Prefer priced stores; never dress demo up as live |
| Auth hardened for production | Replace demo scrypt/session story |

**Exit:** Restart the server; lists and prices still there. Optimize on a typical list returns mostly `live` for FM/QFC in the default ZIP.

### Phase 1 — Product completeness (web = API contract) — **DONE**

Coupon picker, shop polish, deal badges v1, receipt photo path (OCR later), share verified on SQLite.

| Work | Why |
|------|-----|
| Coupon picker per plan stop | Engine exists; shoppers need clip/choose at checkout |
| Shopping mode polish | Primary in-aisle surface on phones |
| Share + guest check-off | Household lists |
| Receipt capture path | Camera file input + paste parser shipped; **OCR line extract is follow-up** (photo stores metadata only today) |
| Deal signals (v1) | “Cheaper vs 30-day median” from `getPriceHistory` — optional badge on live plan/match lines |

**Exit:** A shopper can list → optimize → pick coupons → shop → optionally upload receipt, all via stable APIs.

### Phase 2 — Android app (v1) — **CLOSED TEST VERIFIED (emulator)**

**Shell choice (locked):** **Capacitor (WebView)** wrapping the existing Next.js app — not Expo/RN. The Android client loads a deployed or local Next host via `CAPACITOR_SERVER_URL` (API routes need that backend; see `docs/ANDROID.md`).

| Work | Status |
|------|--------|
| Capacitor Android scaffold (`com.cascadialabs.grocer`) | Done |
| Deep links `grocer://l/…` + HTTPS App Links placeholder | Done |
| Emulator AVD + debug APK install | Done (`Grocer_API_34`, JDK 21 under `.tools/`) |
| `crypto.randomUUID` WebView polyfill (`src/lib/id.ts`) | Done |
| **Live-first plan ranking** | Done — recommended plan prefers live lines over cheaper modeled (`optimize.ts`) |
| Launch-bar E2E (API) | Verified — typical 98042 Kroger list → majority live on best plan |
| Human in-store trip sign-off | Pending |
| Play Store listing assets | Phase 3 |

**Exit:** Closed test group completes a real trip with live FM/QFC prices and reports the plan was usable in-store.

### Phase 3 — Android public launch — **UPLOAD-READY (needs Play Console + HTTPS host)**

| Work | Status / why |
|------|----------------|
| Privacy policy + Play listing prep | **Done** — [`docs/PRIVACY.md`](PRIVACY.md), [`docs/PLAY_STORE.md`](PLAY_STORE.md), `/privacy` |
| Play screenshots + brand assets | **Done** — [`docs/play-screenshots/`](play-screenshots/), [`docs/play-assets/`](play-assets/) |
| Emulator closed-test + live-first ranking | **Done** |
| Self-serve account deletion | **Done** — `DELETE /api/account` |
| Docker host (SQLite-persistent) | **Done** — `docker compose up --build` ([DEPLOY.md](DEPLOY.md)) |
| App Links template | **Done** — `public/.well-known/assetlinks.json` (fill cert fingerprint) |
| Non-Kroger default exclude | **Done** — live-first cold start |
| Closed → open → production Play release | **Needs you** — HTTPS host + Play Console upload of `app-release.aab` |
| Crash/analytics dashboards | Not started |

**Exit:** Public Android install; default experience is live-priced for covered banners.

Agent vs human checklist: [`LAUNCH_GATES.md`](LAUNCH_GATES.md).

---

## After Android — iOS

### Phase 4 — iOS parity — **SCAFFOLD PREP** (Xcode/TestFlight pending Mac)

**Status:** Capacitor iOS project + docs ready on Windows (`ios/`, `@capacitor/ios`, same `appId` as Android). **Cannot build/run here** — need macOS + Xcode for Simulator, signing, TestFlight. See [`docs/IOS.md`](IOS.md).

| Work | Status / why |
|------|----------------|
| Same client codebase targeting iOS (Capacitor) | **Scaffold done** — `ios/`, `capacitor.config.ts` shared with Android (`com.cascadialabs.grocer`); `grocer://` URL scheme in Info.plist |
| Mac: sync, open Xcode, run Simulator / device | **Pending Mac** — steps in IOS.md |
| App Store assets, review notes | Apple listing work — not started |
| Account deletion (App Store requirement) | **API + UI done** — `DELETE /api/account` + Account panel; document in review notes |
| TestFlight → App Store | Blocked on Mac signing + Android metrics first |

**Exit:** Feature parity with Android v1; no iOS-only bets until Android metrics look good.

---

## Later (post–both stores)

Ordered by leverage, not dates:

1. **Non-Kroger real prices** — ads/circulars + receipts first; licensed data before scraping
2. **Sale/coupon push alerts** — account prefs already exist; needs durable monitoring job
3. **Price trends UX** — “down vs your usual / vs 30-day” across the list
4. **Wider geography** — new ZIPs only with warm cache + store roster
5. **Optional ads** — never hide cheaper options (README principle)
6. **Widget / offline list** — nice-to-have after core trust

---

## Explicit non-goals (for now)

- Delivery / checkout cart handoff
- Paywalled savings features
- Scraping as the primary price source
- iOS before a credible Android closed test
- Expanding store banners we cannot price honestly

---

## Suggested sequence (one line)

**Durable backend + live cache → finish shopper loop on API → Android closed test → Android public → iOS parity → trends / alerts / more banners.**

---

## Working principles (unchanged)

- Savings first; free for consumers; accounts add cloud sync & history
- Honest data labels (`live` / `modeled` / `est.` / crowd / ad)
- Ads ≠ advantages if monetization arrives
- QA: `npm run qa:smoke` + `docs/QA.md` after feature/UI changes
