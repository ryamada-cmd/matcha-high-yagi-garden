# 五代目 八木一兵衛｜問い合わせ・商談管理（CRM）

## 公開範囲

- React画面：`/crm`。デスクトップ・スマートフォンから利用。
- 新規・既存の取引先、担当者、案件、商談ステージ、対応履歴、期限、担当社員、関連帳票を管理。
- 権限：`crm.view`、`crm.manage`、`crm.mailboxes`。初期設定では管理者のみ閲覧・編集可能。
- Supabase：`crm_*` テーブル、`crm_private` スキーマ、制限付きRPC。
- Gmail：Supabase Edge Function `crm-gmail`。Google OAuth、スレッド単位の取込、サーバー側暗号化、重複防止。
- 自動同期：Supabase Cron `yagi-crm-gmail-every-5m`。5分ごと。ただし明示的に有効化したメールボックスがゼロならAPIリクエストを送らない。

## 主要な受付メールアドレス（2026-11-09確認）

| ブランド | 問い合わせ先 |
| --- | --- |
| MATCHA HIGH | `info@matchahigh.jp` |
| 五代目 八木一兵衛 | `info@godaimeyagiichibei.com` |

2つのGoogle Workspaceアカウントは別々の受信箱です。MATCHA HIGHは `to:info@matchahigh.jp`、五代目 八木一兵衛は `to:info@godaimeyagiichibei.com` として個別に接続・同期します。

* Google Workspaceのそれぞれのアカウントで個別にOAuth認証し、対応する宛先の検索条件のみを設定します。
* 新たに取り込む**受信メールの宛先ヘッダー**から2つのいずれかを識別した場合、`crm_inquiries.received_address`に記録して一覧と詳細に表示します。判定不能な案件は未設定のままなので、手動修正できます。

2026-11-09時点：MATCHA HIGHはOAuth接続済み。五代目 八木一兵衛は未接続。既存のRiverside AI Office用Googleアカウント認証はCRMへ自動転用しません。

## Google Workspaceは2つの独立した受信箱（2026-11-09確定）

- `info@matchahigh.jp`：MATCHA HIGH受付先とGoogle Workspaceログイン先が同一。以前登録していた `.com` はユーザーによって存在しないと確認されたため廃止。
- `info@godaimeyagiichibei.com`：Google Workspaceの受信箱B
- それぞれ別のGoogle OAuth同意を行い、**設定されたGoogle Workspaceログインアドレス**と認証結果が完全一致した場合だけ接続を成立させます。受付アドレスとは別に`crm_mailboxes.oauth_email`へ保存します。
- 2つの`crm_mailboxes`行を事前登録済み。MATCHA HIGHは接続・自動同期を有効化済み、八木一兵衛は未接続・停止中。
- Google認証画面は`login_hint`で`oauth_email`を案内します。実際の接続可否はGoogleから返る検証済みメールアドレスと照合して判断します。
- 初回同期は各メールボックスについて直近7日間。接続後に管理画面から個別に自動同期を有効化します。
- 他方のメールボックスの接続状態に影響せず、片方のみ一時停止または再認証できます。

## 接続手順

