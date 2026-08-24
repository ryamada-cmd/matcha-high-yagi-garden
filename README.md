# 五代目八木一兵衛 茶園防除管理システム

京都・井手町の茶園向けに、農薬在庫、入出庫、薬液調製、混用散布、圃場、年間防除計画を一元管理するWebアプリです。

## Architecture

- Frontend: React + TypeScript + Vite + PWA
- Backend / Database: Supabase (PostgreSQL, Auth, Storage, RPC)
- Hosting: Cloudflare Pages
- CI: GitHub Actions

## Principles

- 在庫は履歴から算出し、直接上書きしない
- 散布登録・編集・削除はDBトランザクションで一括処理
- 削除は原則ソフトデリートし、監査ログを保持
- 複数農薬の混用調製に対応
- 調製した薬液は選択圃場へ面積比例で全量散布できる
- FAMIC等の公式情報は別テーブルで同期・履歴管理する

## Initial modules

- Dashboard
- Pesticide inventory
- Inventory transactions
- Spray batches and mixed chemicals
- Fields
- Annual spray plans
- Audit logs

## Next setup

1. Connect a Supabase project
2. Apply `supabase/migrations/0001_initial_schema.sql`
3. Configure environment variables
4. Deploy the frontend to Cloudflare Pages
5. Migrate the existing Google Sheets data
