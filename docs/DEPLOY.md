# Deploy — production Next host

How to run Grocer’s Next.js backend in production and point the Capacitor Android shell at it. Secrets stay in host env / `.env.local` — never commit them.

## 1. Run Next in production

### Docker Compose (preferred v1 host)

Long-lived Node container with **SQLite on a host volume** (`./data` → `/app/data`). No image registry push required — build and run on the host.

```bash
# From repo root. Copy .env.example → .env.local and fill secrets (gitignored).
mkdir -p data
docker compose up --build -d
```

- App: `http://localhost:3000` (or the host’s LAN IP / public IP behind a reverse proxy)
- Persist: `data/app.sqlite` and `data/prices.sqlite` on the host via the `./data` mount
- Env: Compose loads `.env.local` when present; you can also export vars / use a process manager env file. **Never commit secrets.**

Rebuild after code changes: `docker compose up --build -d`.

Ops on the same volume (from host, with Node, or `docker compose exec grocer …`):

```bash
npm run prices:refresh
npm run prices:stats
```

### HTTPS reverse proxy (optional Caddy)

Terminate TLS in front of port 3000. Example `Caddyfile`:

```caddy
grocer.example.com {
  reverse_proxy localhost:3000
}
```

Point DNS at the host, then set `CAPACITOR_SERVER_URL=https://grocer.example.com` and re-sync Capacitor. Serve Digital Asset Links at `https://grocer.example.com/.well-known/assetlinks.json` (see below).

### Node (self-hosted, no Docker)

```bash
npm install
# Copy .env.example → .env.local (or set process env) and fill secrets
npm run build
npm run start
```

`npm run start` serves the production build (default port **3000**). Put HTTPS in front (Caddy, nginx, Cloudflare, load balancer). Bind `0.0.0.0` if devices on the LAN must reach the host.

### Fly.io (recommended when Docker Desktop is unavailable)

Remote builder works from **Windows** — you do not need local Docker Desktop. The app uses the repo [`Dockerfile`](../Dockerfile) and a **persistent volume** mounted at `/app/data` for SQLite (`APP_DB_PATH`, `PRICE_CACHE_PATH`).

Example config is committed as [`fly.toml`](../fly.toml) (no secrets):

```toml
app = 'grocer'
primary_region = 'sea'

[build]
  dockerfile = 'Dockerfile'

[env]
  NODE_ENV = 'production'
  HOSTNAME = '0.0.0.0'
  PORT = '3000'
  APP_DB_PATH = '/app/data/app.sqlite'
  PRICE_CACHE_PATH = '/app/data/prices.sqlite'

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 1
  processes = ['app']

[[mounts]]
  source = 'grocer_data'
  destination = '/app/data'

[[vm]]
  memory = '512mb'
  cpu_kind = 'shared'
  cpus = 1
```

Steps (run on your machine — requires interactive login):

```powershell
# 1. Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly version

# 2. Log in (browser)
fly auth login

# 3. Create / attach app (first time). Accept the Dockerfile; skip local Docker.
#    If fly.toml already exists, `fly launch` can reuse it or `fly apps create`.
fly launch
# Or, if the app name in fly.toml is free:
#   fly apps create grocer

# 4. Persistent volume for SQLite (region must match primary_region)
fly volumes create grocer_data --region sea --size 1

# 5. Secrets (never commit). Match .env.example / production Kroger app:
fly secrets set `
  KROGER_ENV=production `
  KROGER_CLIENT_ID=... `
  KROGER_CLIENT_SECRET=... `
  KROGER_LOCATION_ID=70100053 `
  KROGER_ZIP=98042
# Add any other keys you use in production the same way.

# 6. Deploy (remote builder)
fly deploy
```

After deploy:

- App URL: `https://<app>.fly.dev` (or your custom domain)
- Privacy: `https://<app>.fly.dev/privacy`
- Asset Links: `https://<app>.fly.dev/.well-known/assetlinks.json`

Point Capacitor at Fly, then rebuild the store AAB:

```powershell
$env:CAPACITOR_SERVER_URL = "https://<app>.fly.dev"
npm run cap:sync
npm run cap:aab
```

Ops on the volume (after deploy): schedule `npm run prices:refresh` on a machine that can reach the same SQLite, or `fly ssh console` and run refresh there so `data/prices.sqlite` stays warm.

### Vercel (notes)

