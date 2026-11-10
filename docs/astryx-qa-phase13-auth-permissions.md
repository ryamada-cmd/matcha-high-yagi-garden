# AstryX QA phase 13 — actual frontend authentication and permission-provider contract

## Production metadata inspection (2026-11-10, read-only)
Using the linked `yagi-garden-manager` Supabase project, catalog-only queries established:
- All **90** base/partitioned tables in `public` had `relrowsecurity=true`.
- **0** public tables lacked RLS.
- Selected key policies for `profiles`, `sales_records`, `crm_inquiries`, `external_files` and `role_permissions` restrict access via `auth.uid()`, `has_app_permission()` or deliberate deny policies, depending on the table.
- Security advisor warnings include six anonymous-callable `SECURITY DEFINER` RPCs used by AI integrations. Source inspection found token/authorization checks, but this is **not** a penetration test or proof of security. No RPC privileges or database records were changed.

Importantly, an `anon` **SQL grant** does not mean rows are readable if RLS disallows access. An enabled RLS switch does not prove every RLS policy is correct. Do not rewrite this assessment as an all-clear.

## New actual-app browser tests
The dedicated `qa/auth/index.html` entry mounts the **real** `src/App.tsx`
and **real** `src/lib/permissions.tsx`, replacing only the Supabase client and
heavy page modules with local, no-network synthetic implementations.

`qa/auth/auth-permissions.e2e.mjs` drives both Chromium and Linux WebKit with
390px iPhone-like viewports:
1. Logged-out visitor sees sign-in form, invalid password error and simulated successful login.
2. Unapproved `viewer` is held at the approval gate, not the app.
3. Worker with `sales.view` can open the sales route but cannot see settings navigation.
4. Worker navigating directly to `/settings` sees access denied.
5. Admin can view settings and operate the mobile menu.
6. Permissions RPC failure hides the protected route and shows an error.
7. Admin demoted to viewer via the real permission-refresh event loses access.
8. Logout clears the fake session and reveals the sign-in form.

Every request outside `127.0.0.1:5179` aborts **and fails the test**.
No production credentials, emails, Supabase users, role changes or business data
are used. The production app build remains unchanged.

## Limitations
These 16 browser scenarios exercise **frontend authentication and permission rendering**.
They do NOT create real Supabase Auth sessions, exercise real PostgREST as
`anon`/`authenticated`, validate the full database RLS policies or
revoke actual access tokens.

A hosted Supabase branch/project could incur charges; none is created here.
For real integration: use a dedicated local Docker stack with reproducible schema and
fully synthetic users, or a separately authorized staging project with explicit cost approval.

Published source code includes QA-only fake credentials like `qa-password-123`;
they are not accepted by the production authentication service.
