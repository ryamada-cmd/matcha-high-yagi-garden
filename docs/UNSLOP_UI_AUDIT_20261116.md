# Unslop UI audit, 2026-11-16

This is a **static source audit**, not a browser repro. Findings below are candidates to verify, not confirmed bugs.

1. `src/main.tsx` loads AstryX core reset and Matcha theme followed by many legacy CSS layers and finally `ui-system.css`, `unified-ui.css`, `ui-refresh.css`, `ui-refresh-safety.css`, `ui-cohesion.css`, `astryx-ui.css`. Cascade conflicts require inspection.
2. `src/ui-system.css` gives general page form inputs their borders, padding, heights and focus treatment.
3. `src/ui-cohesion.css` uses broad `.page input/select/textarea` selectors with `!important` borders and focus shadows.
4. `src/astryx-ui.css` adds AstryX-scoped UI styles as well as root variables. Diagnose its overlap with legacy selectors using computed styles, not guesswork.
5. `src/components/AppDialog.tsx` already protects mobile keyboard/visualViewport scroll behavior; retain it.
6. `qa/astryx-all-pages.e2e.mjs` covers 33 synthetic screens including Chromium 320/390/1280 and WebKit 390px, input legibility and overflow checks.
7. `.github/workflows/pages.yml` deploys after changes to main, so use a dedicated feature branch.

## Priority for phase 2
- Dashboard: inspect dense information hierarchy and consistency of card dimensions.
- Fields: inspect field card and create/edit form, state feedback and mobile layout.
- Form border: inspect nested input wrappers, outline, box-shadow and computed border to confirm root cause of perceived duplicate borders.
- Dialog: inspect keyboard and vertical scroll in WebKit while retaining current safeguards.
- PDF/print: ensure screen-only styles don't leak into document print or saved preview.

Acceptance: screenshots reviewed using identical fixture data, no overflowing at 320/390/1280, single clear input border/focus, text >=16px, no lost functionality or permissions, and all existing build/QA checks green.
