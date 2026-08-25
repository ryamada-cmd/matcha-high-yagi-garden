-- Secondary manufacturing, production-lot inventory and manufacturing costing.
-- Applied to production on 2026-08-25.

create table if not exists public.production_lots (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique not null,
  source_type text not null check(source_type in ('PRIMARY_PROCESSING','MANUFACTURING','MANUAL_RECEIPT')),
  source_id uuid,
  material_name text not null,
  category text not null default '原料',
  unit text not null default 'kg',
  received_date date not null default current_date,
  initial_qty numeric(16,3) not null check(initial_qty>0),
  total_cost_yen numeric(16,2) not null default 0 check(total_cost_yen>=0),
  supplier text,
  storage_location text,
  note text,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type,source_id)
);

create table if not exists public.production_transactions (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.production_lots(id),
  transaction_type text not null check(transaction_type in ('RECEIPT','CONSUME','RETURN','ADJUSTMENT','DISPOSAL')),
  quantity numeric(16,3) not null check(quantity<>0),
  reference_type text,
  reference_id uuid,
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.manufacturing_batches (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique not null,
  manufacturing_date date not null,
  process_type text not null,
  output_material text not null,
  output_qty numeric(16,3) not null check(output_qty>0),
  output_unit text not null default 'kg',
  facility text,
  processing_cost_yen numeric(16,2) not null default 0 check(processing_cost_yen>=0),
  packaging_cost_yen numeric(16,2) not null default 0 check(packaging_cost_yen>=0),
  other_cost_yen numeric(16,2) not null default 0 check(other_cost_yen>=0),
  inherited_input_cost_yen numeric(16,2) not null default 0 check(inherited_input_cost_yen>=0),
  total_manufacturing_cost_yen numeric(16,2) not null default 0 check(total_manufacturing_cost_yen>=0),
  output_lot_id uuid unique references public.production_lots(id),
  operator_id uuid references auth.users(id),
  operator_name_snapshot text,
  note text,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manufacturing_batch_inputs (
  id uuid primary key default gen_random_uuid(),
  manufacturing_batch_id uuid not null references public.manufacturing_batches(id) on delete cascade,
  lot_id uuid not null references public.production_lots(id),
  input_qty numeric(16,3) not null check(input_qty>0),
  input_unit_snapshot text not null,
  unit_cost_snapshot_yen numeric(16,4) not null default 0 check(unit_cost_snapshot_yen>=0),
  input_cost_yen numeric(16,2) not null default 0 check(input_cost_yen>=0),
  created_at timestamptz not null default now(),
  unique(manufacturing_batch_id,lot_id)
);

create index if not exists idx_production_lots_material on public.production_lots(material_name) where deleted_at is null;
create index if not exists idx_production_tx_lot on public.production_transactions(lot_id,created_at);
create index if not exists idx_manufacturing_date on public.manufacturing_batches(manufacturing_date desc) where deleted_at is null;
create index if not exists idx_manufacturing_inputs_lot on public.manufacturing_batch_inputs(lot_id);

alter table public.production_lots enable row level security;
alter table public.production_transactions enable row level security;
alter table public.manufacturing_batches enable row level security;
alter table public.manufacturing_batch_inputs enable row level security;

drop policy if exists production_lots_read on public.production_lots;
create policy production_lots_read on public.production_lots for select to authenticated using(true);
drop policy if exists production_tx_read on public.production_transactions;
create policy production_tx_read on public.production_transactions for select to authenticated using(true);
drop policy if exists manufacturing_batches_read on public.manufacturing_batches;
create policy manufacturing_batches_read on public.manufacturing_batches for select to authenticated using(true);
drop policy if exists manufacturing_inputs_read on public.manufacturing_batch_inputs;
create policy manufacturing_inputs_read on public.manufacturing_batch_inputs for select to authenticated using(true);

grant select on public.production_lots,public.production_transactions,public.manufacturing_batches,public.manufacturing_batch_inputs to authenticated;

create or replace view public.production_inventory_balances with(security_invoker=true) as
select l.id lot_id,l.legacy_id,l.material_name,l.category,l.unit,l.received_date,l.initial_qty,l.total_cost_yen,
       case when l.initial_qty>0 then round(l.total_cost_yen/l.initial_qty,4) else 0 end unit_cost_yen,
       coalesce(sum(t.quantity),0)::numeric(16,3) balance,
       round(coalesce(sum(t.quantity),0) * case when l.initial_qty>0 then l.total_cost_yen/l.initial_qty else 0 end,2) inventory_value_yen,
       l.source_type,l.source_id,l.supplier,l.storage_location,l.note,l.deleted_at
from public.production_lots l
left join public.production_transactions t on t.lot_id=l.id
group by l.id,l.legacy_id,l.material_name,l.category,l.unit,l.received_date,l.initial_qty,l.total_cost_yen,l.source_type,l.source_id,l.supplier,l.storage_location,l.note,l.deleted_at;
grant select on public.production_inventory_balances to authenticated;

create or replace function public.production_lot_downstream_used_qty(p_lot uuid) returns numeric
language sql stable security definer set search_path=public as $$
  select greatest(coalesce(-sum(case when transaction_type='CONSUME' then quantity when transaction_type='RETURN' then quantity else 0 end),0),0)::numeric
  from public.production_transactions where lot_id=p_lot
$$;
revoke all on function public.production_lot_downstream_used_qty(uuid) from public,anon;
grant execute on function public.production_lot_downstream_used_qty(uuid) to authenticated;

create or replace function public.sync_primary_processing_production_lot() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_lot uuid;v_balance numeric;v_used numeric;v_delta numeric;v_changed boolean;
begin
  select id into v_lot from public.production_lots where source_type='PRIMARY_PROCESSING' and source_id=new.id;
  if v_lot is null and new.deleted_at is null then
    insert into public.production_lots(legacy_id,source_type,source_id,material_name,category,unit,received_date,initial_qty,total_cost_yen,supplier,note)
    values('LOT-'||new.legacy_id,'PRIMARY_PROCESSING',new.id,new.output_material,'原料','kg',new.processing_date,new.output_kg,new.processing_cost_yen,new.facility,new.note)
    returning id into v_lot;
    insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by)
    values(v_lot,'RECEIPT',new.output_kg,'PRIMARY_PROCESSING',new.id,'一次製茶出来高',auth.uid());
    return new;
  end if;
  if v_lot is null then return new; end if;

  select coalesce(balance,0) into v_balance from public.production_inventory_balances where lot_id=v_lot;
  v_used:=public.production_lot_downstream_used_qty(v_lot);

  if old.deleted_at is null and new.deleted_at is not null then
    if v_used>0.0005 then raise exception 'この製茶出来高は後工程で使用中です。先に後工程を削除してください'; end if;
    if abs(v_balance-old.output_kg)>0.0005 then raise exception 'この製茶出来高は在庫操作済みのため削除できません'; end if;
    if abs(v_balance)>0.0005 then
      insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by)
      values(v_lot,'ADJUSTMENT',-v_balance,'PRIMARY_PROCESSING',new.id,'一次製茶削除による在庫取消',auth.uid());
    end if;
    update public.production_lots set deleted_at=now(),deleted_by=auth.uid(),delete_reason=coalesce(new.delete_reason,'一次製茶削除'),updated_at=now() where id=v_lot;
    return new;
  end if;

  v_changed := old.output_kg is distinct from new.output_kg or old.output_material is distinct from new.output_material or old.processing_cost_yen is distinct from new.processing_cost_yen;
  if v_changed then
    if v_used>0.0005 then raise exception 'この製茶出来高は後工程で使用中のため、出来高・品目・加工費を変更できません'; end if;
    if abs(v_balance-old.output_kg)>0.0005 then raise exception 'この製茶出来高は在庫操作済みのため、出来高・品目・加工費を変更できません'; end if;
    v_delta:=new.output_kg-old.output_kg;
    if abs(v_delta)>0.0005 then
      insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by)
      values(v_lot,'ADJUSTMENT',v_delta,'PRIMARY_PROCESSING',new.id,'一次製茶出来高変更',auth.uid());
    end if;
  end if;
  update public.production_lots set material_name=new.output_material,received_date=new.processing_date,initial_qty=new.output_kg,total_cost_yen=new.processing_cost_yen,supplier=new.facility,note=new.note,updated_at=now() where id=v_lot;
  return new;
