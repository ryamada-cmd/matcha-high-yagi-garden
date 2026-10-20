# Harvest 17-lot evidence reconciliation — design and release gate

Date: 2026-10-20. Branch: \`feature/harvest-evidence-review-v1\`.

## Source evidence inspected, read-only

- Yagi Garden Manager Production has 17 active harvest records lacking harvest
  dates and linked fields.
- The existing library contains 42 document entries and 71 external file links,
  but **no links explicitly targeting harvests/lots** in the
  \`external_file_links.entity_type\` column.
- This absence is **NOT evidence that the documents do not exist**. The files
  may be stored in the library without a harvest association. We did not
  read document contents, inspect customer/employee names, guess matching lot
  IDs, auto-OCR, or generate a fictional harvest-date attribution.
- Source records and the Yagi Production application are unchanged.

## Implemented in a non-production GitHub branch

- \`src/lib/harvestEvidenceReview.ts\` derives an evidence-reconciliation
  worklist from **already loaded** authorized harvest records. It checks
  whether date, field association, measured field area and field-level
  quantity are recorded. It does not assert that entered fields were checked
  against external documents.
- \`src/pages/HarvestProcessingPage.tsx\` has a collapsible "未確定ロットの
  根拠資料照合" panel inside harvest history. A small search and the "要確認
  のみ" filter help users identify individual unresolved lots. The
  \`/library\` link respects the existing \`storage.view\` permission.
- \`資料照合用CSVを出力\` downloads a CSV **locally in the user's browser**,
  containing the already-visible lot number, source-lot number, recorded leaf
  weight, date and recorded field codes (where present), missing-data flags
  and **empty columns** for the supporting document, evidence of date and
  field, area, quantity, reviewer, review date and review conclusion.
  The CSV includes UTF-8 BOM for Japanese spreadsheets, quotes/escapes all
  cells and guards against Excel formula injection in source lot identifiers.
- The CSV does **not** write to \`harvest_records\`, link a document in the DB,
  send results to AI, send email, or persist draft conclusions. Filling the
  CSV is a human review exercise, not a business-record update.
- Responsive cards support mobile 320/390px viewports.

## Controls and considerations

- Actual recorded kg may be valid as **undated inventory weight**, not a
  period-attributable harvested weight. CSV makes that distinction explicit.
- Blank source date/field/area are exported as blanks, never replaced with
  "today", a master field's full registered area, or estimated field ID.
- Nothing in the current app marks supporting documents as verified. The UI
  explicitly tells the reviewer to corroborate evidence separately and
  edit source records only through approved existing operator controls.
- No new database schema, APIs, third-party services, paid model calls,
  automatic changes or document matching were introduced.
- In a later phase, documentary evidence can be explicitly linked to source
  lot IDs and reviewed using an authorized DB schema/action, **only after a
  separate design and permissions review**. Current
  \`external_file_links\` has no existing harvest entity targets.

## Testing

- \`scripts/harvest-evidence-review.test.mjs\` covers missing 17-lot inputs,
  completed data vs actual documentary review, CSV columns/escaping, injection
  and absence of persistence.
- CI runs \`npm run test:harvest\`, TypeScript type checking and Vite build.
- Synthetic-only browser QA uses the actual harvest React page, with mock
  Supabase data and all non-local network requests blocked. It tests
  the panel, 17 worklist rows, filtering and a local-only CSV download, plus
  the original 390px/320px and desktop input/history checks.

## Status and release gate

The branch / draft PR is **review-only**; Production deploy/merge and source
record mutations are not approved by this implementation. The user should
review the staged UI, and separately approve any public production release.
