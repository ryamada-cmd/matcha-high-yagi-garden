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

## Stage 4 (purchasing, commerce, costing and SKU UI)
- `/tea-procurement`: Matcha-themed KPI Cards, Astryx Button for refreshing,
  procurement / blend / stock tabs, and original form submit actions.
- `/costing`: Astryx Cards for pool and reference KPIs, Button for period create,
  refresh and form submission.
- `/sales`: Astryx Cards for sales/gross margin KPIs, Button for refresh,
  export and sale registration.
- `/products`: Astryx Cards for SKU totals, Button for product creation,
  refresh and existing form submission.
- `/price-list`: Astryx Button for refresh and save, scoped themed panel CSS.
- `/product-packaging`: Astryx Cards for SKU stock KPIs, Button for refresh
  and product-packaging form submission.

Only page-level presentation was changed; pricing calculations, traceability,
inventory mutations and role checks are unchanged.
Visual and authenticated write-path regression tests remain outstanding.

## Stage 5 (CRM, documents, scheduling, daily reports and administration)
- `/documents`: Astryx Buttons for estimate / delivery note / invoice
  creation, refresh and the three document-view tabs. Print logic untouched.
- `/crm`: Astryx Buttons for refresh, tabs and new inquiry. Mail sync, reply
  proposal and sending are not modified.
- `/calendar`: Astryx Buttons for refresh/task/harvest plan and Card-based
  task summary metrics.
- `/daily-reports`: Astryx Buttons for refresh/new/submit and Cards for metrics.
- `/expenses`: Astryx Buttons for refresh / CSV export and Cards for metrics.
- `/vendor-invoices`: Astryx Buttons for refresh / CSV export and Cards for
  outstanding / overdue / scheduled / paid metrics.

All sensitive business logic (mail sending, document creation, expense approvals,
payments and OCR) stays as-is. Production DB access from preview must be treated
as **view-only** until an isolated staging database is configured.

## Stage 6 (remaining routes — first-pass Astryx integration)
- `/pesticides`: Astryx Cards for FAMIC/guide stats, refresh and sync actions.
- `/plans`: Astryx add/refresh Buttons.
- `/fertilizers`: Astryx new/sync/refresh and master/official tab Buttons.
- `/fertilizer-plans`: Astryx add/refresh and year selector Buttons.
- `/fields/:fieldId`: Astryx navigation, refresh and harvest entry Buttons.
- `/equipment`: Astryx stock overview Cards, add/refresh and tab Buttons.
- `/library`: Astryx KPI Cards and upload/export/refresh Buttons.
- `/storage` and `/storage?view=photos`: Astryx-scoped visual system,
  OneDrive storage refresh action.
- `/manual`: Astryx Card for guide introduction.
- `/settings`: Astryx refresh action and unified panel visual style.

All route screens now have Astryx theme styles. Most high-impact routes also
use genuine Astryx UI primitives, but the forms, complex tables and modals are
still predominantly custom React/HTML controls. This is *not* yet a claim of
complete component-by-component migration.

### Release blockers
- Do not merge into main yet.
- Browser accessibility QA, responsive visual review, regression tests required.
- Staging DB needed before write-path testing, as Vercel previews may share
  Supabase production configuration. Keep preview interactions read-only.
- Verify global CSS layers and Astryx reset for unaffected components.

## Stage 7: enforced preview read-only gate
A release-blocking safety guard was added to `src/lib/previewSafety.ts`
and hooked through `src/lib/supabase.ts` and `src/main.tsx`:
- All non-GET / non-HEAD Supabase table writes, storage uploads, auth sign-ups
  and unknown RPCs fail closed in the migration branch.
- Only a documented read-only RPC allowlist and auth token/logout POSTs pass.
- Edge Functions are blocked in previews, including on GET, because they may
  have side effects; mail sync, OCR via Edge Functions, external storage writes
  and AI replies are unavailable in read-only review mode.
- A persistent amber banner makes it clear the Preview must not be used for
  registration, editing, deleting, invoicing, sending, syncing or approvals.
