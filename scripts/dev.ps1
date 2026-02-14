param(
  [string]$UiUrl = "http://localhost:5173",
  [string]$ContentUrl = "https://www.microsoft.com/edge"
)

$ErrorActionPreference = "Stop"

Write-Host "Starting Pulse UI dev server..."
$ui = Start-Process -FilePath "pnpm.cmd" -ArgumentList "--dir", "apps/ui", "dev" -WorkingDirectory (Get-Location).Path -PassThru

try {
  if ($UiUrl -match "^https?://(localhost|127\\.0\\.0\\.1)(:\\d+)?") {
    $ready = $false
    $deadline = (Get-Date).AddSeconds(30)

    while ((Get-Date) -lt $deadline) {
      try {
        Invoke-WebRequest -Uri $UiUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ready = $true
        break
      }
      catch {
        Start-Sleep -Milliseconds 500
      }
    }

    if (-not $ready) {
      Write-Warning "UI dev server did not become reachable at $UiUrl within 30s. Launching shell anyway."
    }
  } else {
    Start-Sleep -Seconds 2
  }

  Write-Host "Starting Pulse shell..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cargo-with-cef-env.ps1 run -p pulse-shell -- --pulse-ui-url $UiUrl --pulse-content-url $ContentUrl
}
finally {
  if ($null -ne $ui -and -not $ui.HasExited) {
    Stop-Process -Id $ui.Id -Force
  }
}
