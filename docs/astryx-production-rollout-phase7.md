# AstryX production rollout — Phase 7 (daily reports, calendar, expenses, vendor invoices)

## Scope
- Daily reports: Field/TextInput for key entries, KPI Cards, Buttons.
- Calendar: Cards, action Buttons, task entry Dialogs and critical Fields.
- Expense claims: Field/TextInput for key entries, KPI Cards, Buttons.
- Vendor invoices and payments: Cards, TextInput/Field, Buttons, payment Dialog.

## Safety
- No changes to Supabase services, DB schema, RLS, RPC, receipt uploads,
  notification/delivery integrations, expense approval rules or payment calculations.
- Only 4 TSX pages plus this release checklist.
- Before the rendered page begins, the existing functions, state and effects
  match `main` exactly after normalizing AstryX imports.
- Uses CSS and AstryX dependencies already on `main`.
- Do not include development preview's client-side write blocker.

## Release gate
1. TypeScript, Vite build and GitHub CI successful.
2. Review PR touched paths; no business logic or backend modifications.
3. Merge via PR after CI.
4. Verify GitHub Pages production mirror update independently if possible.
5. Verify read-only page navigation at phone and desktop widths.
6. Authenticated write-path tests (payments, approvals, uploads) remain operator-only;
   do not create real invoices or pay anything as part of UI smoke testing.
7. Revert only phase-7 commit if regression found.

## Remaining after this phase
Storage / OneDrive, library, manual and settings / audit.
