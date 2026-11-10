# Mobile permission error visibility and retry

## Problem
When the actual `get_my_app_permissions` RPC fails, `AppPermissionProvider`
clears the role and permissions (fail-closed). But `AppShell` displayed the
resulting `permissionError` only inside the **desktop sidebar**; at mobile
widths it was hidden. Users would see only an access-denied message without an
explanation or recovery action.

## Fix
- In `src/App.tsx`, render the existing permission error in a mobile-visible
  `role="alert"` banner **inside the main content area**.
- Offer a `権限を再取得` button calling the actual `useAppPermissions().refresh`
  method; do not make up client-side grants or bypass the route guard.
- Keep desktop error in the sidebar as before.
- Reuse existing notice and secondary button design and wrap long content at
  narrow widths.

## Regression coverage
`qa/auth/auth-permissions.e2e.mjs` uses the actual App and provider:
- When permission RPC fails, protected routes remain inaccessible and the
  error/retry button is **visible on a 390px viewport**.
- A transient RPC failure can be retried; access returns only after a successful
  response from the synthetic permission RPC.
- Chromium and WebKit both exercise these cases. The synthetic-only
  `qa/auth/mockSupabase.ts` has no production connectivity.

## No backend changes
Production Supabase, RLS, profiles, role permissions, OAuth, Microsoft,
financial data and live sessions remain unchanged. This is a UI error
feedback/recovery improvement only.
