# Release delivery verification (AstryX / Yagi Garden)

`main` pushes run the existing two-build GitHub Pages workflow:
1. Staging build: `/matcha-high-yagi-garden/`.
2. Vercel rewrite source: `/vercel-build/` with root-relative assets.

After both builds, the workflow inserts a read-only
`<meta name="yagi-release-sha" content="<40-char Git SHA>">` in both published entrypoints.

After the Pages deployment action succeeds, the deploy job probes:
`https://ryamada-cmd.github.io/matcha-high-yagi-garden/vercel-build/index.html`
with cache-busting queries and must find the exact current commit SHA.
It retries to tolerate Pages/CDN propagation delays and fails loudly if it cannot verify.

The job also makes a best-effort read-only check of the Vercel domain
`https://yagi-garden-manager.vercel.app/`.
If Vercel access is protected or the rewrite appears stale, it emits a warning:
**do not treat a Pages success as a confirmed Vercel-origin success.**

This change does not touch Supabase, its credentials, data, application logic or permissions.
It makes the distinction between a successful merge and an independently verified live release observable.

**Manual check:** View page source on the production URL and look for
`yagi-release-sha`, then compare with the newest commit on `main`.
Authenticated functional QA is separate from release delivery verification.
