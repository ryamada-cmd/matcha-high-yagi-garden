# Unslop rollout for 五代目八木一兵衛 茶園管理システム

Date: 2026-11-16. Repo: ryamada-cmd/matcha-high-yagi-garden.

## Scope and design
Official Unslop development skill is vendored in `.agents/skills/unslop`. It is **not** a runtime package and does not need npm install or Supabase changes. Designed for Codex/Work agents via `$unslop`. Claude Code plugin installation remains separate. Attribution: Damir Sokolovsky, https://github.com/heydamir/unslop, CC BY 4.0.

- Product: Japanese tea-farm operation dashboard for fields, spraying, fertilization, harvest, manufacturing, inventory, sales and documents
- Character: 誠実・精密・落ち着き
- World: 京都の茶園・茶葉・業務台帳
- Moments: 圃場ID/面積などの実務データと、本日の作業・警告
- Signature: 圃場IDと状態表示の一貫性

## Phases
1. **This PR:** install official skill and document baseline code audit. No changes to active UI or production logic.
2. Review before screenshots and improve `src/pages/HomeDashboardPage.tsx`, `src/pages/FieldsPage.tsx`, `src/home-dashboard.css`, related scoped AstryX styles; audit first.
3. Consolidate forms, modals, spraying/fertilizer/harvest UI.
4. Expand by feature to inventory, production, sales, documents, CRM and remaining pages.
5. Full regression + controlled release.

## Implementation safety
Existing styles are layered in `src/main.tsx`: legacy CSS then `ui-system.css`, `ui-cohesion.css`, `astryx-ui.css`. Do not add another global CSS layer without diagnosing duplicate borders and styles. Keep AstryX Matcha tokens as baseline, prefer scoped component fixes. Preserve all content, permission logic, save operations, PDF/print styles, OneDrive preview, external integrations, and mobile dialog's visualViewport behavior. Never test on production data.

## Verification
Use existing mock QA:
```bash
npm ci
npm run check:manual
npm run test:harvest
npm run typecheck
npm run build
npm install --no-save playwright@1.56.1
npx playwright install chromium webkit
npx vite --config qa/vite.config.ts --host 127.0.0.1 --port 5178
# In another terminal:
node qa/astryx-all-pages.e2e.mjs
node qa/astryx-filter-controls.e2e.mjs
node qa/astryx-dialog-scroll.e2e.mjs
```

Capture screenshots at Chromium 320/390/1280 and WebKit 390px before and after each UI change. Confirm no unwanted horizontal scrolling, control font >=16px on phone, reachable save buttons, single visible focus/border treatment, and accessible error/selected feedback. Browser QA is synthetic and does not prove authenticated production writes. Merge into main only after tests and review; revert a faulty UI PR.