- Connect the repo and set the same env vars from [`.env.example`](../.env.example).
- **SQLite caveat:** Vercel’s serverless filesystem is ephemeral. Durable `APP_DB_PATH` / `PRICE_CACHE_PATH` need a persistent volume, external DB, or a long-lived Node host. Prefer **Fly.io** (volume), Docker Compose, or a VPS with a mounted `data/` directory for v1 unless you migrate storage.
- After deploy, privacy policy is at `https://<your-host>/privacy`.

## 2. Env vars (from `.env.example`)

| Variable | Purpose |
|----------|---------|
| `KROGER_ENV` | `production` for live FM/QFC (`api.kroger.com`); Cert keys **401** on prod |
| `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` | Matching Production Public app credentials |
| `KROGER_LOCATION_ID` / `KROGER_ZIP` | Optional primary location + ZIP |
| `APP_DB_PATH` | Lists/users/sessions/receipts SQLite (default `data/app.sqlite`) |
| `PRICE_CACHE_PATH` | Price observations SQLite (default `data/prices.sqlite`) |
| `PRICE_CACHE_MAX_AGE_HOURS` | Align with daily refresh (default `24`) |
| `CAPACITOR_SERVER_URL` | HTTPS origin the Android/iOS WebView loads |

Ops: schedule `npm run prices:refresh` on the host that owns `data/prices.sqlite`; verify with `npm run prices:stats` and `npm run prices:refresh:check`. See README “Production launch checklist.”

## 3. Point Capacitor at production HTTPS

```powershell
$env:CAPACITOR_SERVER_URL = "https://your-host.example"
npm run cap:sync
npm run cap:aab
```

Upload `android/app/build/outputs/bundle/release/app-release.aab` in Play Console. Do **not** ship emulator `http://10.0.2.2:3000` in a store build.

## 4. Android App Links (`assetlinks.json`)

Template (committed placeholder): [`public/.well-known/assetlinks.json`](../public/.well-known/assetlinks.json)

Must be reachable at:

`https://<your-host>/.well-known/assetlinks.json`

Package: `com.cascadialabs.grocer`. Replace `REPLACE_WITH_RELEASE_KEYSTORE_SHA256` with the release cert fingerprint:

```bash
keytool -list -v -keystore android/keystore/grocer-release.jks
```

Use the **SHA-256** line (colon-separated). If Play App Signing is enabled, also add the **App signing key** SHA-256 from Play Console → App integrity. Align `app_link_host` in Android strings with this host — see [`ANDROID.md`](ANDROID.md).

## 5. Privacy URL for store listings

Once the host is live:

`https://<your-host>/privacy`

Use that URL in Play Console / App Store Connect. Source draft: [`PRIVACY.md`](PRIVACY.md).

## 6. Account deletion (store requirement)

Signed-in users can delete via **Account → Delete account**, or:

`DELETE /api/account` with `Authorization: Bearer <session-token>`

Removes the user, sessions, owned lists, receipts, crowd observations for that user, and sale alerts. Rate-limited like auth (10/min per IP). Documented for Play / App Store in [`PLAY_STORE.md`](PLAY_STORE.md) and [`IOS.md`](IOS.md).

## 7. Play internal upload (optional CI)

Template workflow: [`.github/workflows/play-internal.yml`](../.github/workflows/play-internal.yml) (`workflow_dispatch` only, `ubuntu-latest`). Soft-skips when signing secrets are missing (same idea as `prices-refresh.yml`).

Repo secrets for a signed build:

- `GROCER_KEYSTORE_BASE64`, `GROCER_KEYSTORE_PASSWORD`, `GROCER_KEY_ALIAS`, `GROCER_KEY_PASSWORD`
- Optional `PLAY_SERVICE_ACCOUNT_JSON` → upload to Play **internal** track via `r0adkll/upload-google-play`

Prefer local `npm run cap:aab` if CI Android builds are flaky; the workflow also accepts a `prebuilt_aab_path` input.

## Related

- [`LAUNCH_GATES.md`](LAUNCH_GATES.md) — human vs automated gates; `npm run qa:launch`
- [`ANDROID.md`](ANDROID.md) — Capacitor / emulator / AAB
- [`PLAY_STORE.md`](PLAY_STORE.md) — listing + Data safety
- [`ROADMAP.md`](ROADMAP.md) — Phase 3 status
- [`.env.example`](../.env.example) — full env comments
