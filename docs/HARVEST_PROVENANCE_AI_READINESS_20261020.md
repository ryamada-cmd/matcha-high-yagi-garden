# Harvest provenance and AI Office readiness — 2026-10-20

## Purpose

Preserve historical imported harvest inventory, while allowing **new** verified
harvest records to be distinguished from incomplete imported records. Avoid
overstating harvested area or period production in AI reports.

## Branch and deployment safety

- Branch: `feature/harvest-provenance-ai-readiness-v1` — separate from `main`.
- Production data **not edited**. No stored harvest dates, field IDs, area
  values, processing batches or historical inventory totals were modified.
- Two SQL migrations below are **proposals in this branch, not applied**.
  Any source Production schema change requires a separate approval/review.
- The Riverside AI Office Staging-only contract has additionally been prepared
  to accept an explicitly labeled `attributed_subset` quality status.
  Actual source RPC still returns the original statuses until SQL approval.

## Implemented frontend and client validation

- Date is explicitly required for a new harvest; no more silent acceptance of
  an empty date in the UI/service-layer save function.
- Validate field IDs (including duplicates), positive total/per-field kg,
  exact summed kg, and optional **measured** harvested-area values.
- Actual harvested areas remain optional for field work; if any is missing,
  field-master acreage is **reference only**, never a measured area for AI.
- Show distinct historical record flags:
  - Ready: real dated harvest, linked fields, recorded field areas and kg
  - Unattributed: missing dated/field provenance, including imported stock
  - Area unverified: valid date and field kg but incomplete measured area
  - Quantity unverified: mismatched or invalid allocated kg
- The **measured total** remains distinct from the total-only mode's
  **estimated field shares**. Do not label area-based allocation as actual
  independently measured per-field yields.
- Existing imported records are not backfilled or given assumed dates.
  The manual source-finalization form explicitly requires documentary
  confirmation before an operator supplies a date or field.

## Database observations (read-only)

Previously verified from source Supabase: 17 active existing harvest records,
all currently undated and without active field associations. Their stored
inventory weight is real, but cannot be assigned to a given period. The
legacy field-master acreage cannot stand in for actual harvested acreage.
The first test for 2026 year-to-date returned `incomplete_provenance` with
three JSON null metrics.

## Proposed database changes (not applied)

1. `20261020143000_require_explicit_harvest_date.sql`: changes
   `save_harvest_record(jsonb)` to reject a missing date rather than falling
   back to `current_date`. Carries over the current permissions,
   use-in-processing safeguards, audit history and multi-field allocation.
   This does **not** mutate historical rows.
2. `20261020153000_ai_harvest_attributed_subset_proposal.sql`: changes the
   existing narrow Yagi read-only source RPC so a fully evidenced dated
   record can be reported as `attributed_subset` if older undated imports
   coexist. This number reflects only verified date-attributed records;
   it must **never** be presented as the full period or farm output.
   With zero dated records, the current null/`incomplete_provenance`
   behavior is unchanged. It preserves the source token-hash gate and
   returns the same three allowlisted aggregates only.

## Verification and production readiness

- Run `npm run test:harvest`, `npm run typecheck`, `npm run build` in CI.
- Check smartphone date-required inputs, total-only and per-field modes,
  per-record provenance badges, and historical source-finalization dialog.
- Validate SQL in a dedicated test database before applying either migration
  to Production; ensure no unintended permission broadening.
- For future source RPC promotion, update AI Office Staging UI to display
  `attributed_subset` visibly and test a synthetic 2-field dated event in a
  test DB. Do not manufacture dates in the real source to force green metrics.
- After successful test, request a separate approval to apply the two
  schema/function changes in Yagi Production. Avoid merging the branch into
  `main` before this review.

## Preview safety gate and known limitation

Yagi Vercel project currently has **no Git repository connection** in its
Vercel project settings, so branch-scoped Preview environment variable creation
is unsupported. The review deployment is invoked manually using an explicit
Git commit SHA and no Production target.

The existing browser client defaults to the live Yagi Supabase project.
Therefore the harvest/processing page detects Vercel non-production
hostnames and disables its mutation buttons (new record, edit, delete,
source finalization and processing). It is appropriate for **view-only**
UI checks, NOT for submitting mock harvests. This browser guard is
not a security boundary for every other application route, and does
not isolate the Production database. Avoid editing data anywhere on this
review deployment. A dedicated Supabase test project is required before
testing full write behavior. Do not deploy the proposed SQL to Production
solely to exercise Preview UI.
