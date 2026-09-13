# Create a local Android release upload keystore + android/key.properties (gitignored).
# Never commit the .jks / .keystore or key.properties.
#
# Usage:
#   .\scripts\android-create-keystore.ps1              # interactive (or env vars)
#   .\scripts\android-create-keystore.ps1 -LocalDev    # non-interactive local/dev passwords
#
# Env (optional; skip prompts when set):
#   GROCER_KEYSTORE_PATH, GROCER_KEYSTORE_PASSWORD, GROCER_KEY_ALIAS, GROCER_KEY_PASSWORD
#   GROCER_KEY_CN (distinguished name CN; default Grocer Upload)

param(
  [switch]$LocalDev,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$androidDir = Join-Path $repoRoot "android"
$defaultStore = Join-Path $androidDir "keystore\grocer-release.jks"
$propsPath = Join-Path $androidDir "key.properties"

# Prefer repo JDK 21 (same as android-env.ps1)
$keytool = $null
foreach ($name in @("jdk-21", "jdk-17")) {
  $candidate = Join-Path $repoRoot ".tools\$name\bin\keytool.exe"
  if (Test-Path $candidate) {
    $keytool = $candidate
    break
  }
}
if (-not $keytool) {
  $fromPath = Get-Command keytool -ErrorAction SilentlyContinue
  if ($fromPath) { $keytool = $fromPath.Source }
}
if (-not $keytool) {
  Write-Error "keytool not found. Install JDK 21 under .tools\jdk-21 or put keytool on PATH."
}

function Read-Secret([string]$prompt, [string]$envName, [string]$defaultValue) {
  $fromEnv = [Environment]::GetEnvironmentVariable($envName)
  if (-not [string]::IsNullOrWhiteSpace($fromEnv)) { return $fromEnv }
  if ($LocalDev -and -not [string]::IsNullOrWhiteSpace($defaultValue)) { return $defaultValue }
  $secure = Read-Host -Prompt $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$storePath = $env:GROCER_KEYSTORE_PATH
if ([string]::IsNullOrWhiteSpace($storePath)) {
  if ($LocalDev) {
    $storePath = $defaultStore
  } else {
    $entered = Read-Host "Keystore path [$defaultStore]"
    $storePath = if ([string]::IsNullOrWhiteSpace($entered)) { $defaultStore } else { $entered }
  }
}
$storePath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($storePath)

$alias = $env:GROCER_KEY_ALIAS
if ([string]::IsNullOrWhiteSpace($alias)) {
  if ($LocalDev) { $alias = "grocer" }
  else {
    $entered = Read-Host "Key alias [grocer]"
    $alias = if ([string]::IsNullOrWhiteSpace($entered)) { "grocer" } else { $entered }
  }
}

$storePassword = Read-Secret "Keystore password" "GROCER_KEYSTORE_PASSWORD" "grocer-local-dev"
$keyPassword = Read-Secret "Key password (often same as keystore)" "GROCER_KEY_PASSWORD" $storePassword
if ([string]::IsNullOrWhiteSpace($keyPassword)) { $keyPassword = $storePassword }

$cn = $env:GROCER_KEY_CN
if ([string]::IsNullOrWhiteSpace($cn)) { $cn = "Grocer Upload" }
$dname = "CN=$cn, OU=Grocer, O=Cascadia Labs, L=Unknown, ST=Unknown, C=US"

if ((Test-Path $storePath) -and -not $Force) {
  Write-Host "Keystore already exists: $storePath"
  Write-Host "Pass -Force to recreate, or delete the file first."
} else {
  $dir = Split-Path -Parent $storePath
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
  }
  if (Test-Path $storePath) { Remove-Item -Force $storePath }

  Write-Host "Generating keystore with: $keytool"
  & $keytool -genkeypair `
    -v `
    -keystore $storePath `
    -alias $alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storepass $storePassword `
    -keypass $keyPassword `
    -dname $dname
  if ($LASTEXITCODE -ne 0) {
    Write-Error "keytool failed with exit code $LASTEXITCODE"
  }
  Write-Host "Wrote $storePath"
}

# Paths in key.properties: absolute is safest for Gradle; relative to android/ also works.
$storePathForProps = $storePath.Replace("\", "/")
@"
storeFile=$storePathForProps
storePassword=$storePassword
keyAlias=$alias
keyPassword=$keyPassword
"@ | Set-Content -Path $propsPath -Encoding ascii

Write-Host "Wrote $propsPath (gitignored)"
Write-Host ""
Write-Host "Gradle / CI can also use env vars instead of key.properties:"
Write-Host "  GROCER_KEYSTORE_PATH"
Write-Host "  GROCER_KEYSTORE_PASSWORD"
Write-Host "  GROCER_KEY_ALIAS"
Write-Host "  GROCER_KEY_PASSWORD"
Write-Host ""
Write-Host "Build AAB:  npm run cap:aab"
Write-Host "       or:  cd android; .\gradlew.bat bundleRelease"
if ($LocalDev) {
  Write-Host ""
  Write-Host "LocalDev passwords are for this machine only - back up a real upload key before Play production."
}
