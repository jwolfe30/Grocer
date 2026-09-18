# Interactive unlock: Fly HTTPS host for Grocer Android launch.
# Run in YOUR terminal (needs interactive stdin + browser). Agent shells cannot do this.
#
# What it does:
#   1) Opens Fly token page + GitHub Actions secrets page
#   2) Prompts you to paste FLY_API_TOKEN
#   3) Sets repo secret FLY_API_TOKEN and runs workflow fly-deploy
#   4) Prints Cap / AAB next steps when deploy succeeds
#
# Usage (from repo root):
#   .\scripts\unlock-fly.ps1
#
# After deploy, set live Kroger on Fly yourself (values stay local):
#   flyctl secrets set -a cascadialabs-grocer KROGER_ENV=production KROGER_CLIENT_ID=... KROGER_CLIENT_SECRET=...

$ErrorActionPreference = "Stop"
$env:Path = "$env:USERPROFILE\.fly\bin;$env:LOCALAPPDATA\Programs\gh;$env:Path"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Error "gh CLI not found. Install: https://cli.github.com/"
}

Write-Host ""
Write-Host "=== Grocer Fly unlock ==="
Write-Host "1. Sign in to Fly if needed, create a personal access token."
Write-Host "2. Paste the token below (stored only as GitHub Actions secret FLY_API_TOKEN)."
Write-Host ""

Start-Process "https://fly.io/user/personal_access_tokens"
Start-Sleep -Seconds 1
Start-Process "https://github.com/jwolfe30/Grocer/settings/secrets/actions"

$secure = Read-Host "Paste FLY_API_TOKEN" -AsSecureString
$BSTR = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($BSTR)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR) | Out-Null
}

if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Error "Empty token — aborting."
}

Write-Host "Setting GitHub Actions secret FLY_API_TOKEN ..."
$token | gh secret set FLY_API_TOKEN --repo jwolfe30/Grocer
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Triggering fly-deploy workflow ..."
gh workflow run fly-deploy.yml --repo jwolfe30/Grocer
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Waiting for workflow run ..."
Start-Sleep -Seconds 5
$runId = gh run list --workflow=fly-deploy.yml --repo jwolfe30/Grocer --limit 1 --json databaseId --jq ".[0].databaseId"
if (-not $runId) { Write-Error "Could not find workflow run id" }

gh run watch $runId --repo jwolfe30/Grocer --exit-status
if ($LASTEXITCODE -ne 0) {
  Write-Host "Deploy failed — check: gh run view $runId --log"
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Deploy workflow finished. Verify:"
Write-Host "  https://cascadialabs-grocer.fly.dev/"
Write-Host "  https://cascadialabs-grocer.fly.dev/privacy"
Write-Host ""
Write-Host "Next (Android HTTPS AAB):"
Write-Host "  . .\scripts\android-env.ps1"
Write-Host "  .\scripts\launch-android.ps1 -SkipDeploy"
Write-Host "Then upload android\app\build\outputs\bundle\release\app-release.aab in Play Console."
Write-Host ""
Write-Host "Optional live Kroger on Fly (from your .env.local values):"
Write-Host "  flyctl secrets set -a cascadialabs-grocer KROGER_ENV=production KROGER_CLIENT_ID=... KROGER_CLIENT_SECRET=..."
