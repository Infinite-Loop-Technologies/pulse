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
