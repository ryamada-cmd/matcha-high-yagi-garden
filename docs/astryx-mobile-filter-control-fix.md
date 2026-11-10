# AstryX search/input double-border and mobile filter-width repair

## iPhone screenshot (2026-11-10)
The `申請一覧・承認` section of the expense claims page showed overlapping double search borders. The search field text and icon were misaligned, while month, status and applicant filters differed in width.

## Root cause
`@astryxdesign/core/TextInput` draws the single control border on the outer `.astryx-text-input` wrapper. Its nested `<input>` is intentionally transparent and borderless. Our older universal selectors in `ui-refresh.css`, `unified-ui.css` and `ui-cohesion.css` had forced another border, white background, focus shadow, padding and `width:100%` on *every* native input, including inputs inside AstryX. Icon-bearing controls therefore displayed two borders and exceeded their wrapper's inline space.

## Fix
- `src/astryx-ui.css` is loaded after legacy CSS and resets only the nested `.astryx-text-input > input` border/shadow/background/padding, allowing the **AstryX wrapper** to retain the brand border, focus treatment, icon and clear button.
- Set `flex:1 1 auto`, `width:auto` and `min-width:0` on that inner element. A zero-width value is not appropriate: the 1280px pricing-page regression proved it made a text input invisible even though its parent border remained visible.
- Search fields use a consistent 46px minimum touch height.
- The expense filter grid is a true single-column `minmax(0,1fr)` on phones with 100%-width month, status and applicant controls; selectors remain narrow enough to avoid unintended horizontal scrolling.
- In mixed search/select **flex toolbars** (e.g. desktop price list), the legacy native `select {width:100%!important}` rule could occupy the entire row and collapse the search Field to 0px. Search now gets `flex-basis:240px`, while peer selects are content-sized on desktop; mobile switches to full-width wrapping.

## Regression and safety
`qa/astryx-filter-controls.e2e.mjs` uses actual React screens and CSS with synthetic-only modules:
- Expense claims: four controls align in width and x-position, with no overlap at **320px and 390px**, in both Chromium and Linux WebKit.
- Existing screen searches: inventory, product master, vendor invoices and sales documents at 390px, plus desktop **price list at 1280px**, maintain the one-border contract, keep visible/nonzero search widths and work correctly.
- Off-origin requests are forbidden by the test; no production Supabase writes or real OneDrive interactions occur.

CI validates TypeScript, build and existing workflows as usual. A passing WebKit run approximates iPhone rendering but does not establish an iPhone Safari OS-device test. The public Vercel/Pages cache still requires delivery verification after merge.

## Follow-up iPhone correction (2026-11-10, second report)

The previous tests inspected the border on the native `<input>` and the
AstryX `.astryx-text-input` wrapper, but **did not measure the outer
`.astryx-search-field` Field**. The user still observed a green outer
rectangle and an inset grey rectangle around the search text.

The fix now explicitly selects the **outer Field** as the only visual
border/focus ring. The inner AstryX TextInput control is borderless,
transparent and shadowless, and the native input remains borderless. This
retains the search icon, clear affordance and accessible Field label.

The smoke test now inspects **all three layers** (Field / TextInput control /
native input), at 320px and 390px in the expense-claim toolbar, plus search
inputs in inventory, product master, vendor invoices, documents and desktop
prices. It requires one border total rather than only testing the native
input's border. Test data is synthetic and off-origin requests are denied.

Delivery must still be verified separately: GitHub `main` merge and passing
mocked-browser tests do not prove that the Vercel proxy or Safari cache has
served the updated CSS. Confirm release SHA and test on physical iPhone.
