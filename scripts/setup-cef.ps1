param(
  [string]$OutputPath = "$env:USERPROFILE/.local/share/cef-pulse"
)

$ErrorActionPreference = "Stop"
$requiredCefBuild = "143.0.10"

$tool = Join-Path $env:USERPROFILE ".cargo\\bin\\export-cef-dir.exe"
if (-not (Test-Path $tool)) {
  cargo install --locked export-cef-dir
}

& $tool --force --version $requiredCefBuild $OutputPath

Write-Host ""
Write-Host "CEF bundle exported to: $OutputPath"
Write-Host "For this terminal session, run:"
Write-Host "`$env:CEF_PATH='$OutputPath'"
