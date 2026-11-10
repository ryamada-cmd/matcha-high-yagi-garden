# AstryX QA phase 10 — manual, document library, OneDrive, and settings

## Actual page components tested
- `ManualPage`: search, no-results, full guide, iPhone 390px width.
- `StoragePage`: OneDrive file list, filtering, fake uploaded file, nonmanager visibility of Microsoft credentials and upload controls, 390/320px widths.
- `LibraryPage`: KPI/list, cross-field search, category filter, file details dialog, synthetic file + metadata save, no-upload role, 390/320px widths.
- `SettingsPage`: audit filtering and detail, settings warnings, role permission switches, locked permissions, read-only role, 390/320px widths.

These are **7 new scenarios**, supplementing the existing 22 synthetic browser tests. The tests use the actual React screen components and CSS; only services and test-specific weather/gallery placeholders are mocked.

## Isolation
- A dedicated `qa/vite.config.ts` module alias loads in-memory `qa/mockExternalStorage.ts`, `qa/mockDocumentLibrary.ts`, `qa/mockAdminConsole.ts` and mock permission/child components.
- Browser route interception blocks and fails on *any* network attempt away from `127.0.0.1:5178`.
- Fake names and `.invalid` email addresses only; no live tokens, OneDrive, database or settings changes.
- No changes to production app services, authentication, databases, sales, payments or live document files.
- Screenshots in GitHub Actions artifacts remain available for 7 days.

## Limitations / outstanding
- The `PhotoGallerySection` and `WeatherLocationSettings` child components are placeholders in this test fixture; their actual functions have **not** been tested.
- Role-check assertions use synthetic `useAppPermissions` results and do not validate real Supabase Auth/RLS/Edge Function enforcement.
- Microsoft OAuth, token rotation, file download, preview and OneDrive live folder permissions remain untested.
- A real isolated staging Supabase + OneDrive test account is required before full integration tests.
- Production GitHub Pages/Vercel delivery verification must be treated separately from successful CI and merges.
