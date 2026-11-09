# Astryx UI migration — Yagi Garden Manager

## Branch and scope
Branch: `feature/astryx-ui-migration`, separate from `main`.
Stage 1 adds actual Astryx core components, Matcha built theme and a visual layer to:
- shared app shell (brand / navigation color system only),
- home dashboard (`/`): Astryx `Card` for KPI overview, `Badge` for status, `Button` for refresh,
- fields (`/fields`): Astryx `Card` for KPI metrics, `Button` for add/refresh,
- harvest and processing (`/harvests`): Astryx `Card` for KPI metrics and `Button` for refresh.

The *existing* data loaders, user permissions, Supabase mutations, forms,
business calculations and router are deliberately unchanged.

## Architecture and dependencies
- React 19 / Vite / TypeScript remain in use.
- `@astryxdesign/core` + `@astryxdesign/theme-matcha` + `@stylexjs/stylex`
- Theme provider is installed at root in `src/main.tsx`.
- CSS imports: Astryx reset -> components -> Matcha theme, then legacy project CSS,
  then `src/astryx-ui.css` last until migration of legacy selectors completes.
- Astryx components are imported by documented component export paths.
- Existing mobile bottom navigation and permission-controlled links stay intact.

## Safety
**Do not merge without build and mobile tests.** No database migration is included.
Avoid editing real business data on preview deployments: the preview may use the
production Supabase project. The harvest page has a production-alias read-only
guard, but other modules may still allow edits.
- Verify permissions for viewer / worker / admin.
- Check sign in, desktop navigation and mobile menu.
- Confirm fields create/edit/delete after explicit isolated test setup.
- Confirm harvest entry modes, multiple fields, real area estimates and provenance.
- Confirm processing batch linking, read-only preview behavior, and source audits.
- Run `npm install`, `npm run typecheck`, `npm run build`, `npm run test:harvest`.
- Compare mobile (iPhone, 320–430px) and desktop (>=1024px).
- Roll back by reverting the branch changes; `main` remains unchanged.

## Next stages
1. Move UI primitives into shared Astryx wrappers and retire old overrides.
2. Migrate core data entry screens (spray, fertilizer, inventory) without logic changes.
3. Migrate production, costing, sales, documents, CRM and storage screens.
4. Run full visual regression / accessibility review, then open release PR when ready.

Reference: https://github.com/meta/astryx

## Stage 2 (AstryX components, no business logic changes)
- `/sprays`: migrated refresh, chemical-add and save actions to Astryx Button;
  basic-info/chemical/field/confirmation cards plus history and summary to Card.
- `/fertilizer-applications`: refresh and submit actions to Astryx Button;
  N/P/K and total previews to Card.
- `/inventory`: stock metrics and list/history containers to Astryx Card;
  receive, refresh, and tabs to Astryx Button.
- `/fertilizer-inventory`: receive and refresh actions to Astryx Button;
  stock metrics and listing panel to Astryx Card.
- Added responsive styles in the existing `src/astryx-ui.css` layer.

All original state machines, data loaders, save/update/delete functions, field
selection, dilution/allocation, N/P/K calculations and validations remain in place.

### Stage 2 QA checklist
- [ ] Spray dilution/stock warnings, 1000 L/300 L/1200 L quick options, field selection
- [ ] Spray history, read detail, role-gated edit and delete actions
- [ ] Fertilizer N/P/K / inventory shortage, editing delta and history
- [ ] Inventory tabs, search, received lot, stocktake and disposal dialogs
- [ ] Fertilizer lot lookup, stock search, receive/stocktake/disposal
- [ ] Smartphone bottom navigation, keyboard focus and safe-area handling

**Warning:** Non-production Vercel previews may still point at the production
Supabase instance. Do not execute write tests without an isolated test database.

## Stage 3 (history and raw-material / production UI)
- `/spray-history`: Astryx KPI cards, filter/history containers, CSV/refresh.
- `/fertilizer-history`: Astryx summary tiles, filter/history/annual NPK containers,
  CSV and refresh.
- `/tea-inventory`: eight Astryx KPI cards, search filters and lot listing
  containers, refresh.
- `/production`: Astryx overview metrics, inventory receive/refresh actions
  and inventory/manufacturing/cost tab controls.
- Calculation, lot provenance and CRUD functions are unchanged.

**Visual QA still pending** for responsive layouts and authenticated workflows.
