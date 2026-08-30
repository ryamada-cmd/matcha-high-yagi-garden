-- External vendor invoices with multi-line items, scheduled payments and payment history.

create table if not exists public.vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  external_invoice_no text,
  vendor text not null,
  invoice_date date not null,
  payment_due_date date,
  scheduled_payment_date date,
  planned_payment_method text,
  planned_payment_account text,
  total_amount_yen numeric(16,2) not null default 0 check(total_amount_yen >= 0),
  paid_amount_yen numeric(16,2) not null default 0 check(paid_amount_yen >= 0),
  payment_status text not null default 'UNPAID' check(payment_status in ('UNPAID','PARTIAL','PAID','HOLD')),
  is_on_hold boolean not null default false,
  note text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  delete_reason text
);

create table if not exists public.vendor_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.vendor_invoices(id) on delete cascade,
  line_no integer not null check(line_no > 0),
  category text not null default 'OTHER',
  description text not null,
  quantity numeric(14,3) not null default 1 check(quantity > 0),
  unit text,
  unit_price_yen numeric(16,2) not null check(unit_price_yen >= 0),
  tax_rate numeric(5,2) not null default 10 check(tax_rate >= 0 and tax_rate <= 100),
  line_total_yen numeric(16,2) not null check(line_total_yen >= 0),
  note text,
  created_at timestamptz not null default now(),
  unique(invoice_id,line_no)
);

create table if not exists public.vendor_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text not null unique,
  invoice_id uuid not null references public.vendor_invoices(id),
  payment_date date not null,
  amount_yen numeric(16,2) not null check(amount_yen > 0),
  payment_method text,
  payment_account text,
  reference_no text,
  note text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  delete_reason text
);

create index if not exists idx_vendor_invoices_date on public.vendor_invoices(invoice_date desc) where deleted_at is null;
create index if not exists idx_vendor_invoices_due on public.vendor_invoices(payment_status,payment_due_date) where deleted_at is null;
create index if not exists idx_vendor_invoices_vendor on public.vendor_invoices(vendor) where deleted_at is null;
create index if not exists idx_vendor_invoice_items_invoice on public.vendor_invoice_items(invoice_id,line_no);
create index if not exists idx_vendor_invoice_payments_invoice on public.vendor_invoice_payments(invoice_id,payment_date desc) where deleted_at is null;

alter table public.vendor_invoices enable row level security;
alter table public.vendor_invoice_items enable row level security;
alter table public.vendor_invoice_payments enable row level security;

drop policy if exists vendor_invoices_admin_read on public.vendor_invoices;
create policy vendor_invoices_admin_read on public.vendor_invoices for select to authenticated using(
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);
drop policy if exists vendor_invoice_items_admin_read on public.vendor_invoice_items;
create policy vendor_invoice_items_admin_read on public.vendor_invoice_items for select to authenticated using(
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);
drop policy if exists vendor_invoice_payments_admin_read on public.vendor_invoice_payments;
create policy vendor_invoice_payments_admin_read on public.vendor_invoice_payments for select to authenticated using(
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);

revoke all on public.vendor_invoices,public.vendor_invoice_items,public.vendor_invoice_payments from anon;
revoke insert,update,delete on public.vendor_invoices,public.vendor_invoice_items,public.vendor_invoice_payments from authenticated;
grant select on public.vendor_invoices,public.vendor_invoice_items,public.vendor_invoice_payments to authenticated;

