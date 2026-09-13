# Play Store — public Android launch checklist

**App name:** Grocer  
**Application ID:** `com.cascadialabs.grocer`  
**Shell:** Capacitor WebView → hosted Next.js backend ([ANDROID.md](ANDROID.md))  
**Privacy policy:** [PRIVACY.md](PRIVACY.md) → public route `/privacy` when deployed

This is **listing and ops prep**. Emulator closed-test APK is done (Phase 2 / ROADMAP); open → production still need Play Console upload, production HTTPS, and listing assets.

---

## Blockers before open testing

- [x] Phase 2 closed test on emulator or device (`ANDROID_HOME`, Android Studio / AVD or USB device) — done on `Grocer_API_34` (see ROADMAP)
- [ ] Production HTTPS backend URL set as `CAPACITOR_SERVER_URL` (not `http://10.0.2.2:3000`)
- [ ] Replace App Links host placeholder (`app_link_host` / `assetlinks.json`) — see ANDROID.md
- [ ] Real privacy contact inbox (replace `privacy@cascadialabs.example`)
- [ ] Release signing keystore created and backed up (never commit) — use `scripts/android-create-keystore.ps1` for a **local** key; create a separate backed-up upload key before production Play uploads

---

## Store listing drafts

### Title (≤ 30 characters)

`Grocer`

### Short description (≤ 80 characters)

`Cross-shop local grocers. Free lists, live prices where we cover, no paywall.`

### Full description (draft)

```
Grocer helps you get quality groceries at fair prices by comparing nearby stores — including sales and coupons — without delivery markups or a paywall.

Build a list, pick the stores you care about, and optimize for a single-store trip or a multi-store plan when the savings clear your threshold. We label live prices vs estimates so you know what is shelf-backed and what is modeled.

Optional free account: sync your list across devices, save frequent items, upload receipts (text and photo metadata today), and contribute crowd prices that help everyone.

Covered live pricing today focuses on Fred Meyer / QFC via Kroger’s Products API on our servers, plus seeded local stores. No account required for core list and optimize tools.

Free for shoppers. No subscriptions. If we add optional ads later, they will never hide a cheaper option.
```

### App category

Shopping (or Food & Drink — pick one and stay consistent)

### Tags / search hints (optional)

grocery list, price comparison, coupons, Fred Meyer, QFC, shopping list

### Support / privacy URLs (placeholders)

| Field | Value |
|-------|--------|
| Privacy policy | `https://<your-host>/privacy` |
| Support email | replace `privacy@cascadialabs.example` |
| Website | `https://<your-host>/` |

---

## Screenshots & graphics needed

Phone frames (1080×2400) are checked in under [play-screenshots/](play-screenshots/) — regenerate with `node scripts/capture-play-screenshots.mjs` against a warm `:3000` cache (see [play-screenshots/README.md](play-screenshots/README.md)).

Brand graphics (icon + feature) live under [play-assets/](play-assets/) — regenerate with `node scripts/generate-play-assets.mjs` (Playwright renders local HTML in `scripts/play-assets/`; needs network once for Google Fonts on the feature graphic).

| Asset | File / notes |
|-------|--------|
| Phone — list + ZIP | [play-screenshots/01-home-list.png](play-screenshots/01-home-list.png) |
| Phone — store picker | [play-screenshots/02-stores.png](play-screenshots/02-stores.png) |
| Phone — optimize plan (live labels) | [play-screenshots/03-plan-live.png](play-screenshots/03-plan-live.png) |
| Phone — Let’s shop + Back | [play-screenshots/04-shop.png](play-screenshots/04-shop.png) |
| Optional | Account / receipt UI (not captured yet) |
| 512×512 icon | [play-assets/icon-512.png](play-assets/icon-512.png) — leaf mark on leaf greens (`--leaf` / `--bg`) |
| Feature graphic 1024×500 | [play-assets/feature-1024x500.png](play-assets/feature-1024x500.png) — Fraunces “Grocer” + “Fair prices, free to use” |
| Tablet screenshots | Optional for v1 |

Do **not** show fake “live” totals in marketing if the build is demo/modeled-only. Re-capture after price-cache changes if labels shift to mostly modeled.

---

## Content rating (IARC / Play questionnaire)

Expect a **Everyone** / low-maturity outcome if answers match the product:

- No user-generated public social feed (household share links only)
- No gambling, alcohol sales inside the app, or dating
- No violence / horror
- Location: approximate ZIP only, not continuous tracking
- Photos: user-initiated receipt/profile images (metadata / small avatar)

Re-run the questionnaire if you add chat, public UGC, or ads with age-gated creatives.

---

## Data safety form — answers mapped to app behavior

Use [PRIVACY.md](PRIVACY.md) as the source of truth. Suggested Play Console answers:

### Data collected

| Data type | Collected? | Ephemeral? | Required? | Purpose | Shared with third parties? |
|-----------|------------|------------|-----------|---------|----------------------------|
| Email address | Yes (if account) | No | Optional (account features) | Account management | No (not sold; not for ads today) |
| Name (display name) | Yes (if account) | No | Optional | Account management | No |
| User passwords | Yes (hashed) | No | Optional (account) | Account management | No — never leave our auth store as plaintext |
| User IDs / app identifiers | Yes (user id, session token, device list id) | Session may expire | Optional / guest list id for guests | App functionality | No |
| Other user-generated content | Grocery list items, notes, share-checkoffs, receipt text, frequent items | No | Optional | App functionality | Share **link** recipients see list items only |
| Photos | Profile avatar (optional); receipt **photo metadata** (not full OCR image store yet) | No | Optional | App functionality | No |
| Approximate location | ZIP code (user-entered) | No | Approx. needed for store roster / prices | App functionality | No |
| Precise location | No | — | — | — | — |
| Purchase history | Receipt lines / spending summary if uploaded | No | Optional | App functionality; crowd price improvement | Crowd prices may inform other users’ **estimates** (product/price/store/ZIP — not “sold” as a personal dossier) |
| Product interaction / crash | Not via a third-party analytics SDK today; server logs may exist on host | Varies | N/A | Optional ops | Host/operator only |
| Financial info (cards) | No | — | — | — | — |
| Health / contacts / SMS | No | — | — | — | — |

