-- Add header-level discounts to vendor invoices.
-- The payable total is the line-item subtotal minus discount_amount_yen.

alter table public.vendor_invoices
  add column if not exists discount_amount_yen numeric(16,2) not null default 0;

alter table public.vendor_invoices
  drop constraint if exists vendor_invoices_discount_amount_yen_check;

alter table public.vendor_invoices
  add constraint vendor_invoices_discount_amount_yen_check
  check (discount_amount_yen >= 0);

create or replace function public.admin_save_vendor_invoice(p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_user uuid;v_id uuid;v_vendor text;v_invoice_date date;v_item jsonb;v_desc text;v_category text;
  v_qty numeric;v_unit_price numeric;v_tax numeric;v_line numeric;v_subtotal numeric:=0;v_discount numeric:=0;v_total numeric:=0;v_line_no int:=0;
  v_before jsonb;v_after jsonb;v_existing_paid numeric;v_no text;
begin
  v_user:=public.require_app_permission_('vendor_invoices.manage');
  v_id:=nullif(p_payload->>'id','')::uuid;
  v_vendor:=btrim(coalesce(p_payload->>'vendor',''));
  v_invoice_date:=nullif(p_payload->>'invoice_date','')::date;
  v_discount:=round(coalesce(nullif(p_payload->>'discount_amount_yen','')::numeric,0),0);
  if v_vendor='' then raise exception '請求元を入力してください'; end if;
  if v_invoice_date is null then raise exception '請求日を入力してください'; end if;
  if v_discount<0 then raise exception '値引き額は0円以上で入力してください'; end if;
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
    v_subtotal:=v_subtotal+v_line;
    insert into public.vendor_invoice_items(invoice_id,line_no,category,description,quantity,unit,unit_price_yen,tax_rate,line_total_yen,note)
    values(v_id,v_line_no,coalesce(nullif(v_category,''),'OTHER'),v_desc,round(v_qty,3),nullif(btrim(v_item->>'unit'),''),round(v_unit_price,2),round(v_tax,2),v_line,nullif(btrim(v_item->>'note'),''));
  end loop;

  if v_discount>v_subtotal then raise exception '値引き額は明細合計を超えて入力できません'; end if;
  v_total:=v_subtotal-v_discount;
  if v_existing_paid is not null and v_total<v_existing_paid then raise exception '値引き後の請求額を支払済額より少なく変更できません'; end if;

  update public.vendor_invoices
  set discount_amount_yen=v_discount,total_amount_yen=v_total,updated_by=v_user,updated_at=now()
  where id=v_id;

  perform public.recalculate_vendor_invoice_payment_(v_id);
  select jsonb_build_object('invoice',to_jsonb(v),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no),'[]'::jsonb) from public.vendor_invoice_items i where i.invoice_id=v.id),'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by p.payment_date,p.created_at),'[]'::jsonb) from public.vendor_invoice_payments p where p.invoice_id=v.id and p.deleted_at is null)) into v_after from public.vendor_invoices v where v.id=v_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(v_user,case when v_before is null then 'CREATE' else 'UPDATE' end,'vendor_invoice',v_id::text,v_before,v_after);
  return v_id;
end $$;

revoke all on function public.admin_save_vendor_invoice(jsonb) from public,anon;
grant execute on function public.admin_save_vendor_invoice(jsonb) to authenticated;