create or replace function public.recalculate_vendor_invoice_payment_(p_invoice_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_total numeric;v_paid numeric;v_hold boolean;v_status text;
begin
  select total_amount_yen,is_on_hold into v_total,v_hold from public.vendor_invoices where id=p_invoice_id and deleted_at is null for update;
  if not found then raise exception '請求書が見つかりません'; end if;
  select coalesce(sum(amount_yen),0) into v_paid from public.vendor_invoice_payments where invoice_id=p_invoice_id and deleted_at is null;
  if v_paid>v_total then raise exception '支払合計が請求額を超えています'; end if;
  v_status:=case when v_hold then 'HOLD' when v_paid<=0 then 'UNPAID' when v_paid<v_total then 'PARTIAL' else 'PAID' end;
  update public.vendor_invoices set paid_amount_yen=v_paid,payment_status=v_status,updated_at=now() where id=p_invoice_id;
end $$;
revoke all on function public.recalculate_vendor_invoice_payment_(uuid) from public,anon,authenticated;

create or replace function public.admin_save_vendor_invoice(p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_user uuid;v_id uuid;v_vendor text;v_invoice_date date;v_item jsonb;v_desc text;v_category text;
  v_qty numeric;v_unit_price numeric;v_tax numeric;v_line numeric;v_total numeric:=0;v_line_no int:=0;
  v_before jsonb;v_after jsonb;v_existing_paid numeric;v_no text;
begin
  v_user:=public.require_admin_();
  v_id:=nullif(p_payload->>'id','')::uuid;
  v_vendor:=btrim(coalesce(p_payload->>'vendor',''));
  v_invoice_date:=nullif(p_payload->>'invoice_date','')::date;
  if v_vendor='' then raise exception '請求元を入力してください'; end if;
  if v_invoice_date is null then raise exception '請求日を入力してください'; end if;
  if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')=0 then raise exception '請求明細を1件以上入力してください'; end if;

  if v_id is null then
    v_no:='BILL-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(md5(random()::text),1,4));
    insert into public.vendor_invoices(invoice_no,external_invoice_no,vendor,invoice_date,payment_due_date,scheduled_payment_date,planned_payment_method,planned_payment_account,is_on_hold,note,created_by,updated_by)
    values(v_no,nullif(btrim(p_payload->>'external_invoice_no'),''),v_vendor,v_invoice_date,nullif(p_payload->>'payment_due_date','')::date,nullif(p_payload->>'scheduled_payment_date','')::date,nullif(btrim(p_payload->>'planned_payment_method'),''),nullif(btrim(p_payload->>'planned_payment_account'),''),coalesce((p_payload->>'is_on_hold')::boolean,false),nullif(btrim(p_payload->>'note'),''),v_user,v_user)
    returning id into v_id;
  else
    select jsonb_build_object('invoice',to_jsonb(v),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no),'[]'::jsonb) from public.vendor_invoice_items i where i.invoice_id=v.id),'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by p.payment_date,p.created_at),'[]'::jsonb) from public.vendor_invoice_payments p where p.invoice_id=v.id and p.deleted_at is null)),paid_amount_yen
      into v_before,v_existing_paid from public.vendor_invoices v where v.id=v_id and v.deleted_at is null for update;
    if v_before is null then raise exception '請求書が見つかりません'; end if;
    delete from public.vendor_invoice_items where invoice_id=v_id;
    update public.vendor_invoices set external_invoice_no=nullif(btrim(p_payload->>'external_invoice_no'),''),vendor=v_vendor,invoice_date=v_invoice_date,payment_due_date=nullif(p_payload->>'payment_due_date','')::date,scheduled_payment_date=nullif(p_payload->>'scheduled_payment_date','')::date,planned_payment_method=nullif(btrim(p_payload->>'planned_payment_method'),''),planned_payment_account=nullif(btrim(p_payload->>'planned_payment_account'),''),is_on_hold=coalesce((p_payload->>'is_on_hold')::boolean,false),note=nullif(btrim(p_payload->>'note'),''),updated_by=v_user,updated_at=now() where id=v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_line_no:=v_line_no+1;
    v_category:=upper(btrim(coalesce(v_item->>'category','OTHER')));
    v_desc:=btrim(coalesce(v_item->>'description',''));
    v_qty:=coalesce(nullif(v_item->>'quantity','')::numeric,0);
    v_unit_price:=coalesce(nullif(v_item->>'unit_price_yen','')::numeric,-1);
    v_tax:=coalesce(nullif(v_item->>'tax_rate','')::numeric,10);
    if v_desc='' then raise exception '請求内容を入力してください'; end if;
    if v_qty<=0 then raise exception '数量は0より大きくしてください'; end if;
    if v_unit_price<0 then raise exception '単価は0以上で入力してください'; end if;
    if v_tax<0 or v_tax>100 then raise exception '税率を確認してください'; end if;
    v_line:=round(v_qty*v_unit_price,0);
    v_total:=v_total+v_line;
    insert into public.vendor_invoice_items(invoice_id,line_no,category,description,quantity,unit,unit_price_yen,tax_rate,line_total_yen,note)
    values(v_id,v_line_no,coalesce(nullif(v_category,''),'OTHER'),v_desc,round(v_qty,3),nullif(btrim(v_item->>'unit'),''),round(v_unit_price,2),round(v_tax,2),v_line,nullif(btrim(v_item->>'note'),''));
  end loop;
  if v_existing_paid is not null and v_total<v_existing_paid then raise exception '請求額を支払済額より少なく変更できません'; end if;
  update public.vendor_invoices set total_amount_yen=v_total,updated_by=v_user,updated_at=now() where id=v_id;
  perform public.recalculate_vendor_invoice_payment_(v_id);
  select jsonb_build_object('invoice',to_jsonb(v),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no),'[]'::jsonb) from public.vendor_invoice_items i where i.invoice_id=v.id),'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by p.payment_date,p.created_at),'[]'::jsonb) from public.vendor_invoice_payments p where p.invoice_id=v.id and p.deleted_at is null)) into v_after from public.vendor_invoices v where v.id=v_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(v_user,case when v_before is null then 'CREATE' else 'UPDATE' end,'vendor_invoice',v_id::text,v_before,v_after);
  return v_id;
end $$;
revoke all on function public.admin_save_vendor_invoice(jsonb) from public,anon;
grant execute on function public.admin_save_vendor_invoice(jsonb) to authenticated;

