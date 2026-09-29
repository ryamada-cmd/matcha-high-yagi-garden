$ErrorActionPreference = "Stop"

Write-Host "Yagi Garden OCR Gateway - Windows setup" -ForegroundColor Cyan

$python = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
  $python = "py"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  $python = "python"
} else {
  Write-Host "Python 3.11+ was not found. Install Python first." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path ".venv")) {
  Write-Host "Creating Python virtual environment..."
  & $python -m venv .venv
}

Write-Host "Installing required packages..."
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host ".env created. Set IOS_OCR_BASE_URL to the address shown on the iPhone." -ForegroundColor Yellow
} else {
  Write-Host ".env already exists; keeping the current file."
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "1) Check IOS_OCR_BASE_URL in .env"
Write-Host "2) Run start_gateway.bat"
Write-Host "3) Open http://127.0.0.1:8787/health"
