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

function Get-CefRuntimeFromCargoBuildOut {
  param(
    [string]$TargetDir
  )

  $buildDir = Join-Path $TargetDir "build"
  if (-not (Test-Path $buildDir)) {
    return $null
  }

  $libcef = Get-ChildItem -Path $buildDir -Recurse -Filter "libcef.dll" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*cef-dll-sys*" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $libcef) {
    return $null
  }

  return $libcef.Directory.FullName
}

function Ensure-CefRuntimeInTarget {
  param(
    [string]$TargetDir
  )

  $targetLibCef = Join-Path $TargetDir "libcef.dll"
  if (Test-Path $targetLibCef) {
    return
  }

  $runtimeSource = $null
  if ($env:CEF_PATH -and (Test-Path (Join-Path $env:CEF_PATH "libcef.dll"))) {
    $runtimeSource = $env:CEF_PATH
  }

  if (-not $runtimeSource) {
    $runtimeSource = Get-CefRuntimeFromCargoBuildOut -TargetDir $TargetDir
  }

  if (-not $runtimeSource) {
    throw @"
CEF runtime files were not found after the cargo build.
Expected 'libcef.dll' in '$TargetDir' or in Cargo build output under '$TargetDir\\build\\cef-dll-sys-*\\out'.
Set CEF_PATH to a valid CEF runtime directory if automatic discovery fails.
"@
  }

  Write-Host "Syncing CEF runtime from '$runtimeSource' to '$TargetDir'..."
  Sync-CefRuntimeToTarget -CefPath $runtimeSource -TargetDir $TargetDir

  if (-not (Test-Path $targetLibCef)) {
    throw "CEF runtime sync failed. Missing '$targetLibCef'."
  }
}

function Get-VsDevCmdPath {
  if ($env:VSDEVCMD_BAT -and (Test-Path $env:VSDEVCMD_BAT)) {
    return $env:VSDEVCMD_BAT
  }

  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\\Installer\\vswhere.exe"
  if (Test-Path $vswhere) {
    try {
      $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
      if ($installPath) {
        $candidate = Join-Path $installPath "Common7\\Tools\\VsDevCmd.bat"
        if (Test-Path $candidate) {
          return $candidate
        }
      }
    }
    catch {
      # Fall through to static candidates.
    }
  }

  $candidates = @(
    "$env:ProgramFiles\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat",
    "$env:ProgramFiles\\Microsoft Visual Studio\\2022\\Community\\Common7\\Tools\\VsDevCmd.bat",
    "$env:ProgramFiles\\Microsoft Visual Studio\\2022\\Professional\\Common7\\Tools\\VsDevCmd.bat",
    "$env:ProgramFiles\\Microsoft Visual Studio\\2022\\Enterprise\\Common7\\Tools\\VsDevCmd.bat",
    "$env:ProgramFiles\\Microsoft Visual Studio\\2022\\Preview\\Common7\\Tools\\VsDevCmd.bat",
    "$env:ProgramFiles\\Microsoft Visual Studio\\2019\\BuildTools\\Common7\\Tools\\VsDevCmd.bat",
    "$env:ProgramFiles\\Microsoft Visual Studio\\2019\\Community\\Common7\\Tools\\VsDevCmd.bat"
  )

  return $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

function Import-BatchEnvironment {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BatchPath,
    [string]$BatchArgs = ""
  )

  if (-not (Test-Path $BatchPath)) {
    throw "Batch file not found: $BatchPath"
  }

  $command = if ([string]::IsNullOrWhiteSpace($BatchArgs)) {
    "call `"$BatchPath`" >nul && set"
  } else {
    "call `"$BatchPath`" $BatchArgs >nul && set"
  }

  $lines = & cmd.exe /d /s /c $command
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to execute '$BatchPath'."
  }

  foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }
    $separatorIndex = $line.IndexOf("=")
    if ($separatorIndex -le 0) {
      continue
    }
    $name = $line.Substring(0, $separatorIndex)
    $value = $line.Substring($separatorIndex + 1)
    Set-Item -Path "Env:$name" -Value $value
  }
}

function Ensure-MsvcToolchain {
  $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
  $link = Get-Command link.exe -ErrorAction SilentlyContinue
  if ($cl -and $link) {
    return
  }

  $vsDevCmd = Get-VsDevCmdPath
  if (-not $vsDevCmd) {
    throw @"
MSVC toolchain not found (missing cl.exe/link.exe).
Install Visual Studio Build Tools 2022 with:
- Workload: Desktop development with C++
- Component: MSVC v143 - VS 2022 C++ x64/x86 build tools
- Component: Windows 10/11 SDK
"@
  }

  Write-Host "Loading MSVC toolchain from '$vsDevCmd'..."
  Import-BatchEnvironment -BatchPath $vsDevCmd -BatchArgs "-no_logo -arch=x64 -host_arch=x64"

  $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
  $link = Get-Command link.exe -ErrorAction SilentlyContinue
  if (-not $cl -or -not $link) {
    throw "MSVC toolchain initialization failed. cl.exe or link.exe is still unavailable."
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

Ensure-MsvcToolchain

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

if ($cargoCommand -in @("run", "build")) {
  $targetDir = Join-Path $repoRoot "target\$profile"
  Ensure-CefRuntimeInTarget -TargetDir $targetDir
}
