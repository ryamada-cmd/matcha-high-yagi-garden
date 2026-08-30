-- Keep manufacturing and SKU packaging permissions independent while sharing the same atomic inventory logic.
-- The internal core functions are not executable by API roles; only permission-checked wrappers may call them.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.save_manufacturing_batch(jsonb)'::regprocedure) into v_def;
  v_def := replace(v_def, 'FUNCTION public.save_manufacturing_batch(p_payload jsonb)', 'FUNCTION public.save_manufacturing_batch_core_(p_payload jsonb)');
  v_def := replace(v_def, 'perform public.require_app_permission_(''production.process_manage'');', '');
  execute v_def;
end $$;

revoke all on function public.save_manufacturing_batch_core_(jsonb) from public, anon, authenticated;

create or replace function public.save_manufacturing_batch(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.require_app_permission_('production.process_manage');
  return public.save_manufacturing_batch_core_(p_payload);
end;
$$;
revoke all on function public.save_manufacturing_batch(jsonb) from public, anon;
grant execute on function public.save_manufacturing_batch(jsonb) to authenticated;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.delete_manufacturing_batch(uuid,text)'::regprocedure) into v_def;
  v_def := replace(v_def, 'FUNCTION public.delete_manufacturing_batch(p_id uuid, p_reason text DEFAULT NULL::text)', 'FUNCTION public.delete_manufacturing_batch_core_(p_id uuid, p_reason text DEFAULT NULL::text)');
  v_def := replace(v_def, 'perform public.require_app_permission_(''production.process_delete'');', '');
  execute v_def;
end $$;

revoke all on function public.delete_manufacturing_batch_core_(uuid,text) from public, anon, authenticated;

create or replace function public.delete_manufacturing_batch(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.require_app_permission_('production.process_delete');
  perform public.delete_manufacturing_batch_core_(p_id, p_reason);
end;
$$;
revoke all on function public.delete_manufacturing_batch(uuid,text) from public, anon;
grant execute on function public.delete_manufacturing_batch(uuid,text) to authenticated;

-- Rewire the existing SKU packaging RPC to the private manufacturing core.
-- It keeps its packaging.manage permission check and all product-master validation.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.admin_save_product_packaging(uuid,jsonb)'::regprocedure) into v_def;
  v_def := replace(v_def, 'public.save_manufacturing_batch(', 'public.save_manufacturing_batch_core_(');
  execute v_def;
end $$;

create or replace function public.delete_product_packaging(p_batch_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.require_app_permission_('packaging.manage');
  if not exists (
    select 1
    from public.product_packaging_batches pp
    join public.manufacturing_batches mb on mb.id = pp.manufacturing_batch_id
    where pp.manufacturing_batch_id = p_batch_id
      and mb.deleted_at is null
  ) then
    raise exception '商品化実績が見つかりません';
  end if;
  perform public.delete_manufacturing_batch_core_(p_batch_id, p_reason);
end;
$$;
revoke all on function public.delete_product_packaging(uuid,text) from public, anon;
grant execute on function public.delete_product_packaging(uuid,text) to authenticated;