end $$;

drop trigger if exists trg_sync_primary_processing_production_lot on public.tea_processing_batches;
create trigger trg_sync_primary_processing_production_lot after insert or update on public.tea_processing_batches
for each row execute function public.sync_primary_processing_production_lot();

insert into public.production_lots(legacy_id,source_type,source_id,material_name,category,unit,received_date,initial_qty,total_cost_yen,supplier,note)
select 'LOT-'||b.legacy_id,'PRIMARY_PROCESSING',b.id,b.output_material,'原料','kg',b.processing_date,b.output_kg,b.processing_cost_yen,b.facility,b.note
from public.tea_processing_batches b where b.deleted_at is null
on conflict(source_type,source_id) do nothing;
insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason)
select l.id,'RECEIPT',l.initial_qty,'PRIMARY_PROCESSING',l.source_id,'一次製茶出来高（移行）'
from public.production_lots l where l.source_type='PRIMARY_PROCESSING' and l.deleted_at is null
and not exists(select 1 from public.production_transactions t where t.lot_id=l.id);

create or replace function public.admin_receive_production_lot(p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_qty numeric;v_cost numeric;v_legacy text;
begin
  perform public.require_admin_();
  v_qty:=coalesce(nullif(p_payload->>'quantity','')::numeric,0);v_cost:=coalesce(nullif(p_payload->>'total_cost_yen','')::numeric,0);
  if btrim(coalesce(p_payload->>'material_name',''))='' then raise exception '品目名を入力してください';end if;
  if v_qty<=0 then raise exception '入庫数量は0より大きくしてください';end if;
  if btrim(coalesce(p_payload->>'unit',''))='' then raise exception '単位を入力してください';end if;
  v_legacy:='PROD-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,4));
  insert into public.production_lots(legacy_id,source_type,material_name,category,unit,received_date,initial_qty,total_cost_yen,supplier,storage_location,note)
  values(v_legacy,'MANUAL_RECEIPT',btrim(p_payload->>'material_name'),coalesce(nullif(btrim(p_payload->>'category'),''),'原料'),btrim(p_payload->>'unit'),coalesce(nullif(p_payload->>'received_date','')::date,current_date),round(v_qty,3),round(v_cost,2),nullif(btrim(p_payload->>'supplier'),''),nullif(btrim(p_payload->>'storage_location'),''),nullif(btrim(p_payload->>'note'),'')) returning id into v_id;
  insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values(v_id,'RECEIPT',round(v_qty,3),'MANUAL_RECEIPT',v_id,'原料・製品入庫',auth.uid());
  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data) values(auth.uid(),'CREATE','production_lot',v_id::text,(select to_jsonb(x) from public.production_lots x where x.id=v_id));
  return v_id;
