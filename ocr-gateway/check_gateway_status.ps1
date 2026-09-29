param(
  [string]$TaskName = "Yagi Garden OCR Gateway"
)

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host "Scheduled task: $TaskName"
  Write-Host "State: $($task.State)"
  Write-Host "Last run: $($info.LastRunTime)"
  Write-Host "Last result: $($info.LastTaskResult)"
} else {
  Write-Host "Scheduled task: not installed"
}

try {
  $headers = @{}
  $envPath = Join-Path $PSScriptRoot ".env"
  if (Test-Path $envPath) {
    $line = Get-Content $envPath | Where-Object { $_ -match '^GATEWAY_API_KEY=' } | Select-Object -First 1
    if ($line) {
      $key = ($line -replace '^GATEWAY_API_KEY=', '').Trim()
      if ($key) { $headers["X-API-Key"] = $key }
    }
  }
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -Headers $headers -TimeoutSec 5
  Write-Host "Gateway health: OK"
  Write-Host "iPhone reachable: $($health.iphone_reachable)"
  Write-Host "iPhone status: $($health.iphone_status)"
} catch {
  Write-Host "Gateway health: unavailable"
  Write-Host $_.Exception.Message
}
