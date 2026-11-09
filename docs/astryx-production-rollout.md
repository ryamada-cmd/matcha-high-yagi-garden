# Astryx core UI production rollout (Phase 1)

Branch: `release/astryx-core-production`, based on main `e20c5d5c2c33ce70156b8634dfea09091fe34f0a`.

## In scope
- Actual Astryx Matcha theme, core CSS and scoped styling layer.
- Home dashboard, field management, and harvest/processing: Card, Button,
  Badge and page-specific matching styles from the already-validated migration.
- Existing navigation, login and authorization are intentionally untouched.
- Original production `src/lib/supabase.ts` remains unchanged.
- No write-blocking preview guard, preview flag, restricted RPC list or
  global fetch interception is included.

## Out of scope
- Other 30+ views, dialogs, tables and forms remain as-is on production.
- Feature PR #24 remains draft and separate.
- This branch does not change schema, Supabase RLS, OneDrive, OCR or payment APIs.

## Release verification and rollback
1. GitHub CI, typecheck, build, harvest synthetic UI fixture must pass on this PR.
2. Merge only this selective release PR into main.
3. Confirm GitHub Pages workflow produces both the Pages site and Vercel root mirror.
4. Verify production entry/login rendering and major links. Use no business writes
   in an unauthenticated test.
5. Revert the release merge commit on main if post-deploy errors appear.

## Critical
The Astryx feature branch has a preview read-only guard which would disable
business writes if merged wholesale into production. The guard is explicitly
excluded from this selective release.