end $$;
revoke all on function public.admin_receive_production_lot(jsonb) from public,anon;grant execute on function public.admin_receive_production_lot(jsonb) to authenticated;

create or replace function public.admin_adjust_production_lot(p_lot_id uuid,p_target_qty numeric,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare v_balance numeric;v_delta numeric;v_before jsonb;
begin
 perform public.require_admin_();if p_target_qty<0 then raise exception '在庫数量を0未満にはできません';end if;if btrim(coalesce(p_reason,''))='' then raise exception '棚卸理由を入力してください';end if;
 perform 1 from public.production_lots where id=p_lot_id and deleted_at is null for update;if not found then raise exception 'ロットが見つかりません';end if;
 select coalesce(balance,0) into v_balance from public.production_inventory_balances where lot_id=p_lot_id;v_delta:=round(p_target_qty-v_balance,3);if abs(v_delta)<=0.0005 then return;end if;
 v_before:=jsonb_build_object('balance',v_balance);insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values(p_lot_id,'ADJUSTMENT',v_delta,'STOCKTAKE',p_lot_id,btrim(p_reason),auth.uid());
 insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'UPDATE','production_stock',p_lot_id::text,v_before,jsonb_build_object('balance',p_target_qty,'reason',p_reason));
end $$;
revoke all on function public.admin_adjust_production_lot(uuid,numeric,text) from public,anon;grant execute on function public.admin_adjust_production_lot(uuid,numeric,text) to authenticated;

