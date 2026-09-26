# 五代目八木一兵衛 茶園管理システム

京都・井手町を中心とした茶園業務を、圃場から防除・施肥・摘採・製茶・製造・商品化・販売・帳票・経費・設備・ファイルまで一元管理するWebアプリです。

## Production status

- Production URL: `https://yagi-garden-manager.vercel.app/`
- Supabase project: `yagi-garden-manager` (`ap-northeast-1`)
- Frontend: React 19 + TypeScript + Vite
- Backend / Database: Supabase (PostgreSQL 17, Auth, RLS, RPC, Edge Functions)
- External storage: Microsoft OneDrive / Microsoft Graph
- CI / build: GitHub Actions
- Production delivery: GitHub Pages build mirror -> Vercel rewrite

> Vercel currently serves the production domain by rewriting requests to the root-path build stored under GitHub Pages `/vercel-build/`. A push to `main` runs typecheck/build in GitHub Actions and updates the mirrored frontend.

## Main modules

### Dashboard
- Unified operational dashboard
- Weather / field location settings
- Inventory, schedule, harvest, production, sales and equipment alerts

### Crop protection
- Pesticide inventory and inventory transactions
- Mixed pesticide spray registration
- Spray edit / delete / history / CSV
- FAMIC reference data and pesticide guidance
- Annual spray plans

### Fertilizer
- Fertilizer master and official registry
- Fertilizer inventory
- Fertilizer application / history
- N/P/K aggregation by field
- Annual fertilizer plans

### Harvest / production / sales
- Harvest records
- Primary tea processing and yield
- Production lots and costing
- Manufacturing batches
- Product master / price list
- Product packaging / SKU inventory
- Sales / shipping / cancellation / gross profit
- Field-to-sale traceability

### Back office
- Invoices / delivery notes
- Daily reports
- Expense claims and approval
- Vendor invoices and payments
- Equipment and maintenance
- Field dossier
- Audit logs and role permissions

### Files
- OneDrive integration
- File links to business records
- Photo gallery
- Expense receipt attachments

## Authorization model

- Supabase Auth is used for sign-in.
- Application roles are `admin` and `worker`.
- Feature-level permissions are stored in `app_permission_definitions` and `role_permissions`.
- UI permission checks are backed by database-side permission checks.
- Exposed business tables use RLS.
- Sensitive mutations are performed through permission-checked RPCs.
- External-storage Edge Functions validate the user token and application permission before privileged Microsoft Graph operations.

## Data principles

- Inventory balances are calculated from transaction history instead of directly overwritten.
- Spray, fertilizer, production and sales operations use transactional RPCs where consistency matters.
- Deletes are generally soft deletes and important changes are written to audit logs.
- Official pesticide / fertilizer reference data is separated from operational master data.
- OneDrive metadata is stored in Supabase while sensitive Microsoft credentials are stored through the private storage configuration / Vault flow.

## Repository layout

- `src/pages` - application screens
- `src/lib` - Supabase/API access and domain logic
- `supabase/migrations` - database schema and permission migrations
- `supabase/functions` - active and archived Edge Function source
- `.github/workflows/ci.yml` - typecheck/build CI
- `.github/workflows/pages.yml` - GitHub Pages staging + Vercel mirror build
- `vercel.json` - production rewrites to the GitHub Pages mirror

## Development

```bash
npm install
npm run check:manual
npm run typecheck
npm run build
npm run dev
```

Before changing production database authorization, RLS, RPCs or Edge Functions, review Supabase security advisors and verify the affected workflow after deployment.

## Archived one-time functions

One-time bootstrap/debug/import functions may still exist in the Supabase project for deployment history. They must return `410 Gone` and must not contain active privileged bootstrap behavior.

`seed-pesticide-reference` is archived and intentionally disabled.
