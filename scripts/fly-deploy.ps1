# Completes Fly deploy once authenticated.
# Prerequisite (pick one):
#   1) In an interactive terminal: flyctl auth login
#   2) Or set $env:FLY_API_TOKEN from https://fly.io/user/personal_access_tokens
#
# Usage (from repo root):
#   . .\scripts\android-env.ps1   # optional
#   .\scripts\fly-deploy.ps1

$ErrorActionPreference = "Stop"
$env:Path = "$env:USERPROFILE\.fly\bin;$env:Path"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not (Get-Command flyctl -ErrorAction SilentlyContinue)) {
  Write-Error "flyctl not found. Install from https://fly.io/docs/hands-on/install-flyctl/"
}

flyctl auth whoami | Out-Host

$app = "cascadialabs-grocer"
$region = "sea"

# Ensure app exists
$apps = flyctl apps list --json 2>$null | ConvertFrom-Json
$exists = $apps | Where-Object { $_.Name -eq $app }
if (-not $exists) {
  Write-Host "Creating app $app ..."
  flyctl apps create $app --org personal 2>&1 | Out-Host
}

# Volume
$vols = flyctl volumes list -a $app --json 2>$null | ConvertFrom-Json
$hasVol = $vols | Where-Object { $_.Name -eq "grocer_data" }
if (-not $hasVol) {
  Write-Host "Creating volume grocer_data in $region ..."
  flyctl volumes create grocer_data --region $region --size 1 -a $app -y 2>&1 | Out-Host
}

Write-Host "Deploying (set Kroger secrets first if needed: flyctl secrets set -a $app KROGER_...) ..."
flyctl deploy -a $app --remote-only 2>&1 | Out-Host

Write-Host ""
Write-Host "App URL: https://$app.fly.dev"
Write-Host "Next: `$env:CAPACITOR_SERVER_URL = 'https://$app.fly.dev'; npm run cap:sync; npm run cap:aab"
