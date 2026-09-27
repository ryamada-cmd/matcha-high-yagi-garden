-- Add persistent JA/EN language support to sales documents and English issuer settings.
-- Applied to production on 2026-09-27.

alter table public.sales_documents
  add column if not exists document_language text not null default 'JA';

alter table public.sales_documents
  drop constraint if exists sales_documents_document_language_check;

alter table public.sales_documents
  add constraint sales_documents_document_language_check
  check (document_language in ('JA','EN'));

alter table public.document_company_settings
  add column if not exists company_name_en text,
  add column if not exists address1_en text,
  add column if not exists address2_en text,
  add column if not exists bank_name_en text,
  add column if not exists bank_branch_en text,
  add column if not exists bank_account_type_en text,
  add column if not exists bank_account_name_en text,
  add column if not exists note_en text;

CREATE OR REPLACE FUNCTION public.save_sales_document(p_document_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_type text:=upper(coalesce(p_payload->>'document_type','INVOICE')); v_no text:=btrim(coalesce(p_payload->>'document_no','')); v_customer_name text:=btrim(coalesce(p_payload->>'customer_name','')); v_before jsonb; v_item jsonb; v_line integer:=0; v_subtotal numeric(16,2):=0; v_tax numeric(16,2):=0; v_amount numeric(16,2); v_rate numeric(5,4); v_status text:=upper(coalesce(p_payload->>'status','DRAFT')); v_language text:=upper(coalesce(nullif(p_payload->>'document_language',''),'JA'));
begin
 perform public.require_app_permission_('documents.manage'); if v_type not in('ESTIMATE','INVOICE','DELIVERY_NOTE') then raise exception '帳票種別が不正です'; end if; if v_status not in('DRAFT','ISSUED') then v_status:='DRAFT'; end if; if v_language not in('JA','EN') then raise exception '帳票言語が不正です'; end if; if v_no='' then raise exception '帳票番号を入力してください'; end if; if v_customer_name='' then raise exception '取引先名を入力してください'; end if; if jsonb_typeof(coalesce(p_payload->'items','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'items','[]'::jsonb))=0 then raise exception '明細を1件以上入力してください'; end if;
 for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop if btrim(coalesce(v_item->>'item_name',''))='' then raise exception '明細の商品名を入力してください'; end if; v_amount:=round(greatest(coalesce(nullif(v_item->>'unit_price_yen','')::numeric,0),0)*greatest(coalesce(nullif(v_item->>'quantity','')::numeric,0),0),2); v_rate:=greatest(coalesce(nullif(v_item->>'tax_rate','')::numeric,0.08),0); v_subtotal:=v_subtotal+v_amount; v_tax:=v_tax+floor(v_amount*v_rate); end loop;
 if p_document_id is null then
  insert into public.sales_documents(document_type,document_language,document_no,status,issue_date,due_date,delivery_date,customer_id,customer_name,customer_postal_code,customer_address1,customer_address2,customer_department,customer_contact_name,customer_honorific,seller_company_name,seller_registration_no,seller_postal_code,seller_address1,seller_address2,seller_phone,bank_name,bank_branch,bank_account_type,bank_account_no,bank_account_name,note,subtotal_yen,tax_yen,total_yen,created_by,updated_by)
  values(v_type,v_language,v_no,v_status,coalesce(nullif(p_payload->>'issue_date','')::date,current_date),nullif(p_payload->>'due_date','')::date,nullif(p_payload->>'delivery_date','')::date,nullif(p_payload->>'customer_id','')::uuid,v_customer_name,nullif(btrim(p_payload->>'customer_postal_code'),''),nullif(btrim(p_payload->>'customer_address1'),''),nullif(btrim(p_payload->>'customer_address2'),''),nullif(btrim(p_payload->>'customer_department'),''),nullif(btrim(p_payload->>'customer_contact_name'),''),coalesce(nullif(btrim(p_payload->>'customer_honorific'),''),'御中'),coalesce(nullif(btrim(p_payload->>'seller_company_name'),''),'合同会社リバーサイド'),nullif(btrim(p_payload->>'seller_registration_no'),''),nullif(btrim(p_payload->>'seller_postal_code'),''),nullif(btrim(p_payload->>'seller_address1'),''),nullif(btrim(p_payload->>'seller_address2'),''),nullif(btrim(p_payload->>'seller_phone'),''),nullif(btrim(p_payload->>'bank_name'),''),nullif(btrim(p_payload->>'bank_branch'),''),nullif(btrim(p_payload->>'bank_account_type'),''),nullif(btrim(p_payload->>'bank_account_no'),''),nullif(btrim(p_payload->>'bank_account_name'),''),nullif(p_payload->>'note',''),v_subtotal,v_tax,v_subtotal+v_tax,auth.uid(),auth.uid()) returning id into v_id;
 else
  select to_jsonb(x) into v_before from public.sales_documents x where x.id=p_document_id and x.deleted_at is null for update; if v_before is null then raise exception '帳票が見つかりません'; end if;
  update public.sales_documents set document_type=v_type,document_language=v_language,document_no=v_no,status=v_status,issue_date=coalesce(nullif(p_payload->>'issue_date','')::date,current_date),due_date=nullif(p_payload->>'due_date','')::date,delivery_date=nullif(p_payload->>'delivery_date','')::date,customer_id=nullif(p_payload->>'customer_id','')::uuid,customer_name=v_customer_name,customer_postal_code=nullif(btrim(p_payload->>'customer_postal_code'),''),customer_address1=nullif(btrim(p_payload->>'customer_address1'),''),customer_address2=nullif(btrim(p_payload->>'customer_address2'),''),customer_department=nullif(btrim(p_payload->>'customer_department'),''),customer_contact_name=nullif(btrim(p_payload->>'customer_contact_name'),''),customer_honorific=coalesce(nullif(btrim(p_payload->>'customer_honorific'),''),'御中'),seller_company_name=coalesce(nullif(btrim(p_payload->>'seller_company_name'),''),'合同会社リバーサイド'),seller_registration_no=nullif(btrim(p_payload->>'seller_registration_no'),''),seller_postal_code=nullif(btrim(p_payload->>'seller_postal_code'),''),seller_address1=nullif(btrim(p_payload->>'seller_address1'),''),seller_address2=nullif(btrim(p_payload->>'seller_address2'),''),seller_phone=nullif(btrim(p_payload->>'seller_phone'),''),bank_name=nullif(btrim(p_payload->>'bank_name'),''),bank_branch=nullif(btrim(p_payload->>'bank_branch'),''),bank_account_type=nullif(btrim(p_payload->>'bank_account_type'),''),bank_account_no=nullif(btrim(p_payload->>'bank_account_no'),''),bank_account_name=nullif(btrim(p_payload->>'bank_account_name'),''),note=nullif(p_payload->>'note',''),subtotal_yen=v_subtotal,tax_yen=v_tax,total_yen=v_subtotal+v_tax,updated_by=auth.uid(),updated_at=now() where id=p_document_id; delete from public.sales_document_items where document_id=p_document_id; v_id:=p_document_id;
 end if;
 for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop v_line:=v_line+1; v_amount:=round(greatest(coalesce(nullif(v_item->>'unit_price_yen','')::numeric,0),0)*greatest(coalesce(nullif(v_item->>'quantity','')::numeric,0),0),2); insert into public.sales_document_items(document_id,line_no,product_id,item_name,unit_price_yen,quantity,unit,tax_rate,amount_yen,delivery_date) values(v_id,v_line,nullif(v_item->>'product_id','')::uuid,btrim(v_item->>'item_name'),greatest(coalesce(nullif(v_item->>'unit_price_yen','')::numeric,0),0),greatest(coalesce(nullif(v_item->>'quantity','')::numeric,0),0),coalesce(nullif(btrim(v_item->>'unit'),''),'個'),greatest(coalesce(nullif(v_item->>'tax_rate','')::numeric,0.08),0),v_amount,nullif(v_item->>'delivery_date','')::date); end loop;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),case when p_document_id is null then 'CREATE' else 'UPDATE' end,'sales_document',v_id::text,v_before,(select jsonb_build_object('document',to_jsonb(d),'items',(select jsonb_agg(to_jsonb(i) order by i.line_no) from public.sales_document_items i where i.document_id=v_id)) from public.sales_documents d where d.id=v_id)); return v_id;
exception when unique_violation then raise exception '同じ帳票種別・番号がすでに存在します'; end $function$;

CREATE OR REPLACE FUNCTION public.update_document_company_settings(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_before jsonb; v_after jsonb;
begin perform public.require_app_permission_('documents.manage'); select to_jsonb(x) into v_before from public.document_company_settings x where x.id=1 for update;
 update public.document_company_settings set company_name=coalesce(nullif(btrim(p_payload->>'company_name'),''),company_name),company_name_en=nullif(btrim(p_payload->>'company_name_en'),''),registration_no=nullif(btrim(p_payload->>'registration_no'),''),postal_code=nullif(btrim(p_payload->>'postal_code'),''),address1=nullif(btrim(p_payload->>'address1'),''),address2=nullif(btrim(p_payload->>'address2'),''),address1_en=nullif(btrim(p_payload->>'address1_en'),''),address2_en=nullif(btrim(p_payload->>'address2_en'),''),phone=nullif(btrim(p_payload->>'phone'),''),bank_name=nullif(btrim(p_payload->>'bank_name'),''),bank_branch=nullif(btrim(p_payload->>'bank_branch'),''),bank_account_type=nullif(btrim(p_payload->>'bank_account_type'),''),bank_account_no=nullif(btrim(p_payload->>'bank_account_no'),''),bank_account_name=nullif(btrim(p_payload->>'bank_account_name'),''),bank_name_en=nullif(btrim(p_payload->>'bank_name_en'),''),bank_branch_en=nullif(btrim(p_payload->>'bank_branch_en'),''),bank_account_type_en=nullif(btrim(p_payload->>'bank_account_type_en'),''),bank_account_name_en=nullif(btrim(p_payload->>'bank_account_name_en'),''),note=nullif(btrim(p_payload->>'note'),''),note_en=nullif(btrim(p_payload->>'note_en'),''),updated_by=auth.uid(),updated_at=now() where id=1;
 select to_jsonb(x) into v_after from public.document_company_settings x where x.id=1; insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'UPDATE','document_company_settings','1',v_before,v_after); return v_after; end $function$;