create or replace function public.admin_dispose_production_lot(p_lot_id uuid,p_qty numeric,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare v_balance numeric;
begin
 perform public.require_admin_();if p_qty<=0 then raise exception '廃棄数量を入力してください';end if;if btrim(coalesce(p_reason,''))='' then raise exception '廃棄理由を入力してください';end if;
 perform 1 from public.production_lots where id=p_lot_id and deleted_at is null for update;if not found then raise exception 'ロットが見つかりません';end if;select coalesce(balance,0) into v_balance from public.production_inventory_balances where lot_id=p_lot_id;if p_qty>v_balance+0.0005 then raise exception '在庫数量を超えて廃棄できません';end if;
 insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values(p_lot_id,'DISPOSAL',-round(p_qty,3),'DISPOSAL',p_lot_id,btrim(p_reason),auth.uid());
 insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data) values(auth.uid(),'DELETE','production_stock',p_lot_id::text,jsonb_build_object('disposed_qty',p_qty,'reason',p_reason));
end $$;
revoke all on function public.admin_dispose_production_lot(uuid,numeric,text) from public,anon;grant execute on function public.admin_dispose_production_lot(uuid,numeric,text) to authenticated;

create or replace function public.save_manufacturing_batch(p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_role text;v_display text;v_id uuid;v_output_lot uuid;v_before jsonb;v_after jsonb;v_legacy text;v_date date;v_output numeric;v_item jsonb;v_lot uuid;v_input numeric;v_balance numeric;v_old_input numeric;v_unit text;v_initial numeric;v_lot_cost numeric;v_unit_cost numeric;v_input_cost numeric;v_total_input_cost numeric:=0;v_direct numeric;v_pack numeric;v_other numeric;v_total_cost numeric;v_seen jsonb:='{}'::jsonb;v_old_output numeric;v_output_balance numeric;v_used numeric;v_all_same boolean:=true;v_first_unit text:=null;v_sum_same_unit numeric:=0;
begin
 if auth.uid() is null then raise exception 'ログインが必要です';end if;select role,display_name into v_role,v_display from public.profiles where id=auth.uid();if coalesce(v_role,'') not in('admin','worker') then raise exception '権限がありません';end if;
 v_id:=nullif(p_payload->>'id','')::uuid;v_date:=coalesce(nullif(p_payload->>'manufacturing_date','')::date,current_date);v_output:=coalesce(nullif(p_payload->>'output_qty','')::numeric,0);v_direct:=coalesce(nullif(p_payload->>'processing_cost_yen','')::numeric,0);v_pack:=coalesce(nullif(p_payload->>'packaging_cost_yen','')::numeric,0);v_other:=coalesce(nullif(p_payload->>'other_cost_yen','')::numeric,0);
 if btrim(coalesce(p_payload->>'process_type',''))='' then raise exception '加工工程を入力してください';end if;if btrim(coalesce(p_payload->>'output_material',''))='' then raise exception '出来上がり品目を入力してください';end if;if v_output<=0 then raise exception '出来高は0より大きくしてください';end if;if btrim(coalesce(p_payload->>'output_unit',''))='' then raise exception '出来高単位を入力してください';end if;if jsonb_typeof(p_payload->'inputs')<>'array' or jsonb_array_length(p_payload->'inputs')=0 then raise exception '原料ロットを1件以上選択してください';end if;
 if v_id is not null then
   select jsonb_build_object('batch',to_jsonb(b),'inputs',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.manufacturing_batch_inputs i where i.manufacturing_batch_id=b.id)) into v_before from public.manufacturing_batches b where b.id=v_id and b.deleted_at is null for update;
   if v_before is null then raise exception '加工実績が見つかりません';end if;
   select output_lot_id,output_qty into v_output_lot,v_old_output from public.manufacturing_batches where id=v_id;
   v_used:=public.production_lot_downstream_used_qty(v_output_lot);select coalesce(balance,0) into v_output_balance from public.production_inventory_balances where lot_id=v_output_lot;
   if v_used>0.0005 then raise exception 'この加工出来高は後工程で使用中のため編集できません';end if;if abs(v_output_balance-v_old_output)>0.0005 then raise exception 'この加工出来高は在庫操作済みのため編集できません';end if;
 else
   v_legacy:='MFG-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,4));
   insert into public.manufacturing_batches(legacy_id,manufacturing_date,process_type,output_material,output_qty,output_unit,facility,processing_cost_yen,packaging_cost_yen,other_cost_yen,operator_id,operator_name_snapshot,note)
   values(v_legacy,v_date,btrim(p_payload->>'process_type'),btrim(p_payload->>'output_material'),round(v_output,3),btrim(p_payload->>'output_unit'),nullif(btrim(p_payload->>'facility'),''),v_direct,v_pack,v_other,auth.uid(),coalesce(nullif(btrim(p_payload->>'operator_name'),''),v_display),nullif(btrim(p_payload->>'note'),'')) returning id into v_id;
 end if;
 for v_item in select * from jsonb_array_elements(p_payload->'inputs') loop
   v_lot:=nullif(v_item->>'lot_id','')::uuid;v_input:=coalesce(nullif(v_item->>'input_qty','')::numeric,0);if v_lot is null or v_input<=0 then raise exception '原料ロットと投入量を確認してください';end if;if v_seen ? v_lot::text then raise exception '同じ原料ロットが重複しています';end if;v_seen:=v_seen||jsonb_build_object(v_lot::text,true);
   select unit,initial_qty,total_cost_yen into v_unit,v_initial,v_lot_cost from public.production_lots where id=v_lot and deleted_at is null for update;if v_unit is null then raise exception '原料ロットが見つかりません';end if;select coalesce(balance,0) into v_balance from public.production_inventory_balances where lot_id=v_lot;select coalesce(input_qty,0) into v_old_input from public.manufacturing_batch_inputs where manufacturing_batch_id=v_id and lot_id=v_lot;v_balance:=v_balance+coalesce(v_old_input,0);if v_input>v_balance+0.0005 then raise exception '原料ロットの在庫不足です（在庫 % % / 必要 % %）',v_balance,v_unit,v_input,v_unit;end if;
   v_unit_cost:=case when v_initial>0 then v_lot_cost/v_initial else 0 end;v_input_cost:=round(v_input*v_unit_cost,2);v_total_input_cost:=v_total_input_cost+v_input_cost;
   if v_first_unit is null then v_first_unit:=v_unit;elsif v_first_unit<>v_unit then v_all_same:=false;end if;if v_unit=btrim(p_payload->>'output_unit') then v_sum_same_unit:=v_sum_same_unit+v_input;end if;
 end loop;
 if v_all_same and v_first_unit=btrim(p_payload->>'output_unit') and v_output>v_sum_same_unit+0.0005 then raise exception '出来高が投入量を超えています';end if;v_total_cost:=round(v_total_input_cost+v_direct+v_pack+v_other,2);
 if v_before is not null then
   for v_item in select to_jsonb(i) from public.manufacturing_batch_inputs i where i.manufacturing_batch_id=v_id loop
     insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values((v_item->>'lot_id')::uuid,'RETURN',(v_item->>'input_qty')::numeric,'MANUFACTURING',v_id,'加工実績編集による原料戻入',auth.uid());
   end loop;
   delete from public.manufacturing_batch_inputs where manufacturing_batch_id=v_id;
 end if;
 for v_item in select * from jsonb_array_elements(p_payload->'inputs') loop
   v_lot:=(v_item->>'lot_id')::uuid;v_input:=(v_item->>'input_qty')::numeric;select unit,initial_qty,total_cost_yen into v_unit,v_initial,v_lot_cost from public.production_lots where id=v_lot;v_unit_cost:=case when v_initial>0 then v_lot_cost/v_initial else 0 end;v_input_cost:=round(v_input*v_unit_cost,2);
   insert into public.manufacturing_batch_inputs(manufacturing_batch_id,lot_id,input_qty,input_unit_snapshot,unit_cost_snapshot_yen,input_cost_yen) values(v_id,v_lot,round(v_input,3),v_unit,round(v_unit_cost,4),v_input_cost);
   insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values(v_lot,'CONSUME',-round(v_input,3),'MANUFACTURING',v_id,'加工原料使用',auth.uid());
 end loop;
 if v_before is null then
   insert into public.production_lots(legacy_id,source_type,source_id,material_name,category,unit,received_date,initial_qty,total_cost_yen,supplier,note)
   values('LOT-'||v_legacy,'MANUFACTURING',v_id,btrim(p_payload->>'output_material'),coalesce(nullif(btrim(p_payload->>'category'),''),'製品'),btrim(p_payload->>'output_unit'),v_date,round(v_output,3),v_total_cost,nullif(btrim(p_payload->>'facility'),''),nullif(btrim(p_payload->>'note'),'')) returning id into v_output_lot;
   insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values(v_output_lot,'RECEIPT',round(v_output,3),'MANUFACTURING',v_id,'加工出来高',auth.uid());
 else
   if abs(v_output-v_old_output)>0.0005 then insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values(v_output_lot,'ADJUSTMENT',round(v_output-v_old_output,3),'MANUFACTURING',v_id,'加工出来高変更',auth.uid());end if;
   update public.production_lots set material_name=btrim(p_payload->>'output_material'),category=coalesce(nullif(btrim(p_payload->>'category'),''),category),unit=btrim(p_payload->>'output_unit'),received_date=v_date,initial_qty=round(v_output,3),total_cost_yen=v_total_cost,supplier=nullif(btrim(p_payload->>'facility'),''),note=nullif(btrim(p_payload->>'note'),''),updated_at=now() where id=v_output_lot;
 end if;
 update public.manufacturing_batches set manufacturing_date=v_date,process_type=btrim(p_payload->>'process_type'),output_material=btrim(p_payload->>'output_material'),output_qty=round(v_output,3),output_unit=btrim(p_payload->>'output_unit'),facility=nullif(btrim(p_payload->>'facility'),''),processing_cost_yen=v_direct,packaging_cost_yen=v_pack,other_cost_yen=v_other,inherited_input_cost_yen=round(v_total_input_cost,2),total_manufacturing_cost_yen=v_total_cost,output_lot_id=v_output_lot,operator_name_snapshot=coalesce(nullif(btrim(p_payload->>'operator_name'),''),operator_name_snapshot),note=nullif(btrim(p_payload->>'note'),''),updated_at=now() where id=v_id;
 select jsonb_build_object('batch',to_jsonb(b),'inputs',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.manufacturing_batch_inputs i where i.manufacturing_batch_id=b.id),'output_lot',(select to_jsonb(l) from public.production_lots l where l.id=b.output_lot_id)) into v_after from public.manufacturing_batches b where b.id=v_id;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),case when v_before is null then 'CREATE' else 'UPDATE' end,'manufacturing_batch',v_id::text,v_before,v_after);return v_id;
