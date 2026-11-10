# AstryX finance and permissions regression — Phase 9

## Added production-code browser coverage (using synthetic fixtures only)
- **Sales / shipping (390px)**: gross sales/cost/profit preview, sale registration, mock stock decrement, sale cancellation + mock stock restoration, overstock rejection, history filtering and mobile overflow.
- **Sales read-only (390px)**: `sales.manage` false hides the sale form while read-only history/export remains available.
- **Annual costing (390px)**: import a sample approved expense line into the cost pool, prevent duplicate import, 12,000 JPY / 20 kg = 600 JPY/kg, 30g estimate 18 JPY, native over-allocation validation, mock FINAL save and original provenance.
- **Costing read-only (320px)**: no add/save buttons; expense inputs disabled, mobile overflow.
- **Route and authorization static regression (33 routes)**: every App route has a `PermissionRoute`, fixed feature permissions, a backing page TSX import, and the pending-approval viewer gate.

## Isolation and proof
- The actual `SalesPage.tsx` / `CostingPage.tsx` and current `main` CSS render through the existing `qa/index.html` entry.
- The QA-only Vite module aliases intercept `../lib/sales`, `../lib/costing`, `../lib/permissions` and replace them with in-memory fakes.
- Any request outside `127.0.0.1:5178` is blocked and makes the browser test fail.
- No live Supabase token, production sale, OneDrive transfer, bank transfer or external call is used.
- The test never imports fake services into the production `src/main.tsx` bundle.

## Trigger
`AstryX browser regression (synthetic-only)` runs for relevant UI/route updates on pull requests and main pushes, and manually.
Screenshots are available under Actions artifacts; no live data appears in them.

## Limitations
- This is a *representative* 4-scenario extension to the existing browser suite, not full 33-screen interactive QA.
- The role exercise checks conditional UI controls under **mocked feature permission responses**. It does not prove production Supabase Auth, RLS, RPC protection or whether an actual user has the right role.
- Do not test real sale cancellation or costing mutation against production data. Integrations need a properly isolated staging project.
- Actual Vercel and Pages delivery verification is a separate release check.
