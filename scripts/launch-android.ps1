# One-shot Android launch helper (run when YOU are ready to ship).
# Prerequisites: flyctl logged in (`fly auth login` or FLY_API_TOKEN), .env.local with Kroger keys,
#                android/key.properties for signing.
#
# Usage:
#   . .\scripts\android-env.ps1
#   .\scripts\fly-deploy.ps1                    # if not yet hosted
#   .\scripts\launch-android.ps1                # Cap sync + AAB at Fly URL
#   .\scripts\launch-android.ps1 -SkipDeploy    # host already up

param(
  [string]$AppName = "cascadialabs-grocer",
  [string]$Region = "sea",
  [switch]$SkipDeploy,
  [switch]$SkipAab
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Need-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Error "Missing '$name'. Install flyctl from https://fly.io/docs/hands-on/install-flyctl/"
  }
}

Need-Cmd "flyctl"
Need-Cmd "npm"

Write-Host "== qa:launch =="
npm run qa:launch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipDeploy) {
  Write-Host "== fly deploy ($AppName / $Region) =="
  if (-not (Test-Path "fly.toml")) { Write-Error "fly.toml missing" }
  # Ensure app exists (ignore error if already created)
  flyctl apps create $AppName --org personal 2>$null
  flyctl volumes create grocer_data --region $Region --size 1 --app $AppName --yes 2>$null
  Write-Host "Set secrets from .env.local (KROGER_*), then: flyctl deploy --remote-only --app $AppName"
  Write-Host "Or run: .\scripts\fly-deploy.ps1"
  Write-Host "Example: flyctl secrets set KROGER_ENV=production KROGER_CLIENT_ID=... KROGER_CLIENT_SECRET=... --app $AppName"
  # Prefer dedicated deploy script when using default app name
  if ($AppName -eq "cascadialabs-grocer") {
    & (Join-Path $PSScriptRoot "fly-deploy.ps1")
  } else {
    flyctl deploy --remote-only --app $AppName
  }
}

$hostUrl = "https://$AppName.fly.dev"
Write-Host "== Capacitor server URL: $hostUrl =="
$env:CAPACITOR_SERVER_URL = $hostUrl

if (-not $SkipAab) {
  . (Join-Path $PSScriptRoot "android-env.ps1")
  npm run cap:sync
  npm run cap:aab
  Write-Host "AAB: android\app\build\outputs\bundle\release\app-release.aab"
  Write-Host "Upload in Play Console or run .github/workflows/play-internal.yml with secrets."
}

Write-Host "Done. Privacy: $hostUrl/privacy"
