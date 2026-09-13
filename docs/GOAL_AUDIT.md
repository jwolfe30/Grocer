# Goal completion audit — Android then iOS

Generated against the active objective. **Do not treat this as goal complete.**

## Objective requirements → evidence

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Phase 0 durable DB | **Met** | `src/lib/app-db.ts`, `data/app.sqlite` local; on `master` |
| Phase 0 live prices + cache | **Met** | `price-db.ts`, `prices:refresh`, live-first `optimize.ts`; E2E 9/9 FM/QFC live |
| Phase 0 auth hardened enough for MVP | **Partial** | Durable sessions + scrypt + rate limit; not full OAuth/IdP |
| Phase 1 product loop | **Met** | Coupons, shop, deals, receipts, share, account delete |
| Phase 2 Android Capacitor + closed test | **Met (emulator)** | APK on emulator; AAB prerelease; human in-store pending |
| Phase 3 public Play launch | **Blocked** | Artifacts ready; needs HTTPS host + Play Console |
| Phase 4 iOS | **Scaffold only** | `ios/` + docs; needs Mac/Xcode/TestFlight |
| Launch bar: mostly real prices | **Met for FM/QFC** | Live-first ranking + warm cache; non-Kroger default exclude |

## Hard blockers (agent cannot finish alone)

1. **Fly / HTTPS host** — `flyctl` installed; **no `FLY_API_TOKEN` / interactive login completed**. Unlock: add GitHub secret `FLY_API_TOKEN` and run workflow `fly-deploy`, or `flyctl auth login` + `.\scripts\fly-deploy.ps1`.
2. **Play Console** — upload AAB from [prerelease](https://github.com/jwolfe30/Grocer/releases/tag/android-closed-test-1) or `npm run cap:aab` after Cap points at HTTPS.
3. **Mac** — TestFlight / App Store.

## Unlock checklist (shortest path)

1. Create Fly token → GitHub repo secret `FLY_API_TOKEN`
2. Actions → **fly-deploy** → Run workflow
3. `$env:CAPACITOR_SERVER_URL='https://cascadialabs-grocer.fly.dev'; npm run cap:sync; npm run cap:aab`
4. Play Console internal track upload
5. Mac: `docs/IOS.md`

Until 1–4 succeed, **Android is not publicly launched**. Until 5, **iOS is not launched**.
