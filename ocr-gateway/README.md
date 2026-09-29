# Yagi Garden iOS OCR Gateway

Yagi Garden Manager のOCR改善を検証するための、事務所Windows PC用テストGatewayです。

本番アプリにはまだ接続しません。まず既存のブラウザOCR（PDF構造解析/Tesseract）と Apple Vision OCR を同じ請求書で比較します。

## 構成

```text
Windows PC (this gateway)
  -> office Wi-Fi/LAN
  -> iPhone running iOS-OCR-Server
  -> Apple Vision OCR
```

iOS-OCR-Server:
https://github.com/riddleling/iOS-OCR-Server

## 1. iPhoneを準備

1. iPhoneに iOS-OCR-Server をインストールして起動します。
2. Windows PC と iPhone を同じ事務所ネットワークへ接続します。
3. アプリに表示されたIP/ポートを確認します。通常は `http://192.168.x.x:8000` の形式です。
4. Windows PCのブラウザからそのアドレスを開き、iPhoneのOCR画面が表示されることを確認します。
5. 長時間運用時はiOS-OCR-Server公式READMEの案内どおり、アクセスガイドを有効にして画面を点灯状態にします。

iOS 26+ では `/docOCR` による Document Paragraph Detection も比較対象にします。

## 2. Windowsへインストール

Python 3.11以上をWindowsへインストールしてください。Pythonインストーラーでは "Add Python to PATH" を有効にします。

PowerShell:

```powershell
cd C:\path\to\matcha-high-yagi-garden\ocr-gateway
powershell -ExecutionPolicy Bypass -File .\install_windows.ps1
notepad .env
```

`.env` の次の行を、iPhoneに表示されたアドレスへ変更します。

```env
IOS_OCR_BASE_URL=http://192.168.1.50:8000
```

最初のLAN内テストでは `GATEWAY_API_KEY` は空でも構いません。外部公開前には必ず設定します。

## 3. Gatewayを起動

`start_gateway.bat` をダブルクリックするか、次を実行します。

```powershell
.\start_gateway.bat
```

Gatewayは安全のため最初は `127.0.0.1:8787` だけで待ち受けます。

確認:

- http://127.0.0.1:8787/health
- http://127.0.0.1:8787/docs

`/health` で `iphone_reachable: true` ならWindows→iPhoneの通信は成功です。

## 4. 請求書で3方式を比較

```powershell
.\.venv\Scripts\python.exe .\test_invoice.py "C:\Users\YOUR_NAME\Desktop\invoice.pdf"
```

自動的に次の3方式を比較します。

1. `/upload` + 原稿そのまま
2. `/upload` + Windows側の軽いコントラスト/シャープ補正
3. `/docOCR` + 原稿そのまま（iOS 26+）

結果は `results\<ファイル名>-ios-ocr-comparison.json` に保存されます。

`/upload` の結果には、iOS-OCR-Serverが返す `ocr_boxes`（文字位置）も保存します。請求書の列・表解析に使えるかも確認できます。

## 5. API

### Health

```http
GET /health
```

### 1方式だけOCR

```http
POST /ocr?mode=upload&preprocessing=original
Content-Type: multipart/form-data
file=<image-or-pdf>
```

`mode`: `upload` / `docOCR`

`preprocessing`: `original` / `enhanced`

### 比較

```http
POST /compare
Content-Type: multipart/form-data
file=<image-or-pdf>
```

## 次の段階

実請求書で精度が確認できたら、次に以下を行います。

1. Windows PCを自動起動/常時稼働化
2. Gatewayに強いAPIキーを設定
3. 外部から安全に到達できるHTTPS TunnelをWindows側に構成
4. Yagi Garden Managerの既存 `src/lib/documentOcr.ts` に Apple Vision を追加
5. PDF内に正常なテキスト構造がある場合は現在の `PDF_TEXT` を最優先し、画像OCRが必要な場合だけApple Visionを使用
6. Apple Vision失敗時は既存ブラウザOCRへフォールバック