- Also guards direct window.fetch to the configured Supabase origin, plus the
  Supabase client's explicit global.fetch integration.
- Pure tests: `npm run test:preview-safety`.

### Important release requirement
`VITE_ASTRYX_PREVIEW_READONLY` defaults to true on this feature branch.
It **must remain enabled** on every preview tied to a production Supabase URL.
An approved production release requires explicit env and DB review, removal or
adjustment of the guard and an isolated staging plan. The gate is not a
substitute for RLS or a complete security review.

## Stage 8: actual Astryx Table and TextInput adoption
- Pesticide inventory: both stock and transaction tables now use Astryx
  `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`,
  `TableHeaderCell` with original cell actions and row render conditions.
  Stock search now uses Astryx `TextInput`.
- Full spray history: searchable, expandable details table moved to actual
  Astryx Table composition; filters retain state and CSV behavior.
- Price list: original editable rows and prices moved to Astryx Table;
  search now uses Astryx TextInput.
- Spray and fertilizer application: operator/weather/method/target fields
  use Astryx `TextInput` (value callbacks preserved); numeric/date inputs
  remain native intentionally to preserve realtime calculations and date
  serialization.
- All complex business forms, tables and dialogs not explicitly migrated
  remain untouched; real device UI QA still required.

## Stage 9: Astryx Dialog for stock and price workflows
- Pesticide inventory receiving, stocktake, disposal:
  native `Dialog` and `DialogHeader` replace the custom backdrop / modal
  while retaining all existing form handlers and validation.
- Fertilizer inventory receiving, stocktake, disposal: same.
- Price-list edit modal: native `Dialog` and `DialogHeader`; price editing
  logic, controlled values and save action unchanged.
- `purpose="form"`: Escape can dismiss an idle dialog, while backdrop
  clicks do not accidentally discard entered values; pending operations block
  close callbacks. Dialog handles native modal focus behavior.
- Confirm on phone that modal content scrolls and keyboard dismissal works.

## Stage 10: auth gateway & tabs
- Sign-in / signup layout uses Astryx `Card` and `Button`; required
  email/password native inputs now use Astryx `Field` shell with stable
  input IDs to preserve native validation and minLength=8.
- Preview mode hides the signup tab and prominently announces read-only.
  Password login, auth session refresh and logout still work.
- Equipment and fertilizer tabs now use Astryx Button labels as intended,
  avoiding duplicate children and count-label rendering.
- Auth and workflow checks need testing with dedicated accounts before release.

## Stage 10: remaining key searches and master dialogs
- Astryx TextInput for fertilizer history, sales, fertilizer master and
  official fertilizer database, product master, vendor invoices and sales documents.
- Astryx Dialog/DialogHeader for product master add/edit and fertilizer master
  add/edit/import; existing form validators, role checks and CRUD functions unchanged.
- Dialog uses purpose=form with native focus management. Backdrop clicks do not
  discard user edits. Close is blocked while an operation is in flight.
- Mobile layout uses a single-column form grid in narrow dialogs.
- Still requires authenticated browser QA and isolated write-path regression tests.

## Stage 11: synthetic browser QA expansion (no real backend)
- Existing QA Vite fixture now wraps real components with Astryx Matcha Theme and
  imports the same core/theme CSS + last project override as production.
- Mock facade wiring added for `InventoryPage` and `PriceListPage`; the
  original `HarvestProcessingPage` fixture remains.
- Synthetic-only stores in `qa/mockInventory.ts` and `qa/mockPriceList.ts`.
  No actual Supabase credentials or requests are used in this QA bundle.
- Playwright checks real Astryx Table/TextInput/Dialog interactions at
  390px, 320px and 1280px, verifies no viewport horizontal overflow, and
  intercepts/blocks every non-local request. Screenshots are CI artifacts.
- Harvest fixture now also asserts actual Astryx KPI Cards and accessible
  refresh action.
