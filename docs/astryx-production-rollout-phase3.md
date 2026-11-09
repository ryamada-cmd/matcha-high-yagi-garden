# Astryx production rollout — Phase 3 (spray & fertilizer operations)

## Included
- Spray application: Astryx KPI Cards, Button and TextInput.
- Spray history: Astryx Table, Search, Card and Button.
- Fertilizer application: Astryx KPI Cards, Button and TextInput.
- Fertilizer history: Astryx Cards, Search and Button.
- Fertilizer inventory: Astryx Cards, Dialog and Buttons.

## Intentionally unchanged
- All Supabase service modules, authentication and authorization.
- Calculations, fertilizer/pesticide application safeguards and inventory ledger rules.
- Database schema, RPC functions and external APIs.
- Preview-only read-only mutation guard and feature-branch global fetch interception.

## Verification and deployment
- Pull request CI TypeScript and Vite build must pass.
- Main workflow builds both GitHub Pages and Vercel mirror after merge.
- As these five operation pages are not yet part of the full synthetic E2E
  fixture, UI interactions with production data must still be verified manually.
- If errors appear, prefer a scoped hotfix. Roll back this release commit if
  operational behavior breaks.