この順番なら、現在のOCRを壊さず段階的に切り替えられます。


## Structured invoice parser

The Gateway now parses `docOCR` markdown tables into deterministic invoice JSON.

It validates and, only when mathematically unique, repairs:

- missing quantity from `line total / unit price`
- one OCR-corrupted line amount from the invoice subtotal
- one OCR-corrupted unit price using a near-identical item/capacity on the same invoice
- `subtotal + tax = total`
- sum of line totals = subtotal

If a value cannot be determined uniquely, it is not silently changed; the item is marked `needs_review: true`.

The `/invoice` endpoint uses `docOCR` first. If `docOCR` is unavailable it falls back to plain `/upload`, but deliberately does not fabricate structured invoice data; the existing Garden Manager parser can be used as the next fallback.

Regression tests cover the August and September Riverside invoices used during evaluation.

Run locally:

```powershell
cd C:\Users\M\Desktop\matcha-high-yagi-garden
git pull origin feature/ios-ocr-gateway
cd ocr-gateway
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

Then restart `start_gateway.bat` and rerun `test_invoice.py`. The `docOCR / original` section will now include a `STRUCTURED INVOICE` JSON block.


## Garden Manager integration

The Garden Manager now uses the following invoice OCR order:

1. Embedded PDF text/layout (`PDF_TEXT`)
2. Apple Vision `docOCR` through the authenticated server-side proxy
3. Existing iPhone plain OCR fallback on the Gateway
4. Existing browser Tesseract OCR

The browser never receives the Windows Gateway API key. Production requests go through `/api/ocr-invoice`.

Required Vercel environment variables before enabling Apple Vision remotely:

```
OCR_GATEWAY_URL=https://<your-secure-gateway-host>
OCR_GATEWAY_API_KEY=<strong-random-key>
```

The Windows Gateway must use the same key in `.env`:

```
GATEWAY_API_KEY=<same-strong-random-key>
```

Until `OCR_GATEWAY_URL` is configured, Garden Manager automatically continues to the existing browser OCR.

For normal Vercel Function uploads, Apple Vision OCR is attempted for invoice files below about 3.75 MB. Larger files automatically continue to the existing browser OCR.


## Stable Windows operation

For day-to-day use, keep the Gateway local on `127.0.0.1:8787` and publish it through a secure HTTPS relay. The preferred setup is Tailscale Funnel because it provides a stable `*.ts.net` hostname without changing the existing MATCHA HIGH DNS configuration.

### 1. Start the Gateway automatically at Windows boot

Run PowerShell as Administrator:

```powershell
cd C:\Users\M\Desktop\matcha-high-yagi-garden\ocr-gateway
powershell -ExecutionPolicy Bypass -File .\install_gateway_autostart.ps1
```

This creates the scheduled task `Yagi Garden OCR Gateway` under the SYSTEM account and starts it immediately.

Check status:

```powershell
powershell -ExecutionPolicy Bypass -File .\check_gateway_status.ps1
```

Remove the task:

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall_gateway_autostart.ps1
```

### 2. Publish the Gateway with a stable Tailscale Funnel URL

Install Tailscale on Windows and sign in. Then run PowerShell as Administrator:

```powershell
cd C:\Users\M\Desktop\matcha-high-yagi-garden\ocr-gateway
powershell -ExecutionPolicy Bypass -File .\setup_tailscale_funnel.ps1
```

The first Funnel command may open a browser approval page. Approve Funnel, then run the setup command again if needed.

The final output includes a stable HTTPS hostname similar to:

```
https://<device>.<tailnet>.ts.net
```

Set that hostname as `OCR_GATEWAY_URL` in the Vercel Production environment. Keep `OCR_GATEWAY_API_KEY` unchanged.

Disable Funnel:

```powershell
powershell -ExecutionPolicy Bypass -File .\disable_tailscale_funnel.ps1
```

The Gateway remains protected by `GATEWAY_API_KEY`; Funnel only replaces the temporary Quick Tunnel URL.