### Encryption & deletion

- [ ] Data encrypted in transit: **Yes** (require HTTPS in production)
- [x] Users can request deletion: **Yes** — in-app **Delete account** and `DELETE /api/account` (Bearer session); see [PRIVACY.md](PRIVACY.md) and [DEPLOY.md](DEPLOY.md)
- [ ] Committed to Google Play Families / ads policies: N/A until ads exist

### Independent “data shared” toggle

Play distinguishes **collected** vs **shared**. For v1:

- **Shared:** typically **No** for personal info to advertisers/brokers.
- Kroger API usage is **server-side product lookups**, not “sharing the user’s email with Kroger.” Do not list Kroger as a data-sharing destination for Personal info unless your counsel says the API traffic must be disclosed differently.
- Household **share URLs** are user-initiated disclosure of list contents — describe under UGC / app functionality, not “sold.”

### Security practices checkboxes

- [ ] Follow Play Families if applicable — skip if not targeting kids
- [ ] Review PRIVACY.md when adding OCR image upload, crash SDKs, or ads

---

## Signing & AAB upload

**Never commit** `*.jks`, `*.keystore`, `android/keystore/`, or `android/key.properties`.

### Create a local/dev upload keystore (this machine)

```powershell
. .\scripts\android-env.ps1   # optional; script finds .tools\jdk-21 keytool on its own
.\scripts\android-create-keystore.ps1 -LocalDev
```

Interactive / production-bound upload key (prompts, or set env first):

```powershell
$env:GROCER_KEYSTORE_PATH = "C:\secure\grocer-upload.jks"
$env:GROCER_KEYSTORE_PASSWORD = "..."
$env:GROCER_KEY_ALIAS = "grocer"
$env:GROCER_KEY_PASSWORD = "..."
.\scripts\android-create-keystore.ps1
```

`android/app/build.gradle` reads **env vars first**, then falls back to gitignored `android/key.properties`:

| Env | `key.properties` key |
|-----|----------------------|
| `GROCER_KEYSTORE_PATH` | `storeFile` |
| `GROCER_KEYSTORE_PASSWORD` | `storePassword` |
| `GROCER_KEY_ALIAS` | `keyAlias` |
| `GROCER_KEY_PASSWORD` | `keyPassword` |

Debug builds stay unsigned by this config (default debug keystore).

### Build the release AAB

```powershell
. .\scripts\android-env.ps1   # JAVA_HOME → .tools\jdk-21
npm run cap:aab
# or:  cd android; .\gradlew.bat bundleRelease
```

Output (upload this file):

`android/app/build/outputs/bundle/release/app-release.aab`

### Play Console upload steps

1. [Play Console](https://play.google.com/console) → create / open the Grocer app (`com.cascadialabs.grocer`).
2. Enroll in **Play App Signing** when prompted (Google holds the app signing key; you keep the **upload** keystore).
3. **Testing → Internal testing** (or Closed) → **Create new release**.
4. Upload `app-release.aab` from the path above.
5. Add release notes, review warnings, roll out to the track.
6. Add testers (email list or Google Group); install via the opt-in link.
7. Before **Open** / **Production**: production `CAPACITOR_SERVER_URL` (HTTPS), privacy URL live, Data safety form accurate, screenshots uploaded.

If the upload key is lost and you are not enrolled in Play App Signing recovery, you cannot update the listing — back up the real upload keystore and passwords outside the repo.

Phase 2 device run instructions remain in [ANDROID.md](ANDROID.md).

---

## Release tracks (recommended order)

| Track | Goal |
|-------|------|
| **Internal testing** | You + 1–2 trusted testers; AAB upload; production server URL |
| **Closed testing** | Small group completes a real trip (Phase 2 exit) |
| **Open testing** | Wider feedback; privacy URL + Data safety must be accurate |
| **Production** | Public install; default experience mostly **live** prices for claimed banners |

Do not promote to production on modeled-only cold starts for stores you market as live.

---

## Pre-production ops (related, not listing-only)

- [ ] `KROGER_ENV=production` + daily `prices:refresh` on the app host (README)
- [x] Auth rate limits before wide open traffic — in-memory 10/min per IP on `/api/auth/login`, `/api/auth/register`, and `DELETE /api/account` (DEV login route unchanged)
- [x] Self-serve account deletion — `DELETE /api/account` + Account panel (Play / App Store requirement)
- [ ] Crash/analytics + Kroger/cache health dashboards (Phase 3 product work — still open)
- [ ] ZIP expansion only where cache is warm

---

## Related docs

- [ANDROID.md](ANDROID.md) — Capacitor run / sync / deep links  
- [DEPLOY.md](DEPLOY.md) — production Next host, env, AAB, privacy URL  
- [PRIVACY.md](PRIVACY.md) — policy draft  
- [ROADMAP.md](ROADMAP.md) — Phase 3 status  
- [QA.md](QA.md) — manual UI checklist after changes  
