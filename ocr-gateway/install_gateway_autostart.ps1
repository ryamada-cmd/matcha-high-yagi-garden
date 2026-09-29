param(
  [string]$TaskName = "Yagi Garden OCR Gateway"
)

$ErrorActionPreference = "Stop"
$gatewayDir = $PSScriptRoot
$python = Join-Path $gatewayDir ".venv\\Scripts\\python.exe"
$app = Join-Path $gatewayDir "app.py"

if (-not (Test-Path $python)) {
  throw "Python virtual environment not found. Run install_windows.ps1 first."
}
if (-not (Test-Path $app)) {
  throw "Gateway app.py not found."
}

$arguments = '-m uvicorn app:app --host 127.0.0.1 --port 8787'
$action = New-ScheduledTaskAction -Execute $python -Argument $arguments -WorkingDirectory $gatewayDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Start-Sleep -Seconds 2
$state = (Get-ScheduledTask -TaskName $TaskName).State
Write-Host "Installed scheduled task: $TaskName"
Write-Host "State: $state"
Write-Host "Gateway URL: http://127.0.0.1:8787"
Write-Host "Use uninstall_gateway_autostart.ps1 to remove the task."
