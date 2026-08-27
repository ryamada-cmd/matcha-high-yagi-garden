-- Equipment, farm tools, machinery and vehicle management.
-- Applied to production on 2026-08-27.

create table if not exists public.equipment_assets (
  id uuid primary key default gen_random_uuid(),
  asset_no text not null unique,
  category text not null check(category in ('AGRICULTURAL_MACHINE','TOOL','VEHICLE','OTHER')),
  name text not null,
  manufacturer text,
  model_no text,
  serial_no text,
  acquisition_type text not null default 'PURCHASED' check(acquisition_type in ('PURCHASED','RECEIVED','INHERITED','LEASED','OTHER')),
  acquisition_date date,
  purchase_price_yen numeric(16,2) check(purchase_price_yen is null or purchase_price_yen >= 0),
  fuel_type text not null default 'NONE' check(fuel_type in ('NONE','GASOLINE','MIXED_OIL','DIESEL','ELECTRIC','BATTERY','OTHER')),
  fuel_note text,
  storage_location text,
  status text not null default 'NORMAL' check(status in ('NORMAL','CAUTION','REPAIR_NEEDED','UNDER_REPAIR','OUT_OF_SERVICE','DISPOSED')),
  condition_note text,
  vehicle_registration_no text,
  vehicle_inspection_expiry date,
  vehicle_tax_due_date date,
  insurance_expiry date,
  next_maintenance_date date,
  current_odometer_km numeric(14,1) check(current_odometer_km is null or current_odometer_km >= 0),
  current_hour_meter numeric(14,1) check(current_hour_meter is null or current_hour_meter >= 0),
  note text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.equipment_service_records (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_assets(id),
  record_type text not null check(record_type in ('REPAIR','MAINTENANCE','INSPECTION','OIL_CHANGE','PART_REPLACEMENT','VEHICLE_INSPECTION','VEHICLE_TAX','INSURANCE','OTHER')),
  record_date date not null,
  vendor text,
  description text not null,
  cost_yen numeric(16,2) not null default 0 check(cost_yen >= 0),
  odometer_km numeric(14,1) check(odometer_km is null or odometer_km >= 0),
  hour_meter numeric(14,1) check(hour_meter is null or hour_meter >= 0),
  next_due_date date,
  status_after text check(status_after is null or status_after in ('NORMAL','CAUTION','REPAIR_NEEDED','UNDER_REPAIR','OUT_OF_SERVICE','DISPOSED')),
  condition_after text,
  note text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_equipment_assets_category on public.equipment_assets(category,status) where deleted_at is null;
create index if not exists idx_equipment_assets_due on public.equipment_assets(vehicle_inspection_expiry,vehicle_tax_due_date,insurance_expiry,next_maintenance_date) where deleted_at is null;
create index if not exists idx_equipment_records_asset on public.equipment_service_records(equipment_id,record_date desc) where deleted_at is null;
create index if not exists idx_equipment_records_due on public.equipment_service_records(next_due_date) where deleted_at is null and next_due_date is not null;

alter table public.equipment_assets enable row level security;
alter table public.equipment_service_records enable row level security;

drop policy if exists equipment_assets_read on public.equipment_assets;
create policy equipment_assets_read on public.equipment_assets for select to authenticated using(deleted_at is null);
drop policy if exists equipment_records_read on public.equipment_service_records;
create policy equipment_records_read on public.equipment_service_records for select to authenticated using(deleted_at is null and exists(select 1 from public.equipment_assets a where a.id=equipment_id and a.deleted_at is null));
grant select on public.equipment_assets,public.equipment_service_records to authenticated;

create or replace view public.equipment_asset_summary with (security_invoker=true) as
select a.*,
  coalesce((select count(*) from public.equipment_service_records r where r.equipment_id=a.id and r.deleted_at is null),0)::int as service_record_count,
  coalesce((select count(*) from public.equipment_service_records r where r.equipment_id=a.id and r.deleted_at is null and r.record_type='REPAIR'),0)::int as repair_count,
  coalesce((select sum(r.cost_yen) from public.equipment_service_records r where r.equipment_id=a.id and r.deleted_at is null),0)::numeric(16,2) as lifetime_service_cost_yen,
  (select max(r.record_date) from public.equipment_service_records r where r.equipment_id=a.id and r.deleted_at is null) as last_service_date,
  least(a.vehicle_inspection_expiry,a.vehicle_tax_due_date,a.insurance_expiry,a.next_maintenance_date,
    (select min(r.next_due_date) from public.equipment_service_records r where r.equipment_id=a.id and r.deleted_at is null and r.next_due_date is not null and r.next_due_date>=current_date)) as next_due_date
from public.equipment_assets a where a.deleted_at is null;
grant select on public.equipment_asset_summary to authenticated;

create or replace function public.admin_save_equipment_asset(p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_before jsonb;v_after jsonb;v_name text;v_category text;v_status text;v_acq text;v_fuel text;v_no text;
begin
  perform public.require_admin_();
  v_id:=nullif(p_payload->>'id','')::uuid; v_name:=btrim(coalesce(p_payload->>'name','')); v_category:=upper(btrim(coalesce(p_payload->>'category',''))); v_status:=upper(btrim(coalesce(p_payload->>'status','NORMAL'))); v_acq:=upper(btrim(coalesce(p_payload->>'acquisition_type','PURCHASED'))); v_fuel:=upper(btrim(coalesce(p_payload->>'fuel_type','NONE')));
  if v_name='' then raise exception '設備名を入力してください'; end if;
  if v_category not in('AGRICULTURAL_MACHINE','TOOL','VEHICLE','OTHER') then raise exception '設備区分を確認してください'; end if;
  if v_status not in('NORMAL','CAUTION','REPAIR_NEEDED','UNDER_REPAIR','OUT_OF_SERVICE','DISPOSED') then raise exception '状態を確認してください'; end if;
  if v_acq not in('PURCHASED','RECEIVED','INHERITED','LEASED','OTHER') then raise exception '取得区分を確認してください'; end if;
  if v_fuel not in('NONE','GASOLINE','MIXED_OIL','DIESEL','ELECTRIC','BATTERY','OTHER') then raise exception '燃料タイプを確認してください'; end if;
  if nullif(p_payload->>'purchase_price_yen','')::numeric < 0 then raise exception '金額は0以上で入力してください'; end if;
  if v_id is null then
    v_no:='EQP-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(md5(random()::text),1,4));
    insert into public.equipment_assets(asset_no,category,name,manufacturer,model_no,serial_no,acquisition_type,acquisition_date,purchase_price_yen,fuel_type,fuel_note,storage_location,status,condition_note,vehicle_registration_no,vehicle_inspection_expiry,vehicle_tax_due_date,insurance_expiry,next_maintenance_date,current_odometer_km,current_hour_meter,note,is_active,created_by,updated_by)
    values(v_no,v_category,v_name,nullif(btrim(p_payload->>'manufacturer'),''),nullif(btrim(p_payload->>'model_no'),''),nullif(btrim(p_payload->>'serial_no'),''),v_acq,nullif(p_payload->>'acquisition_date','')::date,nullif(p_payload->>'purchase_price_yen','')::numeric,v_fuel,nullif(btrim(p_payload->>'fuel_note'),''),nullif(btrim(p_payload->>'storage_location'),''),v_status,nullif(btrim(p_payload->>'condition_note'),''),nullif(btrim(p_payload->>'vehicle_registration_no'),''),nullif(p_payload->>'vehicle_inspection_expiry','')::date,nullif(p_payload->>'vehicle_tax_due_date','')::date,nullif(p_payload->>'insurance_expiry','')::date,nullif(p_payload->>'next_maintenance_date','')::date,nullif(p_payload->>'current_odometer_km','')::numeric,nullif(p_payload->>'current_hour_meter','')::numeric,nullif(btrim(p_payload->>'note'),''),coalesce((p_payload->>'is_active')::boolean,true),auth.uid(),auth.uid()) returning id into v_id;
  else
    select to_jsonb(a) into v_before from public.equipment_assets a where a.id=v_id and a.deleted_at is null for update; if v_before is null then raise exception '設備が見つかりません'; end if;
    update public.equipment_assets set category=v_category,name=v_name,manufacturer=nullif(btrim(p_payload->>'manufacturer'),''),model_no=nullif(btrim(p_payload->>'model_no'),''),serial_no=nullif(btrim(p_payload->>'serial_no'),''),acquisition_type=v_acq,acquisition_date=nullif(p_payload->>'acquisition_date','')::date,purchase_price_yen=nullif(p_payload->>'purchase_price_yen','')::numeric,fuel_type=v_fuel,fuel_note=nullif(btrim(p_payload->>'fuel_note'),''),storage_location=nullif(btrim(p_payload->>'storage_location'),''),status=v_status,condition_note=nullif(btrim(p_payload->>'condition_note'),''),vehicle_registration_no=nullif(btrim(p_payload->>'vehicle_registration_no'),''),vehicle_inspection_expiry=nullif(p_payload->>'vehicle_inspection_expiry','')::date,vehicle_tax_due_date=nullif(p_payload->>'vehicle_tax_due_date','')::date,insurance_expiry=nullif(p_payload->>'insurance_expiry','')::date,next_maintenance_date=nullif(p_payload->>'next_maintenance_date','')::date,current_odometer_km=nullif(p_payload->>'current_odometer_km','')::numeric,current_hour_meter=nullif(p_payload->>'current_hour_meter','')::numeric,note=nullif(btrim(p_payload->>'note'),''),is_active=coalesce((p_payload->>'is_active')::boolean,true),updated_by=auth.uid(),updated_at=now() where id=v_id;
  end if;
  select to_jsonb(a) into v_after from public.equipment_assets a where a.id=v_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),case when v_before is null then 'CREATE' else 'UPDATE' end,'equipment_asset',v_id::text,v_before,v_after); return v_id;
end $$;
revoke all on function public.admin_save_equipment_asset(jsonb) from public,anon; grant execute on function public.admin_save_equipment_asset(jsonb) to authenticated;

create or replace function public.admin_save_equipment_service_record(p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_equipment uuid;v_before jsonb;v_after jsonb;v_type text;v_desc text;v_status text;
begin
  perform public.require_admin_();
  v_id:=nullif(p_payload->>'id','')::uuid; v_equipment:=nullif(p_payload->>'equipment_id','')::uuid; v_type:=upper(btrim(coalesce(p_payload->>'record_type',''))); v_desc:=btrim(coalesce(p_payload->>'description','')); v_status:=nullif(upper(btrim(coalesce(p_payload->>'status_after',''))),'');
  if v_equipment is null or not exists(select 1 from public.equipment_assets where id=v_equipment and deleted_at is null) then raise exception '対象設備を選択してください'; end if;
  if v_type not in('REPAIR','MAINTENANCE','INSPECTION','OIL_CHANGE','PART_REPLACEMENT','VEHICLE_INSPECTION','VEHICLE_TAX','INSURANCE','OTHER') then raise exception '履歴区分を確認してください'; end if;
  if v_desc='' then raise exception '内容を入力してください'; end if;
  if coalesce(nullif(p_payload->>'cost_yen','')::numeric,0)<0 then raise exception '金額は0以上で入力してください'; end if;
  if v_status is not null and v_status not in('NORMAL','CAUTION','REPAIR_NEEDED','UNDER_REPAIR','OUT_OF_SERVICE','DISPOSED') then raise exception '作業後の状態を確認してください'; end if;
  if v_id is null then
    insert into public.equipment_service_records(equipment_id,record_type,record_date,vendor,description,cost_yen,odometer_km,hour_meter,next_due_date,status_after,condition_after,note,created_by,updated_by)
    values(v_equipment,v_type,coalesce(nullif(p_payload->>'record_date','')::date,current_date),nullif(btrim(p_payload->>'vendor'),''),v_desc,coalesce(nullif(p_payload->>'cost_yen','')::numeric,0),nullif(p_payload->>'odometer_km','')::numeric,nullif(p_payload->>'hour_meter','')::numeric,nullif(p_payload->>'next_due_date','')::date,v_status,nullif(btrim(p_payload->>'condition_after'),''),nullif(btrim(p_payload->>'note'),''),auth.uid(),auth.uid()) returning id into v_id;
  else
    select to_jsonb(r) into v_before from public.equipment_service_records r where r.id=v_id and r.deleted_at is null for update; if v_before is null then raise exception '履歴が見つかりません'; end if;
    update public.equipment_service_records set equipment_id=v_equipment,record_type=v_type,record_date=coalesce(nullif(p_payload->>'record_date','')::date,current_date),vendor=nullif(btrim(p_payload->>'vendor'),''),description=v_desc,cost_yen=coalesce(nullif(p_payload->>'cost_yen','')::numeric,0),odometer_km=nullif(p_payload->>'odometer_km','')::numeric,hour_meter=nullif(p_payload->>'hour_meter','')::numeric,next_due_date=nullif(p_payload->>'next_due_date','')::date,status_after=v_status,condition_after=nullif(btrim(p_payload->>'condition_after'),''),note=nullif(btrim(p_payload->>'note'),''),updated_by=auth.uid(),updated_at=now() where id=v_id;
  end if;
  if v_status is not null or nullif(p_payload->>'odometer_km','') is not null or nullif(p_payload->>'hour_meter','') is not null or nullif(btrim(p_payload->>'condition_after'),'') is not null then
    update public.equipment_assets set status=coalesce(v_status,status),condition_note=coalesce(nullif(btrim(p_payload->>'condition_after'),''),condition_note),current_odometer_km=coalesce(nullif(p_payload->>'odometer_km','')::numeric,current_odometer_km),current_hour_meter=coalesce(nullif(p_payload->>'hour_meter','')::numeric,current_hour_meter),updated_by=auth.uid(),updated_at=now() where id=v_equipment;
  end if;
  select to_jsonb(r) into v_after from public.equipment_service_records r where r.id=v_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),case when v_before is null then 'CREATE' else 'UPDATE' end,'equipment_service_record',v_id::text,v_before,v_after); return v_id;
end $$;
revoke all on function public.admin_save_equipment_service_record(jsonb) from public,anon; grant execute on function public.admin_save_equipment_service_record(jsonb) to authenticated;

create or replace function public.admin_delete_equipment_service_record(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_before jsonb;
begin
  perform public.require_admin_(); select to_jsonb(r) into v_before from public.equipment_service_records r where r.id=p_id and r.deleted_at is null for update; if v_before is null then raise exception '履歴が見つかりません'; end if;
  update public.equipment_service_records set deleted_at=now(),updated_by=auth.uid(),updated_at=now() where id=p_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'DELETE','equipment_service_record',p_id::text,v_before,null);
end $$;
revoke all on function public.admin_delete_equipment_service_record(uuid) from public,anon; grant execute on function public.admin_delete_equipment_service_record(uuid) to authenticated;
