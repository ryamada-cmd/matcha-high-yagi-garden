param(
  [int]$GatewayPort = 8787
)

$ErrorActionPreference = "Stop"

$tailscale = Get-Command tailscale.exe -ErrorAction SilentlyContinue
if (-not $tailscale) {
  throw "Tailscale is not installed. Install it first, sign in, then run this script again."
}

Write-Host "Enabling unattended Tailscale mode..."
& $tailscale.Source up --unattended=true
if ($LASTEXITCODE -ne 0) {
  throw "tailscale up failed."
}

Write-Host "Configuring persistent Funnel for local port $GatewayPort..."
& $tailscale.Source funnel --bg $GatewayPort
if ($LASTEXITCODE -ne 0) {
  throw "tailscale funnel failed. If a browser approval page opened, approve Funnel and run this script again."
}

Write-Host ""
Write-Host "Funnel status:"
& $tailscale.Source funnel status
