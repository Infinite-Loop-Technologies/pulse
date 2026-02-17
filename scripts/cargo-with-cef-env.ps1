$ErrorActionPreference = "Stop"
$CargoArgs = $args
$repoRoot = Split-Path -Parent $PSScriptRoot

function Test-IsElevatedSession {
  try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  }
  catch {
    return $false
  }
}

function Test-CompatibleCefPath {
  param(
    [string]$Path,
    [string]$RequiredBuild
  )

  if (-not $Path -or -not (Test-Path $Path)) {
    return $false
  }

  $archiveJson = Join-Path $Path "archive.json"
  if (-not (Test-Path $archiveJson)) {
    return $false
  }

  try {
    $info = Get-Content $archiveJson -Raw | ConvertFrom-Json
    if (-not $info.name) {
      return $false
    }
    return $info.name -like "*$RequiredBuild*"
  }
  catch {
    return $false
  }
}

function Sync-CefRuntimeToTarget {
  param(
    [string]$CefPath,
    [string]$TargetDir
  )

  if (-not $CefPath -or -not (Test-Path $CefPath)) {
    return
  }

  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

  $patterns = @("*.dll", "*.pak", "*.bin", "*.dat", "*.json")
  foreach ($pattern in $patterns) {
    try {
      Copy-Item -Path (Join-Path $CefPath $pattern) -Destination $TargetDir -Force -ErrorAction Stop
    }
    catch {
      Write-Host "Warning: failed copying pattern '$pattern' to '$TargetDir': $($_.Exception.Message)"
    }
  }

  $srcLocales = Join-Path $CefPath "locales"
  $dstLocales = Join-Path $TargetDir "locales"
  if (Test-Path $srcLocales) {
    Copy-Item -Path $srcLocales -Destination $dstLocales -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$requiredCefBuild = "143.0.10"
$cefCandidates = @()
if ($env:CEF_PATH -and -not [string]::IsNullOrWhiteSpace($env:CEF_PATH)) {
  $cefCandidates += $env:CEF_PATH
}
$cefCandidates += Join-Path $env:USERPROFILE ".local\\share\\cef-pulse"
$cefCandidates += Join-Path $env:USERPROFILE ".local\\share\\cef"

$compatibleCefPath = $cefCandidates |
  Select-Object -Unique |
  Where-Object { Test-CompatibleCefPath -Path $_ -RequiredBuild $requiredCefBuild } |
  Select-Object -First 1

if ($compatibleCefPath) {
  if ($env:CEF_PATH -and $env:CEF_PATH -ne $compatibleCefPath) {
    Write-Host "Switching CEF_PATH to compatible bundle: $compatibleCefPath"
  }
  $env:CEF_PATH = $compatibleCefPath
} elseif (-not $env:CEF_PATH -or [string]::IsNullOrWhiteSpace($env:CEF_PATH)) {
  Write-Host "CEF_PATH not set and no compatible local bundle found for CEF $requiredCefBuild."
  Write-Host "Continuing without CEF_PATH (cef-rs may download CEF during build)."
}

if ($env:CEF_PATH -and $env:PATH -notlike "*$($env:CEF_PATH)*") {
  $env:PATH = "$($env:PATH);$($env:CEF_PATH)"
}

if (-not $env:CMAKE_MAKE_PROGRAM -or -not (Test-Path $env:CMAKE_MAKE_PROGRAM)) {
  $candidates = @(
    (Get-Command ninja -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
    "$env:ProgramFiles\\Microsoft Visual Studio\\18\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\Ninja\\ninja.exe",
    "$env:ProgramFiles\\Microsoft Visual Studio\\18\\Preview\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\Ninja\\ninja.exe",
    "$env:ProgramFiles\\Microsoft Visual Studio\\17\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\Ninja\\ninja.exe",
    "$env:ProgramFiles\\Microsoft Visual Studio\\17\\Preview\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\Ninja\\ninja.exe"
  )

  $resolved = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $resolved) {
    throw "Could not find ninja.exe. Install Ninja or Visual Studio CMake tools."
  }

  $env:CMAKE_MAKE_PROGRAM = $resolved
  $ninjaDir = Split-Path -Parent $resolved
  if ($env:PATH -notlike "*$ninjaDir*") {
    $env:PATH = "$($env:PATH);$ninjaDir"
  }
}

if (-not $CargoArgs -or $CargoArgs.Count -eq 0) {
  throw "No cargo arguments were provided."
}

$profile = if ($CargoArgs -contains "--release") { "release" } else { "debug" }
$cargoCommand = if ($CargoArgs.Count -gt 0) { $CargoArgs[0] } else { "" }
if ($cargoCommand -in @("run", "build")) {
  if ((Test-IsElevatedSession) -and $cargoCommand -eq "run") {
    Write-Host "Notice: running from an elevated terminal. Pulse adds '--do-not-de-elevate' in debug builds so CEF can stay in this session."
  }

  if ($cargoCommand -eq "run") {
    Get-Process pulse-shell -ErrorAction SilentlyContinue | Stop-Process -Force
  }
  $targetDir = Join-Path $repoRoot "target\$profile"
  Sync-CefRuntimeToTarget -CefPath $env:CEF_PATH -TargetDir $targetDir
}

cargo @CargoArgs
if ($LASTEXITCODE -ne 0) {
  throw "Cargo command failed with exit code $LASTEXITCODE."
}
