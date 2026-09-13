# Dot-source before Capacitor / adb / emulator commands:
#   . .\scripts\android-env.ps1

$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
if (-not (Test-Path $sdk)) {
  Write-Error "Android SDK not found at $sdk. Install Android Studio or command-line tools."
  return
}

# Capacitor 8 / current Android Gradle Plugin need JDK 21+
foreach ($name in @("jdk-21", "jdk-17")) {
  $candidate = Join-Path $PSScriptRoot "..\.tools\$name"
  if (Test-Path (Join-Path $candidate "bin\java.exe")) {
    $env:JAVA_HOME = (Resolve-Path $candidate).Path
    $env:Path = "$(Join-Path $env:JAVA_HOME 'bin');$env:Path"
    break
  }
}

$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = @(
  (Join-Path $sdk "platform-tools"),
  (Join-Path $sdk "emulator"),
  (Join-Path $sdk "cmdline-tools\latest\bin"),
  $env:Path
) -join ";"

Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
if ($env:JAVA_HOME) { Write-Host "JAVA_HOME=$env:JAVA_HOME" }
adb version | Select-Object -First 1
Write-Host "AVDs:"
& (Join-Path $sdk "emulator\emulator.exe") -list-avds
