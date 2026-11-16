# Tea Farm UI Agent Instructions

Use `.agents/skills/unslop/SKILL.md` for requested visual polish and read `docs/UNSLOP_ROLLOUT.md` first. Unslop by Damir Sokolovsky (https://github.com/heydamir/unslop), CC BY 4.0.

- Preserve AstryX 0.7.12 Matcha theme and current business flows; audit actual screenshots before modifying visuals.
- Follow Unslop's nine passes and keep the Japanese tea-farm identity.
- Fix existing CSS conflicts at source, not by stacking broad !important overrides.
- Keep mobile forms >=16px font size, touch targets >=44px, modal scrolling, and keyboard/focus accessibility.
- Visual changes must not alter Supabase schema, Auth, RLS, RPC, business calculations, OneDrive, Gmail sync, permissions or operational data.
- Do not break the invoice/PDF layout, printing, or OneDrive stored document previews.
- Use feature branches and pull requests. Pushing to main triggers the production Pages/Vercel mirror deployment.
- Test with in-memory QA fixtures, typecheck/build, Chromium and WebKit screenshots. Never issue real business writes in synthetic UI tests.
