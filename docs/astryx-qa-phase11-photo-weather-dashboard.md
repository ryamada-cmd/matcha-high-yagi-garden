# AstryX QA phase 11 — actual photo gallery, weather location and home dashboard

## Real components exercised
- `PhotoGallerySection` inside `StoragePage?view=photos`:
  thumbnails and pagination (39 synthetic images), category/album search, lightbox, unsupported-file rejection,
  duplicate input/change deduplication, metadata and linked field on fake single-photo upload, no-upload role.
- `WeatherLocationSettings` inside `SettingsPage`:
  minimum query length, fake location search, candidate selection, coordinates persisted only in an in-memory settings object,
  and a read-only role with buttons disabled. `WeatherPanel` uses an offline forecast mock.
- `HomeDashboardPage`:
  cost/revenue/profit KPIs with fake figures, overdue/today/week work lists,
  in-memory task completion, the real `WeatherPanel`,
  role-gated financial cards and write shortcuts at 320px and 390px.

## Safety boundaries
- Production React UI and CSS are rendered through a separate `qa/index.html` entry.
- `qa/vite.config.ts` aliases only the test bundle's imports to `mockPhotoGallery`,
  `mockWeather`, `mockHomeDashboard`, `mockAdminConsole` and mock permissions.
- All off-origin network requests are aborted and recorded as a test failure. No real cloud data,
  credentials, photo files, task state, settings or customer data are accessed or modified.
- Only QA fixture files, workflow trigger paths and this note are changed by this phase.

## Limitations
- Chromium automation does **not** establish iPhone Safari's OS-level photo picker,
  HEIC decoding, camera capture, application background/foreground recovery or actual Microsoft OneDrive OAuth success.
- Dashboard tests validate UI-derived KPIs using fake sources, **not** live Supabase data correctness.
- Permission tests simulate UI feature access. They do **not** replace authenticated RLS/RPC or role-change integration tests.
- GitHub CI passing is not the same as confirming the latest Vercel rewrite or Pages mirror delivered the commit.
