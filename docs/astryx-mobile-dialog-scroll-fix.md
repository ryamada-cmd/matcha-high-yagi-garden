# iPhone / small-screen modal vertical-scrolling repair

## Reported symptom
In mobile Safari the **「取引先を追加」** customer master Dialog could not scroll below the address/dept section, hiding the later phone, email, note and Save controls. The background page was dimmed and non-scrollable, so the user could not finish the form.

## Repair
`src/astryx-ui.css` now makes AstryX's **inner flex content wrapper** an independently touch-scrollable container at viewport widths <= 800px:
- Explicit max height constrained to the current dynamic viewport on the native dialog shell.
- `overflow-y:auto !important` and `overflow-x:hidden` on AstryX's direct inner flex wrapper (the library's native wrapper defaults to `overflow:hidden` and was clipping the form).
- `-webkit-overflow-scrolling:touch`, `touch-action:pan-y` and contained overscroll.
- Inner form-body overflow remains visible so the AstryX **direct inner wrapper** owns scrolling; the outer native dialog shell remains overflow-hidden to avoid double scroll.
- The customer Save control has a usable touch target and safe-area bottom spacing.

This shared fix covers:
`astryx-document-customer-dialog`, `astryx-calendar-dialog`,
`astryx-inventory-dialog`, `astryx-master-dialog`,
`astryx-equipment-dialog`, `astryx-vendor-payment-dialog`.

## Regression
`qa/astryx-dialog-scroll.e2e.mjs` renders **real page components and CSS** but synthetic-only service mocks:
- Customer modal at 390x720 and 320x568 in Chromium and WebKit.
- Assert the **inner AstryX flex wrapper** has scrollable overflow, remains within viewport and actually changes scrollTop. Chromium uses a real wheel gesture; mobile WebKit uses a programmatic scroll because Playwright does not support mouse.wheel in that device mode.
- Reach the bottom Save action, fill the last notes field and save only to in-memory QA.
- Product modal at 390x568 for each engine; scroll to the Save button and save to in-memory QA.
- No requests to Supabase, external storage or other off-origin services.

The QA suite cannot replace a physical iPhone Safari test involving the software keyboard, browser address bar and actual OS safe-area; check the public site after deployment. The screenshot is a bug report, not evidence the current public release was already updated.
