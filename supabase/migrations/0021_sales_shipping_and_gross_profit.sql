-- Sales, shipment and gross-profit tracking linked to production lots.
-- Applied to production on 2026-08-25.

alter table public.production_transactions drop constraint if exists production_transactions_transaction_type_check;
alter table public.production_transactions add constraint production_transactions_transaction_type_check
  check(transaction_type in ('RECEIPT','CONSUME','RETURN','ADJUSTMENT','DISPOSAL','SALE','SALE_RETURN'));

create table if not exists public.sales_records (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique not null,
  sale_date date not null default current_date,
  customer_name text not null,
  sales_channel text,
  invoice_no text,
  shipping_destination text,
  note text,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','CANCELLED')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancel_reason text
);

create table if not exists public.sales_record_items (
  id uuid primary key default gen_random_uuid(),
  sales_record_id uuid not null references public.sales_records(id) on delete cascade,
  lot_id uuid not null references public.production_lots(id),
  lot_legacy_id_snapshot text not null,
  material_name_snapshot text not null,
  quantity numeric(16,3) not null check(quantity>0),
  unit_snapshot text not null,
  unit_price_yen numeric(16,2) not null default 0 check(unit_price_yen>=0),
  sales_amount_yen numeric(16,2) not null default 0,
  unit_cost_snapshot_yen numeric(16,4) not null default 0,
  cost_amount_yen numeric(16,2) not null default 0,
  gross_profit_yen numeric(16,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_records_date on public.sales_records(sale_date desc) where status='ACTIVE';
create index if not exists idx_sales_records_customer on public.sales_records(customer_name);
create index if not exists idx_sales_items_sale on public.sales_record_items(sales_record_id);
create index if not exists idx_sales_items_lot on public.sales_record_items(lot_id);

alter table public.sales_records enable row level security;
alter table public.sales_record_items enable row level security;
drop policy if exists sales_records_read on public.sales_records;
create policy sales_records_read on public.sales_records for select to authenticated using(true);
drop policy if exists sales_items_read on public.sales_record_items;
create policy sales_items_read on public.sales_record_items for select to authenticated using(true);
grant select on public.sales_records,public.sales_record_items to authenticated;

create or replace view public.sales_record_summary with(security_invoker=true) as
select s.id,s.legacy_id,s.sale_date,s.customer_name,s.sales_channel,s.invoice_no,s.shipping_destination,s.note,s.status,
       coalesce(sum(i.sales_amount_yen),0)::numeric(16,2) sales_amount_yen,
       coalesce(sum(i.cost_amount_yen),0)::numeric(16,2) cost_amount_yen,
       coalesce(sum(i.gross_profit_yen),0)::numeric(16,2) gross_profit_yen,
       count(i.id)::int item_count,s.created_at,s.cancelled_at,s.cancel_reason
from public.sales_records s
left join public.sales_record_items i on i.sales_record_id=s.id
group by s.id;
grant select on public.sales_record_summary to authenticated;

create or replace view public.sales_item_field_traceability with(security_invoker=true) as
with recursive lot_ancestry as (
  select l.id as root_lot_id,l.id as ancestor_lot_id,1::numeric as share
  from public.production_lots l
  union all
  select a.root_lot_id,mi.lot_id,
         a.share * (mi.input_qty/nullif(sum(mi.input_qty) over(partition by mi.manufacturing_batch_id),0))
  from lot_ancestry a
  join public.manufacturing_batches mb on mb.output_lot_id=a.ancestor_lot_id and mb.deleted_at is null
  join public.manufacturing_batch_inputs mi on mi.manufacturing_batch_id=mb.id
), primary_sources as (
  select a.root_lot_id,a.share,l.source_id as processing_batch_id
  from lot_ancestry a
  join public.production_lots l on l.id=a.ancestor_lot_id
  where l.source_type='PRIMARY_PROCESSING' and l.source_id is not null
), harvest_share as (
  select x.processing_batch_id,x.harvest_record_id,x.input_kg,
         x.input_kg/nullif(sum(x.input_kg) over(partition by x.processing_batch_id),0) as share
  from public.tea_processing_batch_harvests x
)
select i.id as sales_item_id,i.sales_record_id,i.lot_id,h.field_id,f.legacy_id as field_legacy_id,f.name as field_name,
       sum(ps.share*hs.share)::numeric as source_share,
       round(i.quantity*sum(ps.share*hs.share),3) as attributed_sale_qty,
       i.unit_snapshot
from public.sales_record_items i
join primary_sources ps on ps.root_lot_id=i.lot_id
join harvest_share hs on hs.processing_batch_id=ps.processing_batch_id
join public.harvest_records h on h.id=hs.harvest_record_id and h.deleted_at is null
join public.fields f on f.id=h.field_id
where exists(select 1 from public.sales_records s where s.id=i.sales_record_id and s.status='ACTIVE')
group by i.id,i.sales_record_id,i.lot_id,h.field_id,f.legacy_id,f.name,i.quantity,i.unit_snapshot;
grant select on public.sales_item_field_traceability to authenticated;

create or replace function public.admin_register_sale(p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_sale uuid;v_legacy text;v_item jsonb;v_lot uuid;v_qty numeric;v_price numeric;v_balance numeric;v_initial numeric;v_total_cost numeric;v_unit_cost numeric;v_lot_legacy text;v_material text;v_unit text;
begin
  perform public.require_admin_();
  if btrim(coalesce(p_payload->>'customer_name',''))='' then raise exception '販売先を入力してください';end if;
  if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')=0 then raise exception '販売商品を選択してください';end if;
  v_legacy:='SALE-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,4));
  insert into public.sales_records(legacy_id,sale_date,customer_name,sales_channel,invoice_no,shipping_destination,note,created_by)
  values(v_legacy,coalesce(nullif(p_payload->>'sale_date','')::date,current_date),btrim(p_payload->>'customer_name'),nullif(btrim(p_payload->>'sales_channel'),''),nullif(btrim(p_payload->>'invoice_no'),''),nullif(btrim(p_payload->>'shipping_destination'),''),nullif(btrim(p_payload->>'note'),''),auth.uid()) returning id into v_sale;
  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    v_lot:=(v_item->>'lot_id')::uuid;v_qty:=coalesce(nullif(v_item->>'quantity','')::numeric,0);v_price:=coalesce(nullif(v_item->>'unit_price_yen','')::numeric,0);
    if v_qty<=0 then raise exception '販売数量は0より大きくしてください';end if;
    if v_price<0 then raise exception '販売単価は0以上にしてください';end if;
    select legacy_id,material_name,unit,initial_qty,total_cost_yen into v_lot_legacy,v_material,v_unit,v_initial,v_total_cost from public.production_lots where id=v_lot and deleted_at is null for update;
    if not found then raise exception '販売ロットが見つかりません';end if;
    select coalesce(balance,0) into v_balance from public.production_inventory_balances where lot_id=v_lot;
    if v_qty>v_balance+0.0005 then raise exception '% の在庫を超えて販売できません',v_lot_legacy;end if;
    v_unit_cost:=case when v_initial>0 then v_total_cost/v_initial else 0 end;
    insert into public.sales_record_items(sales_record_id,lot_id,lot_legacy_id_snapshot,material_name_snapshot,quantity,unit_snapshot,unit_price_yen,sales_amount_yen,unit_cost_snapshot_yen,cost_amount_yen,gross_profit_yen)
    values(v_sale,v_lot,v_lot_legacy,v_material,round(v_qty,3),v_unit,round(v_price,2),round(v_qty*v_price,2),round(v_unit_cost,4),round(v_qty*v_unit_cost,2),round(v_qty*(v_price-v_unit_cost),2));
    insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by)
    values(v_lot,'SALE',-round(v_qty,3),'SALE',v_sale,'販売：'||btrim(p_payload->>'customer_name'),auth.uid());
  end loop;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data) values(auth.uid(),'CREATE','sale',v_sale::text,(select to_jsonb(x) from public.sales_record_summary x where x.id=v_sale));
  return v_sale;
end $$;
revoke all on function public.admin_register_sale(jsonb) from public,anon;grant execute on function public.admin_register_sale(jsonb) to authenticated;

create or replace function public.admin_cancel_sale(p_sale_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare v_status text;v_item record;v_before jsonb;
begin
  perform public.require_admin_();
  if btrim(coalesce(p_reason,''))='' then raise exception '取消理由を入力してください';end if;
  select status,to_jsonb(s) into v_status,v_before from public.sales_records s where id=p_sale_id for update;
  if not found then raise exception '販売伝票が見つかりません';end if;
  if v_status<>'ACTIVE' then raise exception 'この販売伝票はすでに取消済みです';end if;
  for v_item in select * from public.sales_record_items where sales_record_id=p_sale_id loop
    perform 1 from public.production_lots where id=v_item.lot_id for update;
    insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by)
    values(v_item.lot_id,'SALE_RETURN',v_item.quantity,'SALE',p_sale_id,'販売取消：'||btrim(p_reason),auth.uid());
  end loop;
  update public.sales_records set status='CANCELLED',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=btrim(p_reason),updated_at=now() where id=p_sale_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'DELETE','sale',p_sale_id::text,v_before,(select to_jsonb(x) from public.sales_records x where x.id=p_sale_id));
end $$;
revoke all on function public.admin_cancel_sale(uuid,text) from public,anon;grant execute on function public.admin_cancel_sale(uuid,text) to authenticated;