create or replace function public.admin_save_vendor_invoice_payment(p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_id uuid;v_invoice uuid;v_payment_date date;v_amount numeric;v_before jsonb;v_after jsonb;v_no text;v_other_paid numeric;v_total numeric;
begin
  v_user:=public.require_admin_();
  v_id:=nullif(p_payload->>'id','')::uuid;
  v_invoice:=nullif(p_payload->>'invoice_id','')::uuid;
  v_payment_date:=nullif(p_payload->>'payment_date','')::date;
  v_amount:=coalesce(nullif(p_payload->>'amount_yen','')::numeric,0);
  if v_invoice is null then raise exception '請求書を指定してください'; end if;
  if v_payment_date is null then raise exception '支払日を入力してください'; end if;
  if v_amount<=0 then raise exception '支払金額は0円より大きくしてください'; end if;
  select total_amount_yen into v_total from public.vendor_invoices where id=v_invoice and deleted_at is null for update;
  if not found then raise exception '請求書が見つかりません'; end if;
  if v_id is not null then
    select to_jsonb(p) into v_before from public.vendor_invoice_payments p where p.id=v_id and p.invoice_id=v_invoice and p.deleted_at is null for update;
    if v_before is null then raise exception '支払記録が見つかりません'; end if;
  end if;
  select coalesce(sum(amount_yen),0) into v_other_paid from public.vendor_invoice_payments where invoice_id=v_invoice and deleted_at is null and (v_id is null or id<>v_id);
  if v_other_paid+v_amount>v_total then raise exception '支払合計が請求額を超えています'; end if;
  if v_id is null then
    v_no:='PAY-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(md5(random()::text),1,4));
    insert into public.vendor_invoice_payments(payment_no,invoice_id,payment_date,amount_yen,payment_method,payment_account,reference_no,note,created_by,updated_by)
    values(v_no,v_invoice,v_payment_date,round(v_amount,2),nullif(btrim(p_payload->>'payment_method'),''),nullif(btrim(p_payload->>'payment_account'),''),nullif(btrim(p_payload->>'reference_no'),''),nullif(btrim(p_payload->>'note'),''),v_user,v_user) returning id into v_id;
  else
    update public.vendor_invoice_payments set payment_date=v_payment_date,amount_yen=round(v_amount,2),payment_method=nullif(btrim(p_payload->>'payment_method'),''),payment_account=nullif(btrim(p_payload->>'payment_account'),''),reference_no=nullif(btrim(p_payload->>'reference_no'),''),note=nullif(btrim(p_payload->>'note'),''),updated_by=v_user,updated_at=now() where id=v_id;
  end if;
  perform public.recalculate_vendor_invoice_payment_(v_invoice);
  select to_jsonb(p) into v_after from public.vendor_invoice_payments p where p.id=v_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(v_user,case when v_before is null then 'CREATE' else 'UPDATE' end,'vendor_invoice_payment',v_id::text,v_before,v_after);
  return v_id;
end $$;
revoke all on function public.admin_save_vendor_invoice_payment(jsonb) from public,anon;
grant execute on function public.admin_save_vendor_invoice_payment(jsonb) to authenticated;

create or replace function public.admin_delete_vendor_invoice_payment(p_id uuid,p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_before jsonb;v_invoice uuid;
begin
  v_user:=public.require_admin_();
  if btrim(coalesce(p_reason,''))='' then raise exception '削除理由を入力してください'; end if;
  select to_jsonb(p),invoice_id into v_before,v_invoice from public.vendor_invoice_payments p where p.id=p_id and p.deleted_at is null for update;
  if v_before is null then raise exception '支払記録が見つかりません'; end if;
  update public.vendor_invoice_payments set deleted_at=now(),deleted_by=v_user,delete_reason=btrim(p_reason),updated_by=v_user,updated_at=now() where id=p_id;
  perform public.recalculate_vendor_invoice_payment_(v_invoice);
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(v_user,'DELETE','vendor_invoice_payment',p_id::text,v_before,jsonb_build_object('deleted_at',now(),'reason',btrim(p_reason)));
end $$;
revoke all on function public.admin_delete_vendor_invoice_payment(uuid,text) from public,anon;
grant execute on function public.admin_delete_vendor_invoice_payment(uuid,text) to authenticated;

create or replace function public.admin_delete_vendor_invoice(p_id uuid,p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_before jsonb;
begin
  v_user:=public.require_admin_();
  if btrim(coalesce(p_reason,''))='' then raise exception '削除理由を入力してください'; end if;
  select jsonb_build_object('invoice',to_jsonb(v),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no),'[]'::jsonb) from public.vendor_invoice_items i where i.invoice_id=v.id)) into v_before from public.vendor_invoices v where v.id=p_id and v.deleted_at is null for update;
  if v_before is null then raise exception '請求書が見つかりません'; end if;
  if exists(select 1 from public.vendor_invoice_payments p where p.invoice_id=p_id and p.deleted_at is null) then raise exception '支払履歴がある請求書は削除できません。先に支払履歴を削除してください'; end if;
  update public.vendor_invoices set deleted_at=now(),deleted_by=v_user,delete_reason=btrim(p_reason),updated_by=v_user,updated_at=now() where id=p_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(v_user,'DELETE','vendor_invoice',p_id::text,v_before,jsonb_build_object('deleted_at',now(),'reason',btrim(p_reason)));
end $$;
revoke all on function public.admin_delete_vendor_invoice(uuid,text) from public,anon;
grant execute on function public.admin_delete_vendor_invoice(uuid,text) to authenticated;
