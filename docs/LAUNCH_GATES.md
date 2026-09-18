# Launch gates — what agents finished vs what still needs a human

Last updated with roadmap execution toward **Android then iOS**.

## Launch bar (prices)

| Gate | Evidence |
|------|----------|
| Durable price cache + daily refresh | `data/prices.sqlite`, `npm run prices:refresh` |
| Live-first plan ranking | `src/lib/optimize.ts`; E2E showed majority/all live on FM/QFC |
| Non-Kroger excluded by default | Store picker defaults |
| Warm coverage | 9/9 Kroger banners after refresh |

## Phase 0–2 (code complete on this machine)

- Durable `data/app.sqlite` (lists/users/sessions/receipts)
- Capacitor Android `com.cascadialabs.grocer`, emulator APK, WebView polyfill
- Coupon picker, shop mode, deals, receipt photo path, account delete

## Phase 3 — upload-ready artifacts

| Artifact | Path |
|----------|------|
| Release AAB | `android/app/build/outputs/bundle/release/app-release.aab` (`npm run cap:aab`) |
| Screenshots | `docs/play-screenshots/` |
| Icon / feature graphic | `docs/play-assets/` |
| Privacy | `/privacy`, `docs/PRIVACY.md` |
| Listing copy | `docs/PLAY_STORE.md` |
| Host | `Dockerfile` + `docker-compose.yml`, **or Fly.io** (`fly.toml` + volume at `/app/data`) — see [`DEPLOY.md`](DEPLOY.md) |
| App Links stub | `public/.well-known/assetlinks.json` — fill SHA256 via `scripts/android-cert-fingerprint.ps1` |
| Launch checklist | `npm run qa:launch` |
| Play internal CI | `.github/workflows/play-internal.yml` (manual; needs signing secrets) |

## Cost ballpark (launch)

| Item | Typical cost |
|------|----------------|
| Fly.io (256MB shared + 1GB volume) | ~**$2–5 / mo** after short free trial (card required to keep running) |
| Google Play developer | **$25 once** |
| Apple Developer (iOS later) | **$99 / year** |
| GitHub + Kroger API | **$0** for normal early usage |

See [Fly pricing](https://fly.io/pricing) and [Play registration](https://support.google.com/googleplay/android-developer/answer/6112435).

## Still requires you (cannot finish in-agent)

1. **HTTPS production host** with persistent `data/` — prefer **Fly.io remote builder** from Windows (no local Docker Desktop). `flyctl` is installed locally but **this agent shell cannot run interactive `fly auth login`**. In your own terminal:

```powershell
.\scripts\unlock-fly.ps1
# or:
$env:Path = "$env:USERPROFILE\.fly\bin;$env:Path"
flyctl auth login
.\scripts\fly-deploy.ps1
```

Or set `$env:FLY_API_TOKEN` from https://fly.io/user/personal_access_tokens then run `.\scripts\fly-deploy.ps1`. See [`DEPLOY.md`](DEPLOY.md). Docker Compose remains fine if you have Docker. Vercel is ephemeral for SQLite.
2. **Play Console** — create app, upload AAB ([prerelease](https://github.com/jwolfe30/Grocer/releases/tag/android-closed-test-1) or `npm run cap:aab`), attach screenshots/assets, Data safety form, roll out internal → production. Optional: wire secrets and run `play-internal` workflow.
3. **Production Kroger credentials** (`KROGER_ENV=production` + Production Public app keys) on that host.
4. **Replace** placeholder privacy email / App Links host / `assetlinks` fingerprint after upload key is final.
5. **Mac + Xcode** for Phase 4 TestFlight (`docs/IOS.md`).
6. Optional: human in-store trip sign-off (Phase 2 exit).

**Repo:** launch stack is on `origin/master` (`2aa724d`). AAB prerelease: https://github.com/jwolfe30/Grocer/releases/tag/android-closed-test-1

## Suggested next commands (you)

```powershell
# Host without local Docker — Fly.io (interactive login)
fly auth login
fly volumes create grocer_data --region sea --size 1
fly secrets set KROGER_ENV=production KROGER_CLIENT_ID=... KROGER_CLIENT_SECRET=...
fly deploy

# Or Docker Compose when Desktop/daemon is available
docker compose up --build -d

# Point store build at HTTPS
$env:CAPACITOR_SERVER_URL = "https://<app>.fly.dev"   # or your host
npm run cap:sync
npm run cap:aab

# Fingerprint for assetlinks.json
. .\scripts\android-env.ps1
.\scripts\android-cert-fingerprint.ps1

# File presence checklist
npm run qa:launch
```

Until (1)+(2) land, Android is **not** publicly launched. Until (5), iOS is scaffold-only.

See also: [`ROADMAP.md`](ROADMAP.md), [`DEPLOY.md`](DEPLOY.md), [`PLAY_STORE.md`](PLAY_STORE.md), [`IOS.md`](IOS.md).
