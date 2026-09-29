$ErrorActionPreference = "Stop"

Write-Host "Yagi Garden OCR Gateway - Windows setup" -ForegroundColor Cyan

$python = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
  $python = "py"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  $python = "python"
} else {
  Write-Host "Python 3.11+ が見つかりません。https://www.python.org/ から Python をインストールしてください。" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path ".venv")) {
  Write-Host "仮想環境を作成しています..."
  & $python -m venv .venv
}

Write-Host "依存パッケージをインストールしています..."
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host ".env を作成しました。IOS_OCR_BASE_URL を iPhone に表示されたアドレスへ変更してください。" -ForegroundColor Yellow
} else {
  Write-Host ".env は既に存在するため、そのまま使用します。"
}

Write-Host ""
Write-Host "セットアップ完了。" -ForegroundColor Green
Write-Host "1) .env の IOS_OCR_BASE_URL を確認"
Write-Host "2) start_gateway.bat を実行"
Write-Host "3) http://127.0.0.1:8787/health をブラウザで確認"
