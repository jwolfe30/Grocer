# Android closed test (Capacitor)

Grocer’s Android shell is a **Capacitor WebView** that loads your running Next.js backend (`CAPACITOR_SERVER_URL`). API routes do **not** run offline inside the WebView — start `npm run dev` or point at a deployed host.

**App ID:** `com.cascadialabs.grocer`  
**App name:** Grocer

## Prerequisites

- Android SDK (Android Studio **or** SDK + emulator already under `%LOCALAPPDATA%\Android\Sdk`)
- JDK 17+ (Android Studio’s bundled JDK is fine)
- Node.js + repo deps: `npm install`
- A reachable Grocer backend (local or hosted)

### Environment (Windows)

```powershell
. .\scripts\android-env.ps1   # sets ANDROID_HOME + puts adb/emulator on PATH
```

**Known host gaps (closed-test blockers if present):**

| Check | Notes |
|-------|--------|
| `ANDROID_HOME` | Point at `%LOCALAPPDATA%\Android\Sdk` (script sets this) |
| JDK **17+** | `sdkmanager` / Gradle need class file 61+; Java 8 is not enough |
| Complete system image | Emulator needs `system.img` under `system-images\android-34\...\x86_64\` — incomplete packages fail with “No initial system image” |
| AVD | Device Manager in Android Studio, or AVD name `Grocer_API_34` |

Fastest fix on a fresh machine: install [Android Studio](https://developer.android.com/studio), open SDK Manager → install Platform 34 + Google APIs system image + create a Pixel AVD, then re-run the steps below.

## Server URL

Set before sync so `capacitor.config.ts` embeds the URL into the Android project:

| Target | Example |
|--------|---------|
| Android emulator → host Next | `CAPACITOR_SERVER_URL=http://10.0.2.2:3000` (default) |
| Physical device on LAN | `CAPACITOR_SERVER_URL=http://192.168.1.42:3000` (your PC’s LAN IP) |
| Deployed / staging | `CAPACITOR_SERVER_URL=https://your-host.example` |

PowerShell example:

```powershell
$env:CAPACITOR_SERVER_URL = "http://10.0.2.2:3000"
npm run cap:sync
```

HTTP cleartext is enabled automatically when the URL starts with `http://`. Production should use HTTPS.

## Run on emulator / device

1. Start the web backend (if using local):

   ```bash
   npm run dev
   ```

2. Sync native project:

   ```bash
   npm run cap:sync
   ```

3. Open Android Studio:

   ```bash
   npm run cap:open:android
   ```

4. In Android Studio: pick an emulator or device → **Run** (▶).

   Or from the CLI (device/emulator already running):

   ```bash
   npm run cap:android
   ```

5. Confirm the WebView loads Grocer (list / stores / optimize). If you see the `www` placeholder page, the server URL is wrong or the backend is down — fix `CAPACITOR_SERVER_URL`, re-sync, rebuild.

### Emulator networking tip

`10.0.2.2` is the emulator’s alias for the host loopback. Ensure Windows Firewall allows inbound Node on port 3000 if the device cannot connect.

### Physical device tip

Phone and PC must be on the same LAN. Use the PC’s IPv4 address, not `localhost`. Next may need `-H 0.0.0.0` if it only binds to loopback:

```bash
npx next dev --turbopack -H 0.0.0.0
```

## Deep links (share paths)

| Form | Example |
|------|---------|
| Custom scheme (fallback) | `grocer://l/{shareId}` |
| HTTPS App Links (placeholder host) | `https://grocer.example.com/l/{shareId}` |

- Intent filters live in `android/app/src/main/AndroidManifest.xml`.
- Placeholder host string: `android/app/src/main/res/values/strings.xml` → `app_link_host` (replace before production).
- Verified App Links: host [`public/.well-known/assetlinks.json`](../public/.well-known/assetlinks.json) at `https://<app_link_host>/.well-known/assetlinks.json` (same origin as `CAPACITOR_SERVER_URL`).

### Fill `sha256_cert_fingerprints`

1. Create/back up the release keystore (never commit) — see [`PLAY_STORE.md`](PLAY_STORE.md).
2. Print the cert fingerprint:

   ```bash
   keytool -list -v -keystore android/keystore/grocer-release.jks
   ```

3. Copy the **SHA-256** fingerprint into `public/.well-known/assetlinks.json` (replace `REPLACE_WITH_RELEASE_KEYSTORE_SHA256`).
4. Deploy the Next host so the file is public over HTTPS, then verify with Google’s [Statement List Generator](https://developers.google.com/digital-asset-links/tools/generator) or:

   ```bash
   curl -sS "https://<app_link_host>/.well-known/assetlinks.json"
   ```

If Play App Signing holds the app signing key, add that cert’s SHA-256 from Play Console → App integrity (upload-key-only fingerprints will not verify production installs).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run cap:sync` | Copy web config + sync Android |
| `npm run cap:open:android` | Open project in Android Studio |
| `npm run cap:android` | Build/run on a connected target |

## Out of scope here

Play Store listing drafts, Data safety mapping, and privacy policy prep: **[`docs/PLAY_STORE.md`](PLAY_STORE.md)** + **[`docs/PRIVACY.md`](PRIVACY.md)**. Closed/open/production tracks and crash/analytics dashboards remain Phase 3 after a device run.
