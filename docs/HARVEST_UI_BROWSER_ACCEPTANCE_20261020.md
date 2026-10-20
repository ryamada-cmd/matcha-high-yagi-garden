# Harvest Processing UI — synthetic browser acceptance report
2026-10-20 | Development only | PR #13 (draft)

## Scope and safety

This is an automated browser interaction test of the **actual**
\`src/pages/HarvestProcessingPage.tsx\` component.

- The isolated Vite entry is \`qa/index.html\`, with source-only configuration
  \`qa/vite.config.ts\` and \`qa/main.tsx\`.
- The plugin replaces the page's live Supabase operations and permissions
  with \`qa/mockHarvestProcessing.ts\` and \`qa/mockPermissions.ts\`.
  These are **in-memory synthetic fixtures only**. They do not import the
  Supabase SDK, credentials, user files, live Yagi rows, or production settings.
- The test browser aborts and fails for ANY network request to a host other
  than \`127.0.0.1:5178\`. No real Yagi/API traffic is possible.
- The fixture loads the **same stylesheets, in the same order**, as the
  Production application entry \`src/main.tsx\`. The default Vite application
  build does not include \`qa/index.html\`.
- This is not an authenticated admin browser test; use of the real
  user's account or real source data is explicitly excluded.

## Automated scenarios

\`node qa/harvest-ui.e2e.mjs\` using headless Chromium:

1. **390px mobile / per-field mode**: 17 synthetic imported undated
   records show as unknown; actual harvest date is initially **blank and
   required**; selecting 2 fields and entering measured kg (30+70) and
   area (600+1,400m²) passes validation and stores a synthetic new row
   in memory only. History badges then show 1 verified + 17 unattributed.
2. **390px mobile / total-only mode**: 100kg total is apportioned between
   the two fields; missing actual measured areas stay \`null\`, so the
   record is marked **area unverified**, not reported as AI-ready.
3. **1280px desktop / history**: 17 imported lots remain marked as
   un-attributable; no viewport overflow or external requests.
4. **320px compact mobile**: selecting multiple fields and history listing
   do not cause horizontal page overflow or external requests.

All scenarios are checked for unexpected browser JavaScript errors and
external network traffic. The 390px execution writes a screenshot to the
GitHub Actions artifact, not to the Yagi database.

## Linked build and browser CI

- Browser CI: https://github.com/ryamada-cmd/matcha-high-yagi-garden/actions/runs/39391849363
- TypeScript/typecheck/Vite build CI:
  https://github.com/ryamada-cmd/matcha-high-yagi-garden/actions/runs/39391849338

## Additional safeguard

New harvest dates are **not prefilled with the current date** in the
development UI. Operators must deliberately select a harvest date. The
source Production RPC has already been approved and migrated to reject
missing dates rather than substituting \`current_date\`.

## Remaining release gates

- Draft PR #13 is **not merged** into \`main\`; Yagi Production frontend
  is unchanged and the Riverside AI Office Production app remains unchanged.
- The review Preview currently points to the default **Yagi Production
  Supabase** project. Its harvest/processing edit buttons are disabled,
  but other application routes are **not database-isolated**. Do not
  enter test data using the Preview.
- Full login + real database write E2E was **not executed**. A truly isolated
  Yagi test project/DB is needed to test backend write operations without
  touching production data.
- Before merging and deploying the frontend, have the owner review this
  report and separately approve the **application Production deployment**.
- After a future approved release, perform admin login/read-only smoke
  tests, verify source date validation, and monitor error/audit events.
  Revert application deployment independently from SQL function rollback.
