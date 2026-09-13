# iOS / TestFlight (Capacitor)

Grocer’s iOS shell is the same **Capacitor WebView** as Android: it loads your running Next.js backend (`CAPACITOR_SERVER_URL`). API routes do **not** run offline inside the WebView.

**App ID / bundle ID:** `com.cascadialabs.grocer`  
**App name:** Grocer  
**Native project:** `ios/` (scaffolded with `@capacitor/ios` — same appId as Android)

## Windows host note

`npx cap add ios` **succeeded on Windows** and created `ios/`. You still **cannot build or run** the app here:

| Need | Why |
|------|-----|
| macOS + Xcode | Compile, Simulator, device signing |
| Apple Developer account | Device runs, TestFlight, App Store |
| CocoaPods / SPM as Xcode prompts | Native deps resolve on Mac |

On Windows: edit config/docs, `npm run cap:sync` (updates `ios/` + `android/`), then open the repo on a Mac for Xcode.

`npm run cap:open:ios` requires Xcode and will fail on Windows.

## Prerequisites (Mac)

- macOS with **Xcode** (latest stable recommended) + Command Line Tools
- [CocoaPods](https://cocoapods.org/) if Xcode/Capacitor prompts for it (`sudo gem install cocoapods` or Homebrew)
- Node.js + repo deps: `npm install`
- A reachable Grocer backend (local on the Mac, or deployed HTTPS)
- Apple Developer Program membership for device / TestFlight

## Exact Mac steps (first time or after clone)

```bash
git clone <your-grocer-remote> Grocer   # or pull latest
cd Grocer
npm install

# iOS Simulator → Next on the same Mac
export CAPACITOR_SERVER_URL=http://localhost:3000

# If ios/ is missing (older clone): npx cap add ios
npm run cap:sync          # or: npm run cap:sync:ios
npm run cap:open:ios      # opens ios/App/App.xcworkspace or .xcodeproj in Xcode
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities** → your Team.
2. Pick an iPhone Simulator (or a plugged-in device).
3. **Run** (▶).

In another terminal, start the backend if using local URL:

```bash
npm run dev
# Physical device on LAN: bind all interfaces
# npx next dev --turbopack -H 0.0.0.0
```

### If `ios/` was never generated

```bash
npm install
npx cap add ios
export CAPACITOR_SERVER_URL=http://localhost:3000
npm run cap:sync
npm run cap:open:ios
```

## Server URL

Set before sync so `capacitor.config.ts` embeds the URL into both native projects:

| Target | Example |
|--------|---------|
| iOS Simulator → host Next | `CAPACITOR_SERVER_URL=http://localhost:3000` |
| Physical device on LAN | `CAPACITOR_SERVER_URL=http://192.168.1.42:3000` (Mac’s LAN IP) |
| Deployed / staging | `CAPACITOR_SERVER_URL=https://your-host.example` |

```bash
export CAPACITOR_SERVER_URL=http://localhost:3000
npm run cap:sync
```

HTTP cleartext is enabled when the URL starts with `http://` (`server.cleartext` in Capacitor). Production should use HTTPS.

**Do not leave the Android-emulator default** (`http://10.0.2.2:3000`) when building for iOS — that alias is Android-only.

## Deep links (share paths)

| Form | Example |
|------|---------|
| Custom scheme (fallback) | `grocer://l/{shareId}` |
| HTTPS Universal Links (placeholder) | `https://grocer.example.com/l/{shareId}` |

- Custom scheme is registered in `ios/App/App/Info.plist` (`CFBundleURLTypes` → `grocer`).
- Scene URL open is wired via Capacitor’s `SceneDelegateProxy` in `SceneDelegate.swift`.
- **Universal Links:** on a Mac, add **Associated Domains** (`applinks:grocer.example.com`) in Xcode Signing & Capabilities, replace the placeholder host, and host `apple-app-site-association` (parity with Android `assetlinks.json` / `app_link_host`).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run cap:sync` | Sync **android** + **ios** after URL/config changes |
| `npm run cap:sync:ios` | Sync iOS only |
| `npm run cap:open:ios` | Open project in Xcode (**Mac only**) |

## TestFlight (later)

1. Archive in Xcode (Product → Archive) with a Distribution signing identity.
2. Upload to App Store Connect → TestFlight.
3. Fill App Store privacy notes; account deletion is self-serve via **Delete account** in the Account panel and `DELETE /api/account` (Bearer) — see [PRIVACY.md](PRIVACY.md) / [DEPLOY.md](DEPLOY.md).
4. Point `CAPACITOR_SERVER_URL` at your production HTTPS host before the release archive.

## Out of scope here

App Store listing assets and review notes remain Phase 4 follow-ups after Android closed test. **Account deletion** endpoint + in-app control are available now (see above). Android closed-test steps remain in **[`docs/ANDROID.md`](ANDROID.md)**.
