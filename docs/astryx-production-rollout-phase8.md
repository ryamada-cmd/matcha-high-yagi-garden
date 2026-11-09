# AstryX production rollout — Phase 8 (storage, library, manual, settings)

## Scope
- Storage and photo gallery: AstryX page styles and refresh Button.
- Document library: AstryX action Buttons and statistic Cards.
- User manual: AstryX Card introduction.
- Settings and audit: AstryX page styles and refresh Button.

## Safety
- Only 4 TSX presentation pages and this document change.
- Existing OneDrive API, Microsoft Graph integration, role permissions, file upload/download,
  audit records, server security, storage registration and user management logic are retained.
- The source state/side effects and business functions before the JSX return are identical
  to `main`; Storage photo gallery mode has only a styling class added.
- No database schema, auth policy, credential setting, or server function changes.
- No development-preview client-side read-only override.

## Release checklist
1. GitHub CI check: manual, harvest, typecheck and Vite build all green.
2. Review PR changed files to ensure UI-only source + this document.
3. Merge via PR to `main` after checks pass.
4. Independently verify GitHub Pages mirror publication and production site view.
5. Visually inspect file view, gallery, library navigation, manual and settings at mobile width.
6. Do not test actual role changes, uploads or deletions against real data solely for UI validation.
7. Revert this phase 8 merge if serious presentation regression appears.

## Final scope note
This completes the initial AstryX presentation-level rollout across 33 app screens.
It does **not** imply every native field or table was replaced with an AstryX component,
nor does it prove every authenticated write workflow passed end-to-end mobile QA.
