# Astryx production rollout — Phase 5 (tea inventory, processing, procurement and packaging)

## Scope
- Tea inventory dashboard: Astryx Cards and action Buttons.
- Production and processing work log: Astryx Cards and action Buttons.
- Tea procurement management: Astryx Cards and action Buttons.
- Product packaging management: Astryx Cards and action Buttons.

## Guardrails
- Only four presentational TSX pages + this document are changed.
- No existing Supabase service, auth/RLS/role, pricing, stock calculation,
  processing workflow, provenance, mail or document API is modified.
- No preview read-only guard is included.
- Existing main branch Astryx Matcha theme/CSS contains scoped styling
  for these four pages; shared stylesheet remains unchanged.
- No synthetic E2E covers these four workflow pages yet. Keep real-data
  write tests and account-specific checks for authorized operators.

## Release checklist
1. CI, TypeScript and Vite build success on this PR.
2. Previous phase-4 main branch deployment success.
3. Merge only this PR to main.
4. Verify main CI and GitHub Pages successful deploy.
5. Check major read-only views and report any functional regression.
6. Prefer a scoped hotfix; revert phase-5 squash commit when needed.
