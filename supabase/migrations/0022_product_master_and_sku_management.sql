-- Product master / SKU catalog with admin CRUD and soft delete.
-- Applied to production on 2026-08-25.

create table if not exists public.product_master (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  product_name text not null,
  category text not null default 'その他',
  brand_name text not null default '五代目八木一兵衛',
  jan_code text,
  net_content numeric(12,3) not null default 0 check(net_content >= 0),
  content_unit text not null default 'g',
  package_type text,
  standard_price_yen numeric(12,2) not null default 0 check(standard_price_yen >= 0),
  packaging_cost_yen numeric(12,2) not null default 0 check(packaging_cost_yen >= 0),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
  note text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create unique index if not exists uq_product_master_sku_active
  on public.product_master (upper(btrim(sku))) where deleted_at is null;
create unique index if not exists uq_product_master_jan_active
  on public.product_master (btrim(jan_code)) where deleted_at is null and nullif(btrim(jan_code),'') is not null;
create index if not exists idx_product_master_category on public.product_master(category) where deleted_at is null;
create index if not exists idx_product_master_status on public.product_master(status) where deleted_at is null;

alter table public.product_master enable row level security;
drop policy if exists product_master_read on public.product_master;
create policy product_master_read on public.product_master for select to authenticated using(deleted_at is null);
grant select on public.product_master to authenticated;

create or replace function public.admin_upsert_product(p_product_id uuid, p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_sku text;
  v_name text;
  v_jan text;
  v_before jsonb;
begin
  perform public.require_admin_();
  v_sku := upper(btrim(coalesce(p_payload->>'sku','')));
  v_name := btrim(coalesce(p_payload->>'product_name',''));
  v_jan := nullif(btrim(coalesce(p_payload->>'jan_code','')), '');
  if v_sku = '' then raise exception 'SKUを入力してください'; end if;
  if v_name = '' then raise exception '商品名を入力してください'; end if;

  if p_product_id is null then
    insert into public.product_master(
      sku,product_name,category,brand_name,jan_code,net_content,content_unit,package_type,
      standard_price_yen,packaging_cost_yen,status,note,created_by,updated_by
    ) values(
      v_sku,v_name,
      coalesce(nullif(btrim(p_payload->>'category'),''),'その他'),
      coalesce(nullif(btrim(p_payload->>'brand_name'),''),'五代目八木一兵衛'),
      v_jan,
      greatest(coalesce(nullif(p_payload->>'net_content','')::numeric,0),0),
      coalesce(nullif(btrim(p_payload->>'content_unit'),''),'g'),
      nullif(btrim(p_payload->>'package_type'),''),
      greatest(coalesce(nullif(p_payload->>'standard_price_yen','')::numeric,0),0),
      greatest(coalesce(nullif(p_payload->>'packaging_cost_yen','')::numeric,0),0),
      case when upper(coalesce(p_payload->>'status','ACTIVE'))='INACTIVE' then 'INACTIVE' else 'ACTIVE' end,
      nullif(btrim(p_payload->>'note'),''),auth.uid(),auth.uid()
    ) returning id into v_id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)
    values(auth.uid(),'CREATE','product_master',v_id::text,(select to_jsonb(x) from public.product_master x where x.id=v_id));
  else
    select to_jsonb(x) into v_before from public.product_master x where x.id=p_product_id and x.deleted_at is null for update;
    if v_before is null then raise exception '商品が見つかりません'; end if;
    update public.product_master set
      sku=v_sku,
      product_name=v_name,
      category=coalesce(nullif(btrim(p_payload->>'category'),''),'その他'),
      brand_name=coalesce(nullif(btrim(p_payload->>'brand_name'),''),'五代目八木一兵衛'),
      jan_code=v_jan,
      net_content=greatest(coalesce(nullif(p_payload->>'net_content','')::numeric,0),0),
      content_unit=coalesce(nullif(btrim(p_payload->>'content_unit'),''),'g'),
      package_type=nullif(btrim(p_payload->>'package_type'),''),
      standard_price_yen=greatest(coalesce(nullif(p_payload->>'standard_price_yen','')::numeric,0),0),
      packaging_cost_yen=greatest(coalesce(nullif(p_payload->>'packaging_cost_yen','')::numeric,0),0),
      status=case when upper(coalesce(p_payload->>'status','ACTIVE'))='INACTIVE' then 'INACTIVE' else 'ACTIVE' end,
      note=nullif(btrim(p_payload->>'note'),''),
      updated_by=auth.uid(),updated_at=now()
    where id=p_product_id;
    v_id:=p_product_id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'UPDATE','product_master',v_id::text,v_before,(select to_jsonb(x) from public.product_master x where x.id=v_id));
  end if;
  return v_id;
exception when unique_violation then
  if position('uq_product_master_jan_active' in sqlerrm)>0 then raise exception '同じJANコードの商品がすでにあります'; end if;
  raise exception '同じSKUの商品がすでにあります';
end $$;
revoke all on function public.admin_upsert_product(uuid,jsonb) from public,anon;
grant execute on function public.admin_upsert_product(uuid,jsonb) to authenticated;

create or replace function public.admin_delete_product(p_product_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_before jsonb;
begin
  perform public.require_admin_();
  select to_jsonb(x) into v_before from public.product_master x where x.id=p_product_id and x.deleted_at is null for update;
  if v_before is null then raise exception '商品が見つかりません'; end if;
  update public.product_master set deleted_at=now(),deleted_by=auth.uid(),updated_by=auth.uid(),updated_at=now() where id=p_product_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'DELETE','product_master',p_product_id::text,v_before,(select to_jsonb(x) from public.product_master x where x.id=p_product_id));
end $$;
revoke all on function public.admin_delete_product(uuid) from public,anon;
grant execute on function public.admin_delete_product(uuid) to authenticated;
