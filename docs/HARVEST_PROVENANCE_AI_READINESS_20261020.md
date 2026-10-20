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

## Isolated executable SQL QA — 2026-10-20

**Result: PASS, with boundaries.** No changes to Yagi Production.

Rather than create a new paid database or use a Production transaction,
we temporarily installed *synthetic-only* tables and rewritten copies of
both proposed SQL functions into private schema
`qa_yagi_harvest_20261020` inside existing, separate
Riverside AI Office Staging project `gtbkauwkovwwyajmngpy`.

- The source drafts were rewritten **only for QA**: all public Yagi
  table/function references were redirected into the QA schema.
  The save function's Supabase authentication/permission calls were
  replaced with a fixed synthetic QA administrator, so this exercise
  validates its SQL and business logic but **not** its actual Production
  authorization integration.
- The source aggregate function retained the digest-based secret check,
  its definer search path, three-field response and date bounds.
  The token used for tests was synthetic, was revoked, and did not
  match Production or AI Office credentials.
- QA schema granted no usage to `anon` or `authenticated`.

Executed SQL behavior and assertions (all passed):

1. No source token → rejected with insufficient privilege.
2. No harvests → `empty_period`, all three metrics `null`.
3. 17 synthetic undated lots → `incomplete_provenance`, all metrics
   `null`. These were not assigned dates or fields.
4. A new harvest with missing date → rejected, no new row saved.
5. Two fields with actual areas 600m²+1,400m² and quantities 30kg+70kg
   → save successful and audit row created.
6. With the synthetic old undated imports present, the two-field
   harvest returned `quality=attributed_subset`, area **0.2ha**,
   leaf weight **100kg**, field count **2**. It is clearly *not*
   the full historic period's result.
7. Total 90kg with 100kg in field children → rejected.
8. New dated row lacking measured area → `incomplete_provenance`
   with `null` values.
9. A child with missing `fresh_leaf_kg` → incomplete rather than
   silently accepting a partial SUM.
10. With the undated/incomplete *synthetic* rows removed →
    `complete` on fully attributable records.
11. Source token disabled → rejected.
12. QA schema inaccessible to `anon` and `authenticated`.

Two SQL design defects were found and corrected in the branch draft:
- Missing semicolon after the source aggregate SQL function terminator.
- Existing child SUM validation could miss NULL values if a partial
  sum coincidentally matched the parent total; now it checks both
  child-count and non-null measured-quantity count.

**Cleanup confirmed:** the QA schema, all fixtures and test routines
were dropped using a shape-checked Staging-only cleanup migration.
A subsequent query confirmed `to_regnamespace('qa_yagi_harvest_20261020')
IS NULL`. No persistent QA tables or records remain.

### Remaining release gates

- The SQL tests ran with recreated *synthetic* schema and mocked save
  authorization. This is not a full clone of Yagi Production and is
  not an authenticated browser end-to-end test.
- No source Production SQL migrations were applied; the old production
  `save_harvest_record` fallback and prior narrow aggregate implementation
  remain unchanged.
- Keep PR #13 as **draft** and do not merge, promote, or mutate Yagi
  Production until an explicit separate approval to deploy both
  source-function migrations and validate role grants plus UI behavior.
- Vercel Yagi Preview shares the default Production Supabase connection:
  its harvest/processing UI write controls are disabled, but the full app
  is not database-isolated and must be treated as view-only.