- CI workflow `harvest-ui-fixture.yml` runs both fixture scripts on relevant PR.
- To run locally: `npx vite --config qa/vite.config.ts --port 5178`,
  then `node qa/harvest-ui.e2e.mjs` and `node qa/astryx-ui.e2e.mjs`.

## Stage 12: prevent same-origin API bypass
- The preview fetch guard explicitly recognizes the browser origin.
- All same-origin `/api/*` calls are blocked, including `/api/sync-famic`
  (server-side database snapshot replacement) and `/api/ocr-invoice`.
- This includes absolute and relative URLs, GET and POST calls.
- Static assets and external weather lookups remain accessible.
- Supabase read RPCs and login/refresh continue unaffected.
- Two regression tests verify those boundaries.

### QA fixture correction
The first cross-page browser QA run (Actions run 42639657518) passed
Harvest and mobile Inventory but failed at the desktop Price List fixture.
The QA-only `mockPriceList.ts` was missing a `deleteProduct` export required
by the Vite dependency scanner; this was fixed with an in-memory stub.
The QA Vite scanner now scopes entries to `qa/index.html` only; the
Price List Playwright assertion targets the actual visible table row
rather than relying on an unscoped text match.
A fresh GitHub Actions run is required before claiming E2E pass.

### Browser-diagnosed CSS conflict resolved
The full-browser Astryx price-list test exposed a genuine style conflict:
`src/documents.css` applied `display:flex` to the first table cell of
`.price-list-table`; Astryx Table requires a semantic table-cell, and the
product name collapsed to zero width. A narrowly scoped override in
`src/astryx-ui.css` restores `display:table-cell` and vertically stacks
the product/category labels.
The fixture also omitted the desktop sidebar while relying on the app shell's
two-column grid; a noninteractive placeholder sidebar now accurately reserves
the left track in desktop QA. Browser regression checks assert real visible
price-row text and main content width over 650px on desktop.

## Stage 13: desktop price list visibility regression
GitHub Actions' synthetic Playwright run detected a real layout collision:
`src/documents.css` sets `.price-list-table td:first-child {display:flex}`.
AstryX Table expects semantic table-cell layout; the first product-name text
collapsed to a computed width of 0px. The Astryx-scoped CSS now explicitly
restores table-cell display and lays out product text as block children.

A separate QA fixture issue caused its desktop app-shell to reserve a sidebar
column without rendering a sidebar. `qa/fixture.css` now overrides the test
shell at desktop widths only and is imported only by `qa/main.tsx`, never the
production bundle. Keep screenshot checks against both 1280px and 320/390px.

## Stage 14: product and fertilizer Card migration + isolated browser QA
- Product master SKU cards and fertilizer master/official cards use actual Astryx Card components.
- Existing item search, permissions, save and import handlers are preserved.
- The browser test fixture can now mount real ProductMasterPage and FertilizerMasterPage
  with mock modules that have no Supabase imports or credentials.
- QA covers product filter/create at 390px and fertilizer filtering, dialog Escape,
  official data tab at 320px. All external network requests are blocked by Playwright.
- Synthetic writes only modify in-memory QA arrays, never production.

## Stage 15: native form validation retained with Astryx Field
- SKU, product name and fertilizer name now use actual Astryx Field shells
  with stable linked HTML input IDs and a native `required` attribute.
- Existing state setters and submit logic remain untouched; the browser's
  built-in constraint validation continues to prevent blank submissions.
- Playwright confirms native required attributes in the synthetic dialogs.
- Do not replace numeric/date/checkbox inputs without preserving their
  native min/step/required logic and field validation in a dedicated test.

## Stage 16: Calendar, Documents, CRM editing controls
- Work calendar: task editor, annual-plan detail and harvest-plan editor
  now use genuine Astryx Dialog/DialogHeader, preserving submit functions,
  task deletion and date/time native inputs. Task title and harvest season use
  Astryx Field, retaining native HTML required validation.
- Sales documents: customer-master edit/add dialog now uses Astryx
  Dialog/DialogHeader, preserving its existing save and authorization logic.
- CRM: inquiry search uses Astryx TextInput; inquiry subject and company name
  use Astryx Field with native required inputs.
