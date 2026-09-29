param(
  [int]$GatewayPort = 8787
)

$ErrorActionPreference = "Stop"
$tailscale = Get-Command tailscale.exe -ErrorAction SilentlyContinue
if (-not $tailscale) {
  throw "Tailscale is not installed."
}

& $tailscale.Source funnel $GatewayPort off
if ($LASTEXITCODE -ne 0) {
  throw "Failed to disable Tailscale Funnel."
}
Write-Host "Tailscale Funnel disabled for port $GatewayPort."
