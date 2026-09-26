# Production status

Last reviewed: 2026-09-27 (Asia/Tokyo)

## Environment

- Production: https://yagi-garden-manager.vercel.app/
- Frontend: React 19 / TypeScript / Vite
- Database/Auth: Supabase `mdbtngousidfanmrjybt` (Tokyo, ap-northeast-1)
- External storage: Microsoft OneDrive / Microsoft Graph
- Source: `ryamada-cmd/matcha-high-yagi-garden`
- Delivery: GitHub Actions -> GitHub Pages root mirror -> Vercel rewrite

## Verified production health

- Supabase project: ACTIVE_HEALTHY
- GitHub CI: typecheck/build/manual coverage passing
- GitHub Pages production mirror: passing
- Vercel production URL: HTTP 200
- Existing auth users and profiles: 6 / 6
- Role counts at review: 2 admins / 4 workers
- Permission definitions: 61
- Role permission rows: 122 (complete admin + worker matrix)
- Negative pesticide inventory balances: 0
- Negative fertilizer inventory balances: 0
- Negative production inventory balances: 0
- Expense claim total mismatches: 0
- Vendor invoice total/payment mismatches: 0
- OneDrive file rows without a link: 0

## Security hardening completed

### Archived bootstrap/debug Edge Functions

The production-only historical functions below are disabled and return 410 Gone:

- sync-famic-bootstrap
- seed-pesticide-reference
- import-guideline-snapshot
- debug-famic-source
- onedrive-backfill-once

`seed-pesticide-reference` previously contained privileged seed behavior. It is now archived, JWT verification is enabled, and the deployed implementation always returns 410 Gone.

### Pending-user approval

New self-registered users no longer receive worker permissions automatically.

- New accounts are created with the `viewer` role.
- `viewer` has zero application permissions.
- A viewer sees only the pending-approval screen.
- An admin can change the user to `worker` or `admin` in Settings.
- Existing users were not changed.
- The final admin cannot be demoted to worker/viewer.

### RLS / metadata

- RLS auth.uid initialization warning fixed on profiles.
- Duplicate permissive OneDrive SELECT policies consolidated.
- app_settings and audit_logs direct access explicitly denied.
- app_permission_definitions and role_permissions direct client access removed; access remains through permission-checked RPCs.
- pg_trgm moved from public to extensions schema.
- Public schema CREATE is not available to anon/authenticated.
- Anonymous users cannot execute SECURITY DEFINER functions.

## End-to-end transactional smoke test

The full crop-to-sale chain was exercised in the production database inside a single transaction and rolled back.

Scenario:

1. Harvest: 100 kg fresh leaf
2. Primary processing: 100 kg -> 20 kg tencha
3. Secondary manufacturing: 10 kg tencha -> 9.8 kg matcha
4. Product master: 30 g matcha SKU
5. Packaging: 3 kg -> 100 units
6. Sale: 10 units x JPY 3,500

Observed before rollback:

- Fresh leaf remaining: 0 kg
- Primary tencha lot remaining: 10 kg
- Matcha lot remaining after packaging: 6.8 kg
- Product stock after sale: 90 units
- Sales amount: JPY 35,000
- Cost amount: JPY 2,846.94
- Gross profit: JPY 32,153.06
- Field-to-sale traceability rows: 1

Rollback was verified: harvest, processing, production, product, packaging and sales production tables returned to their previous zero-record state.

## Current Supabase advisor status

Security advisor remaining items:

- Signed-in users can execute SECURITY DEFINER functions: expected for the current permission-checked RPC architecture; review incrementally rather than bulk-changing.
- Leaked password protection disabled: current Supabase organization is on Free; enable if/when the project moves to a supported paid plan.

Performance advisor remaining items:

- Unindexed foreign keys: informational; add indexes based on actual hot queries as operational data grows.
- Unused indexes: informational; do not remove while several modules still have little/no operational data.

## Operational data coverage

Already used with real data:

- Fields
- Pesticide inventory
- Spray records/history
- Spray plans
- Fertilizer master/inventory/applications/plans
- Expense claims
- Vendor invoices/payments
- Sales documents
- OneDrive/file links/photo data

Implemented and transactionally verified, but production business data is still sparse or zero:

- Harvest
- Tea processing
- Production/manufacturing
- Product master
- Product packaging/SKU stock
- Sales/shipping
- Equipment
- Daily reports

## Recommended next development phase

1. Enter the first real harvest/processing/production/product/sale chain and compare app calculations with source documents.
2. Perform authenticated mobile/iPhone usability testing for every write form.
3. Add targeted database indexes only after real query patterns appear.
4. Refactor SECURITY DEFINER RPCs incrementally when touching each module.
5. Consider replacing the GitHub Pages mirror with direct Vercel deployment after the application workflow is stable.
