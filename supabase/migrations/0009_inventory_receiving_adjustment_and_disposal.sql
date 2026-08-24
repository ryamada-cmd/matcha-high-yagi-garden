alter table public.inventory_transactions drop constraint if exists inventory_transactions_quantity_check;
alter table public.inventory_transactions add constraint inventory_transactions_quantity_check
check (
  (transaction_type = 'ADJUSTMENT' and quantity <> 0)
  or
  (transaction_type <> 'ADJUSTMENT' and quantity > 0)
);

create or replace function public.require_admin_()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
begin
  if v_user is null then raise exception 'ログインが必要です'; end if;
  select role into v_role from public.profiles where id = v_user;
  if coalesce(v_role,'') <> 'admin' then raise exception 'この操作は管理者のみ実行できます'; end if;
  return v_user;
end;
$$;
revoke all on function public.require_admin_() from public, anon, authenticated;

create or replace function public.admin_receive_inventory_lot(
  p_pesticide_id uuid,p_purchase_date date,p_supplier text,p_purchase_unit_price numeric,
  p_package_count numeric,p_package_unit text,p_package_size numeric,p_content_unit text,
  p_expiry_date date,p_storage_location text,p_manufacturer_lot_no text,p_note text
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_lot_id uuid; v_legacy text; v_total numeric; v_pesticide_name text;
begin
  v_user:=public.require_admin_();
  if p_pesticide_id is null then raise exception '農薬を選択してください'; end if;
  if coalesce(p_package_count,0)<=0 then raise exception '容器数は0より大きくしてください'; end if;
  if coalesce(p_package_size,0)<=0 then raise exception '1容器内容量は0より大きくしてください'; end if;
  if p_content_unit not in ('ml','g') then raise exception '内容量単位はmlまたはgです'; end if;
  if coalesce(p_purchase_unit_price,0)<0 then raise exception '単価は0以上にしてください'; end if;
  select name into v_pesticide_name from public.pesticides where id=p_pesticide_id;
  if v_pesticide_name is null then raise exception '農薬マスタが見つかりません'; end if;
  v_total:=round(p_package_count*p_package_size,3);
  v_legacy:='LOT-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  insert into public.inventory_lots(legacy_id,pesticide_id,purchase_date,supplier,purchase_unit_price,package_count,package_unit,package_size,content_unit,purchased_content_qty,expiry_date,storage_location,manufacturer_lot_no,note)
  values(v_legacy,p_pesticide_id,p_purchase_date,nullif(trim(p_supplier),''),p_purchase_unit_price,p_package_count,nullif(trim(p_package_unit),''),p_package_size,p_content_unit,v_total,p_expiry_date,nullif(trim(p_storage_location),''),nullif(trim(p_manufacturer_lot_no),''),nullif(trim(p_note),'')) returning id into v_lot_id;
  insert into public.inventory_transactions(inventory_lot_id,transaction_type,quantity,unit,reference_type,reference_id,reason,created_by)
  values(v_lot_id,'PURCHASE',v_total,p_content_unit,'inventory_lot',v_lot_id,'農薬入庫：'||v_pesticide_name,v_user);
  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(v_user,'CREATE','inventory_lot',v_lot_id::text,jsonb_build_object('legacy_id',v_legacy,'pesticide',v_pesticide_name,'quantity',v_total,'unit',p_content_unit,'package_count',p_package_count,'package_size',p_package_size,'supplier',p_supplier));
  return v_lot_id;
end;$$;

create or replace function public.admin_adjust_inventory_stock(p_inventory_lot_id uuid,p_physical_balance numeric,p_reason text)
returns numeric language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_current numeric; v_delta numeric; v_unit text;
begin
  v_user:=public.require_admin_();
  if coalesce(p_physical_balance,-1)<0 then raise exception '実在庫は0以上にしてください'; end if;
  if nullif(trim(p_reason),'') is null then raise exception '棚卸調整理由を入力してください'; end if;
  perform 1 from public.inventory_lots where id=p_inventory_lot_id for update;
  if not found then raise exception '在庫ロットが見つかりません'; end if;
  select l.content_unit,b.balance into v_unit,v_current from public.inventory_lots l join public.inventory_balances b on b.inventory_lot_id=l.id where l.id=p_inventory_lot_id;
  v_current:=coalesce(v_current,0); v_delta:=round(p_physical_balance-v_current,3);
  if v_delta=0 then return 0; end if;
  insert into public.inventory_transactions(inventory_lot_id,transaction_type,quantity,unit,reference_type,reference_id,reason,created_by)
  values(p_inventory_lot_id,'ADJUSTMENT',v_delta,v_unit,'inventory_lot',p_inventory_lot_id,'棚卸調整：'||trim(p_reason),v_user);
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_user,'ADJUST','inventory_lot',p_inventory_lot_id::text,jsonb_build_object('balance',v_current,'unit',v_unit),jsonb_build_object('balance',p_physical_balance,'unit',v_unit,'delta',v_delta,'reason',trim(p_reason)));
  return v_delta;
end;$$;

create or replace function public.admin_dispose_inventory_stock(p_inventory_lot_id uuid,p_quantity numeric,p_reason text)
returns numeric language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_current numeric; v_unit text;
begin
  v_user:=public.require_admin_();
  if coalesce(p_quantity,0)<=0 then raise exception '廃棄量は0より大きくしてください'; end if;
  if nullif(trim(p_reason),'') is null then raise exception '廃棄理由を入力してください'; end if;
  perform 1 from public.inventory_lots where id=p_inventory_lot_id for update;
  if not found then raise exception '在庫ロットが見つかりません'; end if;
  select l.content_unit,b.balance into v_unit,v_current from public.inventory_lots l join public.inventory_balances b on b.inventory_lot_id=l.id where l.id=p_inventory_lot_id;
  v_current:=coalesce(v_current,0);
  if p_quantity>v_current then raise exception '廃棄量が現在庫を超えています（現在庫 % %）',v_current,v_unit; end if;
  insert into public.inventory_transactions(inventory_lot_id,transaction_type,quantity,unit,reference_type,reference_id,reason,created_by)
  values(p_inventory_lot_id,'DISPOSAL',p_quantity,v_unit,'inventory_lot',p_inventory_lot_id,'廃棄：'||trim(p_reason),v_user);
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_user,'DISPOSE','inventory_lot',p_inventory_lot_id::text,jsonb_build_object('balance',v_current,'unit',v_unit),jsonb_build_object('balance',v_current-p_quantity,'unit',v_unit,'disposed',p_quantity,'reason',trim(p_reason)));
  return v_current-p_quantity;
end;$$;

revoke all on function public.admin_receive_inventory_lot(uuid,date,text,numeric,numeric,text,numeric,text,date,text,text,text) from public,anon;
revoke all on function public.admin_adjust_inventory_stock(uuid,numeric,text) from public,anon;
revoke all on function public.admin_dispose_inventory_stock(uuid,numeric,text) from public,anon;
grant execute on function public.admin_receive_inventory_lot(uuid,date,text,numeric,numeric,text,numeric,text,date,text,text,text) to authenticated;
grant execute on function public.admin_adjust_inventory_stock(uuid,numeric,text) to authenticated;
grant execute on function public.admin_dispose_inventory_stock(uuid,numeric,text) to authenticated;
