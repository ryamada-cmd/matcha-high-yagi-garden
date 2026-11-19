# 写真・動画ギャラリーの運用とリリース

## 利用方法

- アプリの「写真・動画ギャラリー」から分類、撮影日、アルバム、圃場、機械設備などを指定し、ファイルを追加する。1ファイル20GB、キュー50件まで。
- キューは「原本を確認中」「アップロード中」「登録済み」を表示する。中断後は「再開」を選ぶ。ブラウザを閉じた後やスマホがファイル参照を失った場合は同じファイルを選び直す。期限切れのセッションは再開操作で新規転送する。
- iPhoneは「写真」から選ぶ際に共有機能が変換したコピーを渡す場合がある。HEICや編集前の動画を保持したい場合は、事前に「未変更のオリジナル」をファイルアプリに保存して、そのファイルを選ぶ。ギャラリーはブラウザから渡されたバイト列を保存する。
- 一覧と詳細にはOneDrive生成のサムネイルを使う。動画プレビューはブラウザで再生できる原本を直接ストリーミングする。HEIC・RAW・TIFFや端末非対応の動画コーデックはプレビューが表示できない場合がある。
- 「オリジナルをダウンロード」からOneDriveの原本を取得する。iPhoneではSafariのダウンロード一覧、または共有メニューの「ファイルに保存」を使う。
- 投稿情報は投稿者と管理者が編集できる。新規共有メディアの原本の完全削除は管理者のみ。バックフィルした原本は既存業務への参照を保護するため削除対象外。

## 承認と台帳

- 従来は `viewer` が承認待ち、`worker` と `admin` が利用承認済みだった。移行時点の利用者をこの状態で初期化する。新規 `viewer` は未承認。従来の承認待ちへの移行・解除は共有権限にも反映される。
- 承認済み管理者はギャラリーの「共有ギャラリーの利用承認」で共有機能だけを承認・解除できる。承認された `viewer` は共有ギャラリーとログアウトのみ利用できる。圃場・設備の候補は既存の業務閲覧権限がある場合だけ表示する。
- `external_files` を原本台帳、`external_file_links` を業務リンクに使う。共有側の分類・撮影日・投稿者・アルバムは `media_items` で管理する。アルバム改名でOneDriveの物理パスは変わらない。
- 一般写真・圃場・設備の公開対象を同じ原本IDで追加する。日報・経費などの個別権限が必要なリンクを含む添付は共有対象外。日報から利用できる写真の経路は既存のまま。
- `media_upload_sessions` と `media_audit_logs` はサービスロールのみ。閲覧用台帳とアルバムはRLSで承認確認、変更はEdge Functionと権限検証付きのトランザクションで処理する。

## 転送とトラブル対応

- Graph `createUploadSession` で原本の置き場を発行し、ブラウザが10MiBずつ順次PUTする。アップロードURLは一時的な書き込み権限を持つ。Edge Functionから応答する時は `Cache-Control: no-store` を指定し、サーバー側セッションにはAES-GCM暗号文を保存する。URL、認証トークン、下流の生エラーをログに出さない。
- 転送前にブラウザのWorkerで原本のSHA-256を逐次計算する。大容量では読み取りに時間がかかる。同一ユーザーの同一原本の再送は台帳とセッションの一意制約で抑止する。確定時はGraphのドライブID・アイテム種別・物理名・ファイルサイズ・最大4KiBのファイル署名を検証する。OneDriveから再取得する全体ハッシュの比較は検証時に行う。
- 転送継続時はGraphから未受信範囲を取得する。通信断・429・一時的な5xxは再照会と再試行を行い、429は `Retry-After` を優先する。507は管理者がOneDriveの容量を確認してから再開する。
- Graphから原本の短期URLを取得する。ドライブから `@microsoft.graph.downloadUrl` が返らない場合は、認証済みのEdge FunctionがGraphの `/content` のリダイレクト先を取得する。ファイル本体は端末が受信し、Edge FunctionやVercelを通らない。発行済みのURLは期限まで使えるため、URLを外部へ送信しない。
- プロバイダー側のCORSが変わった場合は、同一オリジン・同じGraphドライブで再測定する。Supabase Edge Functionsの公表制限はメモリ256MB、CPU時間2秒、レスポンス開始前のアイドル150秒。実測で余裕を確認できた場合のみ、320KiBの倍数の小チャンクをストリーム中継する。Vercel Functionsのリクエスト上限4.5MBは10MiB中継に届かない。専用中継が必要なら、32MiBのHTTP/1リクエストを受けられるCloud Runを候補とし、帯域・同時接続・費用・タイムアウトを別途測定する。
- エラー調査ではセッションID、状態、時刻、HTTPステータスを使う。短期URLが含まれるHARやレスポンス本文を共有しない。期限切れセッションではGraph側の一時データが破棄される。接続先変更や暗号鍵の交換は、進行中セッションの終了後に行う。

