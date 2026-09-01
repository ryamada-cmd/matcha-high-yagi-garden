-- Internal production helper used by SECURITY DEFINER/core database functions.
-- It is not a frontend API and should not be directly callable by signed-in users.
revoke execute on function public.production_lot_downstream_used_qty(uuid) from public, anon, authenticated;

-- Legacy fertilizer admin guard is not used by the current permission-aware RPCs.
-- Keep the function for compatibility, but do not expose it through the Data API.
revoke execute on function public.require_fertilizer_admin_() from public, anon, authenticated;
