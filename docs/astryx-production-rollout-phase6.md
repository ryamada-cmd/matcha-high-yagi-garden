# AstryX production rollout — Phase 6 (costing, sales, documents, CRM)

## Scope
- Costing: AstryX Card KPI tiles and save Button.
- Sales: AstryX Card financial tiles, refresh and save Buttons, and search TextInput.
- Documents: AstryX Buttons, search TextInput, Field and Dialog for customer management.
- CRM: AstryX tabs, search TextInput, critical form Fields and action Buttons.

## Safety and compatibility
- Four presentational TSX pages only, plus this release note. The existing `main` business/service code is retained.
- Supabase service, database schema/RLS, authorization, costing math, transactional sales operations,
  CSV export, document PDF/storage, CRM mail integration and reply-generation logic are unchanged.
- Do not copy development-preview's client-side read-only guard into production.
- Existing AstryX Matcha theme, component dependencies, and scoped CSS in `main` are reused.
- Prior PR #30 (phase 5) must remain present on `main`.
- This release does not claim authenticated device E2E coverage for each financial or email workflow.

## Gate before production merge
1. TypeScript/Vite build and GitHub CI pass.
2. Review exact PR diff (only four pages + this document).
3. Confirm no changed CRUD, RPC, security policies, data migrations, mail edge functions or Supabase settings.
4. Merge using a PR after required checks pass.
5. Confirm GitHub Pages production-mirror build succeeds and the live app loads.
6. Read-only mobile checks on costing, sales, documents and CRM pages; do not create or
   cancel a real sale, send email, or change an invoice solely for a UI smoke test.
7. If issues are found, isolate a UI hotfix or revert the phase 6 merge.

## After release
Remaining screens for phases 7+:
- Daily reports, calendar, expense claims, vendor invoices,
  storage/files, library, manual, and settings/audit.
