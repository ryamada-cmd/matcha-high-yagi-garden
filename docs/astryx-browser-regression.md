# AstryX synthetic browser regression on main

This suite operates only on the `qa/` fixture, never on the production URL or production database.
It reuses the actual React page components and their latest `main` styling while replacing
operations, permission responses and data stores with in-memory mocks.

## How it runs
- Separate entry `qa/index.html` and `qa/vite.config.ts` (not the production Vite entry).
- Network requests outside the local test origin are blocked; tests fail on any attempted external connection.
- No Vercel, Supabase, Microsoft, Google Workspace, or payment credentials are present.
- Chromium at 320/390/1280 widths, UI navigation/dialog/search/save to mock data and horizontal overflow checks.
- Screenshots are retained for 7 days in the Actions artifact.
- Pull requests touching pages or key AstryX CSS trigger the tests, as does an eligible main push.
- `qa/` files are never imported into production `src/main.tsx` or the normal build.

## Running in a local checkout
```sh
npm install
npm install --no-save playwright@1.56.1
npx playwright install chromium
npx vite --config qa/vite.config.ts --host 127.0.0.1 --port 5178 &
node qa/harvest-ui.e2e.mjs
node qa/astryx-ui.e2e.mjs
```

## Important limitations
- This verifies a subset of important page behaviors, not all 33 pages.
- It is an isolated fake-data browser suite, **not** proof that logged-in production write operations work.
- Real sales cancellation, bank/payment status changes, CRM mail sending, stock mutation, OneDrive uploads,
  receipt approvals and document issuance must only be tested by authorized users against appropriate isolated data.
- Check GitHub Pages mirror separately to confirm the latest `main` is actually delivered.
