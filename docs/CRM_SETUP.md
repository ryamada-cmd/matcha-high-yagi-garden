# 五代目 八木一兵衛｜問い合わせ・商談管理（CRM）

## 公開範囲

- React画面：`/crm`。デスクトップ・スマートフォンから利用。
- 新規・既存の取引先、担当者、案件、商談ステージ、対応履歴、期限、担当社員、関連帳票を管理。
- 権限：`crm.view`、`crm.manage`、`crm.mailboxes`。初期設定では管理者のみ閲覧・編集可能。
- Supabase：`crm_*` テーブル、`crm_private` スキーマ、制限付きRPC。
- Gmail：Supabase Edge Function `crm-gmail`。Google OAuth、スレッド単位の取込、サーバー側暗号化、重複防止。
- 自動同期：Supabase Cron `yagi-crm-gmail-every-5m`。5分ごと。ただし明示的に有効化したメールボックスがゼロならAPIリクエストを送らない。

## 主要な受付メールアドレス（2026-11-07設定）

| ブランド | 問い合わせ先 |
| --- | --- |
| MATCHA HIGH | `info@matchahigh.com` |
| 五代目 八木一兵衛 | `info@godaimeyagiichibei.com` |

初期のGmail検索条件は `{to:info@matchahigh.com to:info@godaimeyagiichibei.com}` （いずれか一方の宛先へのメール）です。管理画面の「メール連携」タブで両方／片方の条件を選択できます。

* 2つのメールアドレスが**同じGmail/Google Workspace受信箱に転送**されている場合：実際の受信箱を1アカウント接続し、「両方」を選択。
* それぞれ**別々のGmail受信箱**の場合：各受信箱のGoogleアカウントを接続し、該当する宛先を選択。
* Gmail以外のメールホストの場合：このGmail API連携だけでは同期できません。Google Workspaceへの転送、あるいはメールホスト別の連携が必要。
* Gmailの転送・エイリアス構成によっては`to:`が元の宛先に一致しないことがあります。その際は対象メールのGmailヘッダー／ラベルを確認して検索条件を調整。
* 新たに取り込む**受信メールの宛先ヘッダー**から2つのいずれかを識別した場合、`crm_inquiries.received_address`に記録して一覧と詳細に表示します。判定不能な案件は未設定のままなので、手動修正できます。

2026-11-07時点：CRM専用OAuthメールボックスは未接続。既存のRiverside AI Office用Googleアカウント認証はCRMへ自動転用しません。

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
7. Gmail検索条件（既定：`{to:info@matchahigh.com to:info@godaimeyagiichibei.com}`）を設定し、「Googleアカウントを接続」から対象アカウントの承認画面を進む。
8. 接続後は **一時停止** 状態。メールアドレスと検索条件を確認して「自動同期を有効化」を押す。
9. 「今すぐ同期」ボタンで動作を検証。以後は5分間隔のCronで同期される。設定画面に最終同期・エラーを表示。

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

## 運用テスト

- 作成→編集→絞り込み→担当者変更→メモ記録を管理者ログインで実機確認。
- 権限のないユーザーは `/crm` にアクセスできないことを確認。
- Google接続後にテストメールを1通受信し、同期、返信、再同期で1案件・2件のメール履歴になることを確認。
- エラー表示、再同期、Cron実行時刻を確認する。

> 注：マイグレーションは2026-11-07に本番DBへ追加適用済み。再構築時は `supabase/migrations/20261107090000_crm_inquiries_and_gmail.sql` を使用する。
