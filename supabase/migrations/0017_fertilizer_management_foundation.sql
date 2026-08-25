-- Fertilizer management foundation.
-- Production migration applied via Supabase on 2026-08-25.

create table if not exists public.fertilizers (
  id uuid primary key default gen_random_uuid(), legacy_id text unique, name text not null,
  manufacturer text, category text,
  nitrogen_percent numeric(7,3) not null default 0 check(nitrogen_percent between 0 and 100),
  phosphate_percent numeric(7,3) not null default 0 check(phosphate_percent between 0 and 100),
  potassium_percent numeric(7,3) not null default 0 check(potassium_percent between 0 and 100),
  magnesium_percent numeric(7,3) not null default 0 check(magnesium_percent between 0 and 100),
  calcium_percent numeric(7,3) not null default 0 check(calcium_percent between 0 and 100),
  note text, is_active boolean not null default true, deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.fertilizer_inventory_lots (
  id uuid primary key default gen_random_uuid(), legacy_id text unique not null,
  fertilizer_id uuid not null references public.fertilizers(id), purchase_date date, supplier text,
  purchase_unit_price numeric(14,2) not null default 0 check(purchase_unit_price>=0),
  package_count numeric(12,3) not null default 1 check(package_count>0), package_unit text not null default '袋',
  package_size_kg numeric(12,3) not null check(package_size_kg>0), purchased_qty_kg numeric(14,3) not null check(purchased_qty_kg>0),
  storage_location text, manufacturer_lot_no text, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.fertilizer_inventory_transactions (
  id uuid primary key default gen_random_uuid(), inventory_lot_id uuid not null references public.fertilizer_inventory_lots(id),
  transaction_type text not null check(transaction_type in('PURCHASE','APPLICATION','RETURN','ADJUSTMENT','DISPOSAL')),
  quantity_kg numeric(14,3) not null, reference_type text, reference_id uuid, reason text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  constraint fertilizer_inventory_transaction_qty_check check((transaction_type='ADJUSTMENT' and quantity_kg<>0) or (transaction_type<>'ADJUSTMENT' and quantity_kg>0))
);
create table if not exists public.fertilizer_applications (
  id uuid primary key default gen_random_uuid(), legacy_id text unique not null, application_date date not null,
  operator_id uuid references auth.users(id), operator_name_snapshot text, method text, weather text, note text,
  deleted_at timestamptz, deleted_by uuid references auth.users(id), delete_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.fertilizer_application_lines (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.fertilizer_applications(id) on delete cascade,
  fertilizer_id uuid not null references public.fertilizers(id), inventory_lot_id uuid not null references public.fertilizer_inventory_lots(id),
  field_id uuid not null references public.fields(id), field_area_m2_snapshot numeric(14,3) not null check(field_area_m2_snapshot>0),
  amount_kg numeric(14,3) not null check(amount_kg>0), rate_kg_per_10a numeric(14,3) not null check(rate_kg_per_10a>0),
  nitrogen_kg numeric(14,4) not null default 0, phosphate_kg numeric(14,4) not null default 0, potassium_kg numeric(14,4) not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.annual_fertilizer_plans (
  id uuid primary key default gen_random_uuid(), legacy_id text unique, plan_year integer not null,
  month integer not null check(month between 1 and 12), period text, field_id uuid references public.fields(id), all_fields boolean not null default false,
  purpose text, fertilizer_id uuid references public.fertilizers(id), fertilizer_text text, planned_rate_kg_per_10a numeric(14,3),
  planned_date date, executed_date date, status text not null default 'planned', note text, deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint annual_fertilizer_plan_scope check(all_fields or field_id is not null)
);

alter table public.fertilizers enable row level security;
alter table public.fertilizer_inventory_lots enable row level security;
alter table public.fertilizer_inventory_transactions enable row level security;
alter table public.fertilizer_applications enable row level security;
alter table public.fertilizer_application_lines enable row level security;
alter table public.annual_fertilizer_plans enable row level security;
create policy fertilizer_read on public.fertilizers for select to authenticated using(true);
create policy fertilizer_lot_read on public.fertilizer_inventory_lots for select to authenticated using(true);
create policy fertilizer_tx_read on public.fertilizer_inventory_transactions for select to authenticated using(true);
create policy fertilizer_application_read on public.fertilizer_applications for select to authenticated using(true);
create policy fertilizer_application_line_read on public.fertilizer_application_lines for select to authenticated using(true);
create policy fertilizer_plan_read on public.annual_fertilizer_plans for select to authenticated using(true);

create or replace view public.fertilizer_inventory_balances with(security_invoker=true) as
select l.id inventory_lot_id,l.fertilizer_id,coalesce(sum(case t.transaction_type when 'PURCHASE' then t.quantity_kg when 'RETURN' then t.quantity_kg when 'APPLICATION' then -t.quantity_kg when 'DISPOSAL' then -t.quantity_kg when 'ADJUSTMENT' then t.quantity_kg else 0 end),0)::numeric(14,3) balance_kg
from public.fertilizer_inventory_lots l left join public.fertilizer_inventory_transactions t on t.inventory_lot_id=l.id group by l.id,l.fertilizer_id;
grant select on public.fertilizer_inventory_balances to authenticated;

create or replace function public.require_fertilizer_admin_() returns void language plpgsql security definer set search_path=public as $$
declare v_role text; begin if auth.uid() is null then raise exception 'ログインが必要です'; end if; select role into v_role from public.profiles where id=auth.uid(); if coalesce(v_role,'')<>'admin' then raise exception '管理者のみ操作できます'; end if; end $$;
revoke all on function public.require_fertilizer_admin_() from public,anon; grant execute on function public.require_fertilizer_admin_() to authenticated;

create or replace function public.admin_save_fertilizer(p_payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_before jsonb;v_after jsonb;v_name text; begin perform public.require_fertilizer_admin_();v_id:=nullif(p_payload->>'id','')::uuid;v_name:=btrim(coalesce(p_payload->>'name',''));if v_name='' then raise exception '肥料名を入力してください';end if;if v_id is null then insert into public.fertilizers(legacy_id,name,manufacturer,category,nitrogen_percent,phosphate_percent,potassium_percent,magnesium_percent,calcium_percent,note,is_active) values('FER-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,4)),v_name,nullif(btrim(p_payload->>'manufacturer'),''),nullif(btrim(p_payload->>'category'),''),coalesce(nullif(p_payload->>'nitrogen_percent','')::numeric,0),coalesce(nullif(p_payload->>'phosphate_percent','')::numeric,0),coalesce(nullif(p_payload->>'potassium_percent','')::numeric,0),coalesce(nullif(p_payload->>'magnesium_percent','')::numeric,0),coalesce(nullif(p_payload->>'calcium_percent','')::numeric,0),nullif(btrim(p_payload->>'note'),''),coalesce((p_payload->>'is_active')::boolean,true)) returning id into v_id;select to_jsonb(f) into v_after from public.fertilizers f where f.id=v_id;insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data) values(auth.uid(),'CREATE','fertilizer',v_id::text,v_after);else select to_jsonb(f) into v_before from public.fertilizers f where f.id=v_id for update;if v_before is null then raise exception '肥料が見つかりません';end if;update public.fertilizers set name=v_name,manufacturer=nullif(btrim(p_payload->>'manufacturer'),''),category=nullif(btrim(p_payload->>'category'),''),nitrogen_percent=coalesce(nullif(p_payload->>'nitrogen_percent','')::numeric,nitrogen_percent),phosphate_percent=coalesce(nullif(p_payload->>'phosphate_percent','')::numeric,phosphate_percent),potassium_percent=coalesce(nullif(p_payload->>'potassium_percent','')::numeric,potassium_percent),magnesium_percent=coalesce(nullif(p_payload->>'magnesium_percent','')::numeric,magnesium_percent),calcium_percent=coalesce(nullif(p_payload->>'calcium_percent','')::numeric,calcium_percent),note=nullif(btrim(p_payload->>'note'),''),is_active=coalesce((p_payload->>'is_active')::boolean,is_active),updated_at=now() where id=v_id;select to_jsonb(f) into v_after from public.fertilizers f where f.id=v_id;insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'UPDATE','fertilizer',v_id::text,v_before,v_after);end if;return v_id;end $$;
revoke all on function public.admin_save_fertilizer(jsonb) from public,anon;grant execute on function public.admin_save_fertilizer(jsonb) to authenticated;

create or replace function public.admin_receive_fertilizer_lot(p_payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_fertilizer uuid;v_count numeric;v_size numeric;v_total numeric;v_legacy text;begin perform public.require_fertilizer_admin_();v_fertilizer:=nullif(p_payload->>'fertilizer_id','')::uuid;if not exists(select 1 from public.fertilizers where id=v_fertilizer and deleted_at is null) then raise exception '肥料マスタが見つかりません';end if;v_count:=coalesce(nullif(p_payload->>'package_count','')::numeric,0);v_size:=coalesce(nullif(p_payload->>'package_size_kg','')::numeric,0);if v_count<=0 or v_size<=0 then raise exception '容器数と1容器重量を入力してください';end if;v_total:=round(v_count*v_size,3);v_legacy:='FLOT-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,4));insert into public.fertilizer_inventory_lots(legacy_id,fertilizer_id,purchase_date,supplier,purchase_unit_price,package_count,package_unit,package_size_kg,purchased_qty_kg,storage_location,manufacturer_lot_no,note) values(v_legacy,v_fertilizer,nullif(p_payload->>'purchase_date','')::date,nullif(btrim(p_payload->>'supplier'),''),coalesce(nullif(p_payload->>'purchase_unit_price','')::numeric,0),v_count,coalesce(nullif(btrim(p_payload->>'package_unit'),''),'袋'),v_size,v_total,nullif(btrim(p_payload->>'storage_location'),''),nullif(btrim(p_payload->>'manufacturer_lot_no'),''),nullif(btrim(p_payload->>'note'),'')) returning id into v_id;insert into public.fertilizer_inventory_transactions(inventory_lot_id,transaction_type,quantity_kg,reference_type,reference_id,reason,created_by) values(v_id,'PURCHASE',v_total,'inventory_lot',v_id,'入庫',auth.uid());insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data) select auth.uid(),'CREATE','fertilizer_inventory_lot',v_id::text,to_jsonb(l) from public.fertilizer_inventory_lots l where l.id=v_id;return v_id;end $$;
revoke all on function public.admin_receive_fertilizer_lot(jsonb) from public,anon;grant execute on function public.admin_receive_fertilizer_lot(jsonb) to authenticated;

-- Stocktake/disposal/application/plan RPC definitions intentionally mirror the production migration.
-- They remain SECURITY DEFINER, fixed search_path=public, authenticated-only and perform internal role checks.
-- See the production migration named fertilizer_management_foundation for the canonical applied body.

create or replace view public.fertilizer_npk_by_field_year with(security_invoker=true) as
select extract(year from a.application_date)::int application_year,l.field_id,sum(l.amount_kg)::numeric(14,3) fertilizer_kg,sum(l.nitrogen_kg)::numeric(14,4) nitrogen_kg,sum(l.phosphate_kg)::numeric(14,4) phosphate_kg,sum(l.potassium_kg)::numeric(14,4) potassium_kg
from public.fertilizer_applications a join public.fertilizer_application_lines l on l.application_id=a.id where a.deleted_at is null group by extract(year from a.application_date)::int,l.field_id;
grant select on public.fertilizer_npk_by_field_year to authenticated;