end $$;
revoke all on function public.save_manufacturing_batch(jsonb) from public,anon;grant execute on function public.save_manufacturing_batch(jsonb) to authenticated;

create or replace function public.delete_manufacturing_batch(p_id uuid,p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare v_before jsonb;v_output_lot uuid;v_output_qty numeric;v_balance numeric;v_used numeric;v_item record;
begin
 perform public.require_admin_();select jsonb_build_object('batch',to_jsonb(b),'inputs',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.manufacturing_batch_inputs i where i.manufacturing_batch_id=b.id)),b.output_lot_id,b.output_qty into v_before,v_output_lot,v_output_qty from public.manufacturing_batches b where b.id=p_id and b.deleted_at is null for update;if v_before is null then raise exception '加工実績が見つかりません';end if;
 v_used:=public.production_lot_downstream_used_qty(v_output_lot);select coalesce(balance,0) into v_balance from public.production_inventory_balances where lot_id=v_output_lot;if v_used>0.0005 then raise exception 'この加工出来高は後工程で使用中です。先に後工程を削除してください';end if;if abs(v_balance-v_output_qty)>0.0005 then raise exception 'この加工出来高は在庫操作済みのため削除できません';end if;
 for v_item in select lot_id,input_qty from public.manufacturing_batch_inputs where manufacturing_batch_id=p_id loop insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values(v_item.lot_id,'RETURN',v_item.input_qty,'MANUFACTURING',p_id,'加工削除による原料戻入',auth.uid());end loop;
 if abs(v_balance)>0.0005 then insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values(v_output_lot,'ADJUSTMENT',-v_balance,'MANUFACTURING',p_id,'加工削除による出来高取消',auth.uid());end if;
 update public.production_lots set deleted_at=now(),deleted_by=auth.uid(),delete_reason=nullif(btrim(p_reason),''),updated_at=now() where id=v_output_lot;update public.manufacturing_batches set deleted_at=now(),deleted_by=auth.uid(),delete_reason=nullif(btrim(p_reason),''),updated_at=now() where id=p_id;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'DELETE','manufacturing_batch',p_id::text,v_before,jsonb_build_object('deleted_at',now(),'reason',p_reason));
end $$;
revoke all on function public.delete_manufacturing_batch(uuid,text) from public,anon;grant execute on function public.delete_manufacturing_batch(uuid,text) to authenticated;