1. 事前にGoogle CloudのOAuthクライアント設定、Gmail API、Supabase Edge Function Secretsを完了してください（後述）。
2. [営業・問い合わせ管理](https://yagi-garden-manager.vercel.app/crm)の管理者メニュー「メール連携」へ。
3. `info@matchahigh.jp`のカードの「Google Workspaceで認証」を押し、同じGoogleアカウントを選択、読み取りを許可します（2026-11-09時点で実施済み）。
4. CRMに戻り、そのカードが「認証済み・同期停止中」であることを確認します。
5. `info@godaimeyagiichibei.com`のカードでも**別々に**同じ操作を行います。
6. それぞれ検索条件が `to:info@...` となっていることを確認して「自動同期を有効化」を押します。
7. 2件の「今すぐ同期」で、テストメールが重複せずそれぞれの受信先の案件に登録されることを確認します。以降は5分ごとの同期処理が動きます。

### MATCHA HIGHドメインの修正（2026-11-09）

ユーザーが `info@matchahigh.com` は存在せず、正式なアドレスは `info@matchahigh.jp` と明示したため、CRM受信先・Gmail検索条件・OAuthログインをすべて `.jp` に統一しました。別アカウント `info@godaimeyagiichibei.com` は変更していません。

## 本番Gmail連携の初期設定（管理者が実施）

**この設定が終わるまではGmailは自動取込されません。システム本体は手入力で利用できます。**

1. Google Cloud ConsoleでOAuth同意画面を用意し、Gmail APIを有効化する。
2. OAuthクライアントの種類は「ウェブアプリケーション」を選ぶ。
3. 承認済みリダイレクトURIに **`https://mdbtngousidfanmrjybt.supabase.co/functions/v1/crm-gmail`** を正確に登録。
4. OAuthで必要なスコープ：`openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly`。Gmailの制限付きスコープはGoogleの審査・追加対応を必要とする場合がある。
5. Supabaseプロジェクト `mdbtngousidfanmrjybt` の **Edge Function Secrets** に以下の変数を登録（値はチャットやGitHubに貼り付けない）：
   - `CRM_GOOGLE_CLIENT_ID`：Google OAuthクライアントID
   - `CRM_GOOGLE_CLIENT_SECRET`：Google OAuthクライアントシークレット
   - `CRM_TOKEN_ENCRYPTION_SECRET`：新規生成した強度の高いランダム文字列（32文字以上）。保存した接続トークンが読めなくなるため、接続済みのまま変更しない。
6. 茶園管理システムへ管理者でログインし、`/crm` →「メール連携」を開く。
7. 2つのメールアドレスのカードそれぞれから、対応するGoogle Workspaceアカウントで個別に認証する。
8. 接続後は **一時停止** 状態。各カードの宛先検索条件と認証状態を確認して「自動同期を有効化」を押す。
9. それぞれ「今すぐ同期」で動作を検証。以後は5分間隔のCronで同期される。

複数メールアカウントを追加可能。誤取込を避けるため、個人メール全体を対象にしない。対象のGmailラベルまたは宛先の検索条件を明示する。

## メール取得仕様

- 初回は検索条件に一致する直近7日間のGmailスレッドを取得。
- 以後は最終同期日から2日戻してスキャンし、取りこぼしを補完。
- 同じGmailスレッドは同一案件に記録し、`(mailbox_id, gmail_message_id)` ユニーク制約で二重登録しない。
- 受信メールと送信メールの本文を保存。HTMLを解釈せずテキストで表示。添付はファイル名などのメタデータのみ保存（実ファイルの閲覧・ダウンロードは未実装）。
- 1000スレッド以上の一括同期が必要な場合は検索条件を絞る。同期時の一時エラーは次回実行で再試行し、認証失効時は再接続を求める。
- すべての新規メールを「営業案件」とは断定せず、指定ラベル・検索条件の範囲に限定。AI自動分類・返信文案・自動返信は今後の拡張機能。

## 連携・運用

- `crm_companies.document_customer_id`：帳票取引先への紐付け。
- `crm_inquiries.sales_document_id`：見積書・請求書等への紐付け。
- `crm_inquiries.assigned_to`：社内営業担当者。
- `crm_activities`：メール以外の電話・商談・サンプル発送などを記録。
- CRM内からメールは送信しない。送信は元のGmailで行い、返信履歴を次回同期で集約する。
- Gmailアカウントの停止は「同期を一時停止」で操作。自動同期のCronは有効化済みのボックスがあるときだけ動作する。
- データ保護：CRMテーブルにRLS。OAuthトークンは専用非公開スキーマにAES-GCM暗号化して格納。Cronの認証情報はSupabase Vaultを使用。

## Google Workspaceで認証しても画面が開かない場合

1. CRM「メール連携」を開く。サーバーの認証設定が不足している場合は、`CRM_GOOGLE_CLIENT_ID`、`CRM_GOOGLE_CLIENT_SECRET`、`CRM_TOKEN_ENCRYPTION_SECRET`のうち、未設定の項目名が画面に表示されます。値そのものは表示されません。
2. [Supabase Edge Function Secrets](https://supabase.com/dashboard/project/mdbtngousidfanmrjybt/functions/secrets)に、必要な3項目を追加してください。秘密情報はチャットやGitHubに貼り付けないでください。暗号鍵は32文字以上。
3. Google CloudでGmail APIを有効化し、OAuthウェブアプリのリダイレクトURIに`https://mdbtngousidfanmrjybt.supabase.co/functions/v1/crm-gmail`を登録してください。Google Workspace管理ポリシーによりアクセスが制限されている場合は、管理者によるアプリ許可も必要です。
4. 認証ボタンを押すとエラーになる場合は、画面上部のエラー本文を確認してください。HTTP 400の詳細を直接表示するよう修正しています。
5. 認証後、メールボックスの状態が「認証済み・同期停止中」になったことを確認し、最後に個別に有効化します。

2026-11-07の問題調査では、Gmail連携Edge FunctionのPOSTリクエストがHTTP 400を返しており、Google認証ページが開く前に処理が失敗していました。サーバーOAuth診断で設定不足と他のサーバーエラーを切り分けます。

## Gmail API HTTP 403 の調査（2026-11-09）

Google認証は成功していても、実際のGmail API呼び出しで403になることがあります。CRMはGoogleのエラーレスポンス内の `reason` と `message` を安全に抜粋して表示し、原因を特定するよう変更しました。

1. OAuthクライアントを作成したGoogle Cloudプロジェクトで、[Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=premium-valor-514223-h7)が**有効**か確認する。`有効にする`が出ていたら操作する。
2. 有効なのに403なら、CRMの「今すぐ同期」を押して更新された詳細エラーを確認する。`SERVICE_DISABLED`ならAPI未有効化、`domainPolicy`ならGoogle Workspace管理コンソールでアプリアクセス制限を確認する。
3. 必要なOAuthスコープは`https://www.googleapis.com/auth/gmail.readonly`。アプリ同意画面で権限を承認しても、Gmail API自体が未有効化ならAPI利用はできない。
4. MATCHA HIGHの正しいアドレスと検索条件は `info@matchahigh.jp` / `to:info@matchahigh.jp`。
5. 別アカウント`info@godaimeyagiichibei.com`は未認証で個別認証が必要。

## Gmailメール保存失敗の修正（2026-11-09）

Google OAuth・Gmail APIが通った後、メール保存時に `there is no unique or exclusion constraint matching the ON CONFLICT specification` のPostgreSQLエラーが発生した。原因は `crm_messages(mailbox_id,gmail_message_id)` の重複防止索引が **部分ユニーク索引** であり、Supabase PostgREST `upsert(..., onConflict: 'mailbox_id,gmail_message_id')` の競合判定に使えなかったこと。

本番DBの索引を部分条件なしの複合ユニーク索引に置き換えた。NULLを含む複合キーは通常のPostgreSQL UNIQUEでは重複可能なので手入力・他のレコードへの影響なし。続いてCRMのコードにも修正を追加し、保存エラーのDBメッセージを管理者に表示する。

## 運用テスト

- 作成→編集→絞り込み→担当者変更→メモ記録を管理者ログインで実機確認。
- 権限のないユーザーは `/crm` にアクセスできないことを確認。
- Google接続後にテストメールを1通受信し、同期、返信、再同期で1案件・2件のメール履歴になることを確認。
- エラー表示、再同期、Cron実行時刻を確認する。

> 注：マイグレーションは2026-11-07に本番DBへ追加適用済み。再構築時は `supabase/migrations/20261107090000_crm_inquiries_and_gmail.sql` を使用する。

## プロモーション等の除外・復元（2026-11-09追加）

- 「問い合わせ・商談」タブで「対応対象／除外済み」を切替。除外は `crm_inquiries.excluded_at` の論理管理でメール本文を削除しない。
- 案件の「この案件のみ除外」で個別除外、一覧のチェックボックスから一括除外。
- 「この送信元を今後も除外」を押すと、メールボックスと送信元メールアドレス完全一致の `crm_sender_rules` を登録。
- 同送信元からの新着メールは履歴を保存しながら除外済みへ移す。曖昧な語句やドメイン一括除外はしない。
- 「除外済み」タブから復元できる。送信元ルールを停止しないと、次にその送信元から届いた際に再除外される。
- 自動返信、既存メールの削除、Googleメールボックスでの削除は一切しない。

## 承認済み商品条件による要約・返信案（2026-11-09追加）

1. 「商品・返信条件」タブで、商品単位または共通方針の条件マスターを作成する。商品名、品種、グレード、価格単位（例：1kg）、単価・通貨、MOQ（kg）、納期、サンプル価格・容量・最低個数、支払・配送・税の条件、備考、有効期限を入力する。
2. 内容を確認し **「内容を確認して承認」** を押す。承認済みで期限内のマスターしか生成時に参照されない。
3. 価格やその他の事実情報を編集・保存するとDBトリガーにより承認が自動で解除される。再承認しない限りAIの根拠に使われない。
4. 問い合わせ案件を開き、承認済みの商品マスターと返信言語を選択して **「要約・返信案を作成」** を押す。AIへのリクエストはこの明示操作時に限る。
5. `CRM_AI_API_KEY` がSupabase Edge Function Secretsに設定されている場合、OpenAI API（既定 `gpt-4.1-mini`、任意で `CRM_AI_MODEL`）へ選択案件の直近30メッセージ、選択した承認済み商品条件、承認済み共通方針のみを送信する。未設定時はAIを使用せず、承認済み条件を逐語で記載する保守的なテンプレートで代替する。
6. 不明な単価・MOQ・品種・納期・サンプルは **要確認** として表示し、AIが数値を追加した場合はテンプレートへ切り替える。要約・返信案・使用した条件のスナップショット・生成方法は `crm_reply_drafts` に残す。
7. 返信案を編集・保存・コピーしてGmailで担当者が手動送信する。**CRMから自動送信しない**。
8. メール本文・個人情報の外部AI送信は利用者がボタンを押した時のみ。開発中にキーをGitHubやチャットに貼らない。料金・APIの利用ポリシーは別途確認する。

**例：業務用抹茶1kgの単価、最低発注数量、納期、品種やサンプル価格は事前登録されるまで一切推測しません。** 顧客がメールで提示した価格・量は依頼内容であり、自社の確定条件として扱いません。AI生成の文面には人の最終確認が必要です。