- Existing Supabase logic, data types, email sending and permissions are untouched.
- Isolated browser QA and responsive regression checks are required before merge.

### Stage 16 QA extension
- Added real CalendarPage to the synthetic-only Vite fixture using
  `qa/mockCalendar.ts`; saves to local JS arrays only.
- At 390px Playwright checks Astryx task and harvest Dialog open/save,
  required fields, native date input preservation, Escape dismissal,
  viewport overflow and zero external requests.

### Stage 16: shared action footer controls
- Task/harvest submission, task creation from a plan and calendar day add use
  Astryx Button with original submit/onClick semantics preserved.
- Document draft, issuance, and customer-master save use Astryx Button;
  printing/PDF actions and underlying document side effects remain unchanged.
- CRM inquiry, company and contact submit controls use Astryx Button.
- All permission checks and disable-while-busy flags remain in place.

## Stage 17: documents and CRM master input migration
- Document number and customer name use Astryx Field wrappers, with existing
  state updates and explicit save validation unchanged.
- The customer-master Astryx Dialog now contains a native form with submit
  semantics, a required customer-name field, TextInput email and phone inputs.
  This prevents empty customer-name submissions before reaching the save
  handler, while preserving the business-level validation.
- CRM contact name and contact email now use Astryx TextInput; the email input
  keeps its native email input type and validation.
- Restricted to presentation/form semantics; no Supabase, pricing or mail
  integration changes.

### Stage 17 QA: isolated document customer and estimate draft
- Added `DocumentsPage` to QA-only fixture, using in-memory
  `qa/mockDocuments.ts` and a no-op PDF/OneDrive adapter.
- The browser test verifies the empty customer-name native `required`
  constraint, customer add / save, and estimate draft save without network.
- Synthetic business data is used; no real customer, invoice, or OneDrive
  content is touched.

### Stage 18 QA: isolated CRM sales inquiry and contact operations
- Added the real `CrmPage` to the synthetic-only QA entry.
- `qa/mockCrm.ts`, `qa/mockCrmSupabase.ts` and no-op child panels
  prevent any Gmail / AI / Supabase access.
- Playwright covers new inquiry, company, contact and email inputs at 390px,
  preserving the originals' save actions while writing only to memory.
- The browser fails closed for any unexpected external requests.

## Stage 19: equipment dialogs, daily reports and expenses search
- Equipment register/edit and service history forms now use real Astryx
  Dialog/DialogHeader. Asset name and service description are Astryx Field
  wrappers with unchanged native required constraints.
- Original form submit handlers, asset/service record validation, dates,
  units, vehicle-specific fields and existing permissions remain unchanged.
- Daily reports and expense claims list searches now use genuine Astryx
  TextInput controls while retaining the existing filter states.
- Next: add isolated equipment browser fixture and verify mobile Escape,
  required inputs, save/read-back and no external network.

### Stage 19 isolated browser QA
- `EquipmentPage` is mounted in QA with an in-memory `mockEquipment.ts`.
- At a 390px viewport, tests cover inventory search, required equipment
  name, asset creation, service-record creation, dialog Escape dismissal,
  horizontal overflow, and zero external requests.
- In-memory sample records are clearly fictitious, never copied from
  production. The real equipment service / Supabase connection is not used.

## Stage 20: payment-record dialog and daily / expense form controls
- Vendor invoice payment editor changed from custom `role=dialog` overlay to
  real Astryx `Dialog` + `DialogHeader`, retaining busy-state dismissal
  guard, native date and minimum-amount checks, and original RPC/save handler.
- Payment amount and invoice source use Astryx `Field` with native required
  validation; save actions use Astryx `Button` with submit semantics.
- Daily report weather uses Astryx `TextInput`; work summary uses Astryx
  `Field` retaining `textarea required`.
- Expense vendor is Astryx `Field`, and add-item / submit actions use Astryx
  `Button`. OCR, OneDrive, accounting and permission logic are not modified.
- All changes remain in the feature branch. Staging Supabase not provisioned.