## リリース

1. 検証DBでマイグレーションを実行し、レガシー写真ID・OneDrive台帳・日報のアクセスを照合する。
2. Edge Function `shared-media` を設置する。独自に利用者JWTを検証するためエッジの従来JWTゲートをOFFにする場合は、JWTが無い・無効・承認が無いリクエストが拒否されることを検証する。
3. 検証用の `SHARED_MEDIA_SESSION_KEY` に32バイトの乱数を64文字の16進数でSecretsへ登録する。`SHARED_MEDIA_ORIGINS` は許可する検証ドメインをカンマ区切りで設定する。
4. 検証でのみEdge Functionの `SHARED_MEDIA_ENABLED=1` とUIの `VITE_SHARED_MEDIA_ENABLED=1` を有効化する。UIフラグが無いビルドでは既存ギャラリーを表示する。
5. 別の管理者・投稿者・未承認アカウントを使って動作を確認する。端末の原本保存、アクセス取消後の再発行拒否、既存日報添付、管理者削除を確認する。正式リリースでは上記の条件を満たした後、承認済みPRをマージして対象環境のフラグを有効化する。
6. 取り下げが必要な場合はサーバーフラグを無効化し、UIフラグを外したビルドを配信する。追加台帳とストレージの原本は保管する。

## 2026-11-19の検証記録

- 対象のOneDrive Businessと `https://yagi-garden-manager.vercel.app` の組み合わせでChromiumとWebKitから検証。PUTのCORS preflightは200、10MiB PUTは202、Graph GETは送信済み10MiB直後の残り範囲を返した。未完了の試験セッションはDELETE 204で終了。
- 合成JPEG・PNG・HEIC・MP4・MOVでGraphの作成201、閲覧用署名URLのRange 206、原本の `Content-Disposition: attachment` とバイト一致を確認。
- 100MB・1GB・5GBの合成ファイルで順次PUT、2回の分割転送後のGraph GETから再開、原本の全SHA-256一致、試験ファイルの削除204を確認。
- 20GB（20,000,000,000バイト）の合成原本を本番Vercelドメインから10MiBずつ直接PUTした。中断後にGraphが返す範囲から再開し、OneDriveから取得した20GBの全体SHA-256が送信前と一致した。試験原本はGraphの完全削除で終了した。
- ローカルのPostgreSQL 17に関連マイグレーションを適用し、Supabase Auth・PostgREST・Denoの共有APIを、対象OneDriveの隔離した試験フォルダにつないだ。合成データでJWT検証、未承認の拒否、共有承認と業務権限の分離、分割転送、確定処理の冪等性、原本一致、他人の編集・削除拒否、承認取消、キャンセル、管理者による完全削除と削除後のGraph 404を確認した。
- 新画面の操作試験はChromiumデスクトップ・Android幅・WebKit iPhone幅で成功。認証付きのWebKit試験では実OneDriveへの登録と原本ダウンロードのHTTP 200・添付ヘッダーを確認した。
- 修正版の検証ページで、iPhone Safari実機での原本保存完了を利用者から確認。検証ページにはOneDrive上の合成PNG・MP4のみを用意し、両原本の添付ヘッダーとバイト一致を別途確認した。
- 429・507・5xxは模擬試験で検証した。クラウド検証DBでの通し試験、Android実機での端末保存と本番利用者による確認は未実施。

## 参照

- [Microsoft Graph createUploadSession](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0)
- [Microsoft Graph driveItem の内容取得](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0)
- [Microsoft Graph driveItem の完全削除](https://learn.microsoft.com/en-us/graph/api/driveitem-permanentdelete?view=graph-rest-1.0)
- [Supabase Edge Functions limits](https://supabase.com/docs/guides/functions/limits)
- [Vercel Functionsのリクエスト上限](https://vercel.com/docs/errors/function_payload_too_large)
- [Cloud Run quotas and limits](https://docs.cloud.google.com/run/quotas)
