param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$PackId = "Pulse",
  [string]$PackTitle = "Pulse",
  [string]$PackAuthors = "Pulse Contributors",
  [string]$Channel = "win",
  [string]$MainExe = "pulse-shell.exe",
  [string]$Framework = "vcredist143-x64",
  [string]$IconPath = "heartbeat.ico",
  [string]$GitHubRepo = "",
  [string]$GitHubToken = "",
  [string]$GitHubReleaseTag = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $repoRoot "target/release"
$uiDistDir = Join-Path $repoRoot "apps/ui/dist"
$stagingRoot = Join-Path $repoRoot "target/velopack"
$packDir = Join-Path $stagingRoot "payload"
$outputDir = Join-Path $stagingRoot "releases"
$iconFile = Join-Path $repoRoot $IconPath

if (-not (Get-Command vpk -ErrorAction SilentlyContinue)) {
  throw "vpk CLI was not found on PATH. Install Velopack CLI first."
}

if (-not (Test-Path (Join-Path $releaseDir $MainExe))) {
  throw "Missing release executable '$MainExe' at '$releaseDir'. Build the shell first."
}

if (-not (Test-Path (Join-Path $uiDistDir "index.html"))) {
  throw "Missing built UI at '$uiDistDir'. Run the UI build first."
}

$requiredRuntimeFiles = @(
  "libcef.dll",
  "chrome_elf.dll",
  "icudtl.dat",
  "resources.pak"
)

$missingRuntimeFiles = @(
  $requiredRuntimeFiles | Where-Object {
    -not (Test-Path (Join-Path $releaseDir $_))
  }
)

if ($missingRuntimeFiles.Count -gt 0) {
  throw "Missing required CEF runtime files in '$releaseDir': $($missingRuntimeFiles -join ', '). Build with scripts/cargo-with-cef-env.ps1 so CEF assets are synced."
}

if (Test-Path $packDir) {
  Remove-Item -Path $packDir -Recurse -Force
}
if (Test-Path $outputDir) {
  Remove-Item -Path $outputDir -Recurse -Force
}

New-Item -Path $packDir -ItemType Directory -Force | Out-Null
New-Item -Path $outputDir -ItemType Directory -Force | Out-Null

$runtimePatterns = @(
  "*.exe",
  "*.dll",
  "*.pak",
  "*.bin",
  "*.dat",
  "*.json",
  "*.txt"
)

foreach ($pattern in $runtimePatterns) {
  Get-ChildItem -Path $releaseDir -Filter $pattern -File -ErrorAction SilentlyContinue |
    ForEach-Object {
      Copy-Item -Path $_.FullName -Destination $packDir -Force
    }
}

$runtimeDirs = @("locales", "swiftshader")
foreach ($dir in $runtimeDirs) {
  $sourceDir = Join-Path $releaseDir $dir
  if (Test-Path $sourceDir) {
    Copy-Item -Path $sourceDir -Destination (Join-Path $packDir $dir) -Recurse -Force
  }
}

$uiTargetDir = Join-Path $packDir "ui"
New-Item -Path $uiTargetDir -ItemType Directory -Force | Out-Null
Copy-Item -Path (Join-Path $uiDistDir "*") -Destination $uiTargetDir -Recurse -Force

if ($GitHubRepo -and $GitHubToken) {
  try {
    Write-Host "Downloading previous Velopack releases from GitHub for delta generation..."
    & vpk download github --repoUrl "https://github.com/$GitHubRepo" --token $GitHubToken --channel $Channel --outputDir $outputDir
  }
  catch {
    Write-Warning "Could not download previous releases. Continuing with full package generation."
  }
}

$packArgs = @(
  "pack",
  "--packId", $PackId,
  "--packVersion", $Version,
  "--packTitle", $PackTitle,
  "--packAuthors", $PackAuthors,
  "--packDir", $packDir,
  "--mainExe", $MainExe,
  "--channel", $Channel,
  "--outputDir", $outputDir
)

if (-not [string]::IsNullOrWhiteSpace($Framework)) {
  $packArgs += @("--framework", $Framework)
}

if (Test-Path $iconFile) {
  $packArgs += @("--icon", $iconFile)
}

Write-Host "Packaging release with Velopack..."
& vpk @packArgs
if ($LASTEXITCODE -ne 0) {
  throw "Velopack pack failed with exit code $LASTEXITCODE."
}

$portableZip = Get-ChildItem -Path $outputDir -Filter "*-Portable.zip" -File -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $portableZip) {
  throw "Could not find Velopack portable package in '$outputDir'."
}

$zipEntries = & tar -tf $portableZip.FullName
if ($LASTEXITCODE -ne 0) {
  throw "Failed to inspect package archive '$($portableZip.FullName)'."
}

$requiredPortableEntries = @(
  "current/libcef.dll",
  "current/chrome_elf.dll",
  "current/icudtl.dat",
  "current/resources.pak"
)

$missingPortableEntries = @(
  $requiredPortableEntries | Where-Object {
    $zipEntries -notcontains $_
  }
)

if ($missingPortableEntries.Count -gt 0) {
  throw "Portable package '$($portableZip.Name)' is missing required runtime entries: $($missingPortableEntries -join ', ')."
}

Write-Host "Validated packaged CEF runtime in '$($portableZip.Name)'."

if ($GitHubRepo -and $GitHubToken) {
  Write-Host "Uploading Velopack release assets to GitHub..."
  $uploadArgs = @(
    "upload",
    "github",
    "--repoUrl", "https://github.com/$GitHubRepo",
    "--token", $GitHubToken,
    "--channel", $Channel,
    "--releaseName", "Pulse $Version",
    "--publish",
    "--outputDir", $outputDir
  )

  if ($GitHubReleaseTag) {
    $uploadArgs += @("--tag", $GitHubReleaseTag)
  }

  & vpk @uploadArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Velopack upload failed with exit code $LASTEXITCODE."
  }
}

Write-Host "Velopack output ready at: $outputDir"
