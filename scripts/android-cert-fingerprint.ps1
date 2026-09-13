# Prints only the release cert SHA256 for Digital Asset Links.
# Usage: . .\scripts\android-env.ps1; .\scripts\android-cert-fingerprint.ps1
# Reads android/key.properties (gitignored). Never prints passwords.

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$propsPath = Join-Path $root "android\key.properties"
$ksDefault = Join-Path $root "android\keystore\grocer-release.jks"

if (-not (Test-Path $propsPath)) {
  Write-Error "Missing android/key.properties - run scripts/android-create-keystore.ps1 -LocalDev first."
}

$map = @{}
Get-Content $propsPath | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $parts = $_.Split('=', 2)
  $map[$parts[0].Trim()] = $parts[1].Trim()
}

if ($map.ContainsKey("storeFile") -and $map["storeFile"]) {
  if ([IO.Path]::IsPathRooted($map["storeFile"])) {
    $ks = $map["storeFile"]
  } else {
    $ks = Join-Path (Join-Path $root "android\app") $map["storeFile"]
  }
} else {
  $ks = $ksDefault
}

$javaHome = $env:JAVA_HOME
if (-not $javaHome) {
  $cand = Join-Path $root ".tools\jdk-21"
  if (Test-Path (Join-Path $cand "bin\keytool.exe")) { $javaHome = $cand }
}
$keytool = Join-Path $javaHome "bin\keytool.exe"
if (-not (Test-Path $keytool)) {
  Write-Error "keytool not found. Set JAVA_HOME or install JDK 21 under .tools/jdk-21."
}

$alias = $map["keyAlias"]
$storePass = $map["storePassword"]
$out = & $keytool -list -v -keystore $ks -alias $alias -storepass $storePass 2>&1 | Out-String
$pattern = "SHA256:" + "\s*" + "([0-9A-Fa-f:]+)"
$m = [regex]::Match($out, $pattern)
if (-not $m.Success) {
  Write-Error "Could not parse SHA256 from keytool output."
}
Write-Output $m.Groups[1].Value
