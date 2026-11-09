# Astryx production rollout — Phase 4 (catalog, plans, dossier and equipment)

## Scope
- Pesticide master/catalog: genuine Astryx Cards and Buttons.
- Annual plans + fertilizer planning: genuine Astryx Buttons and existing forms.
- Field dossier: Astryx actions with existing field detail & navigation logic.
- Equipment ledger: Astryx Cards, searchable list, asset and service
  Dialog/DialogHeader, required Fields and submit Buttons.

## Safety and compatibility
- Selectively copy exactly five TSX presentation files from the feature branch.
- No Supabase module, authentication, RLS, SQL, OCR or business service changes.
- Feature-branch preview-only mutation guard is explicitly not included.
- Production's existing Astryx theme and Stage 19 equipment dialog styles
  are already present in src/astryx-ui.css and are left unchanged.
- No database writes made by the synthetic browser QA.

## Checks before/after release
- CI TypeScript/typecheck and production Vite build must pass on this release PR.
- Existing synthetic QA previously passed the real EquipmentPage's asset
  create, maintenance record save, required Fields and Escape dismissal.
- Pesticide/plan/dossier-specific authenticated browser E2E is still pending;
  this is not a guarantee of every workflow in production.
- Merge to main, verify main CI and Pages deployment success.
- If a login, write, or screen issue appears, hotfix only the affected view;
  revert phase-4 squash commit if necessary.
