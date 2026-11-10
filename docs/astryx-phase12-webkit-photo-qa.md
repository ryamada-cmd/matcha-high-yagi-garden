# AstryX QA phase 12 — WebKit / iPhone-like photo interactions

## Added test
`qa/astryx-webkit-photo.e2e.mjs` launches Playwright **WebKit** (Linux)
with a built-in `iPhone 13` device emulation profile. This uses
the actual `StoragePage?view=photos` and `PhotoGallerySection` React
components but the *synthetic-only* `qa/mockPhotoGallery` module.

Four isolated scenarios:
1. Reject a nonimage file and a file over 25 MiB in the photo picker.
2. Select a PNG and a synthetic `.HEIC` filename with an unknown MIME type;
   verify exactly two entries despite multiple input/change events, then upload
   two metadata records to an in-memory fake store (not OneDrive).
3. Check 320px filtering, lightbox, remove-photo behavior, disabled upload with
   no selection and horizontal overflow.
4. Check read-only role cannot display the upload chooser.

The workflow installs Chromium **and** WebKit, preserving the existing
37 synthetic Chromium scenarios, and adds these 4 WebKit scenarios.
Every off-origin request fails the test, and no production secret is used.

## Important limitations
- Playwright WebKit on Linux is **not** physical iOS Safari. iOS Photos
  permissions, real camera capture, backgrounding, Safari File API bugs,
  HEIC decoding and actual OneDrive upload are *not* verified.
- The `.HEIC` test supplies fake bytes. It verifies extension acceptance
  and metadata flow only; it does not assert real image decoding or thumbnailing.
- Testing the actual camera and photo library still requires an operator with
  an iPhone and a separate fake-data OneDrive/Supabase staging environment.
- This PR contains **no production React/UI, service, schema or auth changes**.
- Use an isolated staging Supabase project or local Docker stack for later
  real Auth/RLS/RPC write-path integration tests. Do not reuse another
  business's staging database, production emails or live document store.
