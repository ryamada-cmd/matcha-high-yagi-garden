# Astryx production rollout — Phase 2 (masters & inventory)

Selective UI-only changes from the independent Astryx feature branch.

## Included
- Pesticide stock/inventory: Astryx Table, Dialog, TextInput, Card and Button.
- Product master: Astryx Cards and required Fields, TextInput and Dialog.
- Product price list: Astryx Table, TextInput, Dialog and Button.
- Fertilizer master: Astryx Cards, required Fields, TextInput and Dialog.
- Underlying service modules, Supabase authentication, permissions, SQL, record
  persistence, and external APIs: **unchanged**.
- Preview-only global fetch guard/preview read-only flag: **not included**.

## Verification and rollback
- Verify normal CI + synthetic UI browser QA before merge to main.
- Verify GitHub Pages deployment and Vercel mirror after merge.
- Production editing operations should be manually verified by an authorized
  operator; synthetic browser tests do not test the production database.
- Revert the phase-2 merge commit if unexpected post-release errors occur.
