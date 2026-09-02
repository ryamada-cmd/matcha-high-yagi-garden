-- 0041_sales_documents_and_price_list.sql
-- Sales document creation (invoice / delivery note), customer master, and channel-specific product prices.

alter table public.product_master
  add column if not exists wholesale_price_yen numeric(14,2) not null default 0,
  add column if not exists retail_price_yen numeric(14,2) not null default 0,
  add column if not exists other_price_yen numeric(14,2) not null default 0;

update public.product_master
set retail_price_yen = standard_price_yen
where retail_price_yen = 0 and coalesce(standard_price_yen,0) > 0;

insert into public.app_permission_definitions(permission_key,feature_key,feature_label,item_label,description,sort_order,locked,worker_default)
values
  ('documents.view','documents','請求書・納品書','閲覧','請求書・納品書・取引先を閲覧します。',145,false,false),
  ('documents.manage','documents','請求書・納品書','作成・編集・削除','請求書・納品書・取引先を作成、編集、削除します。',146,false,false)
on conflict (permission_key) do update set
  feature_key=excluded.feature_key,
  feature_label=excluded.feature_label,
  item_label=excluded.item_label,
  description=excluded.description,
  sort_order=excluded.sort_order,
  locked=excluded.locked,
  worker_default=excluded.worker_default;

insert into public.role_permissions(app_role,permission_key,allowed)
values
  ('admin','documents.view',true),
  ('admin','documents.manage',true),
  ('worker','documents.view',false),
  ('worker','documents.manage',false)
on conflict (app_role,permission_key) do nothing;

create table if not exists public.document_customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text,
  name text not null,
  postal_code text,
  address1 text,
  address2 text,
  department text,
  contact_name text,
  honorific text not null default '御中',
  email text,
  phone text,
  note text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_document_customers_name on public.document_customers(name) where deleted_at is null;

create table if not exists public.document_company_settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null,
  registration_no text,
  postal_code text,
  address1 text,
  address2 text,
  phone text,
  bank_name text,
  bank_branch text,
  bank_account_type text,
  bank_account_no text,
  bank_account_name text,
  note text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.document_company_settings(
  id,company_name,registration_no,postal_code,address1,address2,phone,
  bank_name,bank_branch,bank_account_type,bank_account_no,bank_account_name
) values (
  1,'合同会社リバーサイド','T7130003007972','600-8823',
  '京都府京都市下京区薬園町167','PISO丹波口103号','080-9127-4783',
  '京都やましろ農業協同組合','井手町支店','普通','0032902','ド）リバーサイド'
) on conflict (id) do nothing;

create table if not exists public.sales_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('INVOICE','DELIVERY_NOTE')),
  document_no text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','ISSUED','CANCELLED')),
  issue_date date not null default current_date,
  due_date date,
  delivery_date date,
  customer_id uuid references public.document_customers(id),
  customer_name text not null,
  customer_postal_code text,
  customer_address1 text,
  customer_address2 text,
  customer_department text,
  customer_contact_name text,
  customer_honorific text not null default '御中',
  seller_company_name text not null,
  seller_registration_no text,
  seller_postal_code text,
  seller_address1 text,
  seller_address2 text,
  seller_phone text,
  bank_name text,
  bank_branch text,
  bank_account_type text,
  bank_account_no text,
  bank_account_name text,
  note text,
  subtotal_yen numeric(16,2) not null default 0,
  tax_yen numeric(16,2) not null default 0,
  total_yen numeric(16,2) not null default 0,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(document_type,document_no)
);
create index if not exists idx_sales_documents_issue_date on public.sales_documents(issue_date desc) where deleted_at is null;
create index if not exists idx_sales_documents_customer on public.sales_documents(customer_id) where deleted_at is null;

create table if not exists public.sales_document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sales_documents(id) on delete cascade,
  line_no integer not null,
  product_id uuid references public.product_master(id),
  item_name text not null,
  unit_price_yen numeric(14,2) not null default 0,
  quantity numeric(14,3) not null default 1,
  unit text not null default '個',
  tax_rate numeric(5,4) not null default 0.08,
  amount_yen numeric(16,2) not null default 0,
  delivery_date date,
  unique(document_id,line_no)
);
create index if not exists idx_sales_document_items_document on public.sales_document_items(document_id);
create index if not exists idx_sales_document_items_product on public.sales_document_items(product_id);

alter table public.document_customers enable row level security;
alter table public.document_company_settings enable row level security;
alter table public.sales_documents enable row level security;
alter table public.sales_document_items enable row level security;

drop policy if exists document_customers_select_permission on public.document_customers;
create policy document_customers_select_permission on public.document_customers
for select to authenticated using (public.has_app_permission('documents.view'));

drop policy if exists document_company_settings_select_permission on public.document_company_settings;
create policy document_company_settings_select_permission on public.document_company_settings
for select to authenticated using (public.has_app_permission('documents.view'));

drop policy if exists sales_documents_select_permission on public.sales_documents;
create policy sales_documents_select_permission on public.sales_documents
for select to authenticated using (public.has_app_permission('documents.view'));

drop policy if exists sales_document_items_select_permission on public.sales_document_items;
create policy sales_document_items_select_permission on public.sales_document_items
for select to authenticated using (public.has_app_permission('documents.view'));

revoke insert,update,delete on public.document_customers from authenticated;
revoke insert,update,delete on public.document_company_settings from authenticated;
revoke insert,update,delete on public.sales_documents from authenticated;
revoke insert,update,delete on public.sales_document_items from authenticated;
grant select on public.document_customers,public.document_company_settings,public.sales_documents,public.sales_document_items to authenticated;

create or replace function public.save_document_customer(p_customer_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_payload->>'name',''));
  v_before jsonb;
begin
  perform public.require_app_permission_('documents.manage');
  if v_name='' then raise exception '取引先名を入力してください'; end if;
  if p_customer_id is null then
    insert into public.document_customers(
      customer_code,name,postal_code,address1,address2,department,contact_name,honorific,email,phone,note,created_by,updated_by
    ) values (
      nullif(btrim(p_payload->>'customer_code'),''),v_name,nullif(btrim(p_payload->>'postal_code'),''),
      nullif(btrim(p_payload->>'address1'),''),nullif(btrim(p_payload->>'address2'),''),
      nullif(btrim(p_payload->>'department'),''),nullif(btrim(p_payload->>'contact_name'),''),
      coalesce(nullif(btrim(p_payload->>'honorific'),''),'御中'),nullif(btrim(p_payload->>'email'),''),
      nullif(btrim(p_payload->>'phone'),''),nullif(btrim(p_payload->>'note'),''),auth.uid(),auth.uid()
    ) returning id into v_id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)
    values(auth.uid(),'CREATE','document_customer',v_id::text,(select to_jsonb(x) from public.document_customers x where x.id=v_id));
  else
    select to_jsonb(x) into v_before from public.document_customers x where x.id=p_customer_id and x.deleted_at is null for update;
    if v_before is null then raise exception '取引先が見つかりません'; end if;
    update public.document_customers set
      customer_code=nullif(btrim(p_payload->>'customer_code'),''),name=v_name,
      postal_code=nullif(btrim(p_payload->>'postal_code'),''),address1=nullif(btrim(p_payload->>'address1'),''),
      address2=nullif(btrim(p_payload->>'address2'),''),department=nullif(btrim(p_payload->>'department'),''),
      contact_name=nullif(btrim(p_payload->>'contact_name'),''),honorific=coalesce(nullif(btrim(p_payload->>'honorific'),''),'御中'),
      email=nullif(btrim(p_payload->>'email'),''),phone=nullif(btrim(p_payload->>'phone'),''),note=nullif(btrim(p_payload->>'note'),''),
      updated_by=auth.uid(),updated_at=now()
    where id=p_customer_id;
    v_id:=p_customer_id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'UPDATE','document_customer',v_id::text,v_before,(select to_jsonb(x) from public.document_customers x where x.id=v_id));
  end if;
  return v_id;
end $$;

create or replace function public.delete_document_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_before jsonb;
begin
  perform public.require_app_permission_('documents.manage');
  select to_jsonb(x) into v_before from public.document_customers x where x.id=p_customer_id and x.deleted_at is null for update;
  if v_before is null then raise exception '取引先が見つかりません'; end if;
  update public.document_customers set deleted_at=now(),updated_at=now(),updated_by=auth.uid() where id=p_customer_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data)
  values(auth.uid(),'DELETE','document_customer',p_customer_id::text,v_before);
end $$;

create or replace function public.update_document_company_settings(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare v_before jsonb; v_after jsonb;
begin
  perform public.require_app_permission_('documents.manage');
  select to_jsonb(x) into v_before from public.document_company_settings x where x.id=1 for update;
  update public.document_company_settings set
    company_name=coalesce(nullif(btrim(p_payload->>'company_name'),''),company_name),
    registration_no=nullif(btrim(p_payload->>'registration_no'),''),postal_code=nullif(btrim(p_payload->>'postal_code'),''),
    address1=nullif(btrim(p_payload->>'address1'),''),address2=nullif(btrim(p_payload->>'address2'),''),phone=nullif(btrim(p_payload->>'phone'),''),
    bank_name=nullif(btrim(p_payload->>'bank_name'),''),bank_branch=nullif(btrim(p_payload->>'bank_branch'),''),
    bank_account_type=nullif(btrim(p_payload->>'bank_account_type'),''),bank_account_no=nullif(btrim(p_payload->>'bank_account_no'),''),
    bank_account_name=nullif(btrim(p_payload->>'bank_account_name'),''),note=nullif(btrim(p_payload->>'note'),''),updated_by=auth.uid(),updated_at=now()
  where id=1 returning to_jsonb(document_company_settings.*) into v_after;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'UPDATE','document_company_settings','1',v_before,v_after);
  return v_after;
end $$;

create or replace function public.save_sales_document(p_document_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_id uuid;
  v_type text := upper(coalesce(p_payload->>'document_type','INVOICE'));
  v_no text := btrim(coalesce(p_payload->>'document_no',''));
  v_customer_name text := btrim(coalesce(p_payload->>'customer_name',''));
  v_before jsonb;
  v_item jsonb;
  v_line integer := 0;
  v_subtotal numeric(16,2) := 0;
  v_tax numeric(16,2) := 0;
  v_amount numeric(16,2);
  v_rate numeric(5,4);
  v_status text := upper(coalesce(p_payload->>'status','DRAFT'));
begin
  perform public.require_app_permission_('documents.manage');
  if v_type not in ('INVOICE','DELIVERY_NOTE') then raise exception '帳票種別が不正です'; end if;
  if v_status not in ('DRAFT','ISSUED') then v_status:='DRAFT'; end if;
  if v_no='' then raise exception '帳票番号を入力してください'; end if;
  if v_customer_name='' then raise exception '取引先名を入力してください'; end if;
  if jsonb_typeof(coalesce(p_payload->'items','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_payload->'items','[]'::jsonb))=0 then
    raise exception '明細を1件以上入力してください';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    if btrim(coalesce(v_item->>'item_name',''))='' then raise exception '明細の商品名を入力してください'; end if;
    v_amount := round(greatest(coalesce(nullif(v_item->>'unit_price_yen','')::numeric,0),0) * greatest(coalesce(nullif(v_item->>'quantity','')::numeric,0),0),2);
    v_rate := greatest(coalesce(nullif(v_item->>'tax_rate','')::numeric,0.08),0);
    v_subtotal := v_subtotal + v_amount;
    v_tax := v_tax + floor(v_amount * v_rate);
  end loop;

  if p_document_id is null then
    insert into public.sales_documents(
      document_type,document_no,status,issue_date,due_date,delivery_date,customer_id,
      customer_name,customer_postal_code,customer_address1,customer_address2,customer_department,customer_contact_name,customer_honorific,
      seller_company_name,seller_registration_no,seller_postal_code,seller_address1,seller_address2,seller_phone,
      bank_name,bank_branch,bank_account_type,bank_account_no,bank_account_name,note,subtotal_yen,tax_yen,total_yen,created_by,updated_by
    ) values (
      v_type,v_no,v_status,coalesce(nullif(p_payload->>'issue_date','')::date,current_date),nullif(p_payload->>'due_date','')::date,nullif(p_payload->>'delivery_date','')::date,
      nullif(p_payload->>'customer_id','')::uuid,v_customer_name,nullif(btrim(p_payload->>'customer_postal_code'),''),nullif(btrim(p_payload->>'customer_address1'),''),
      nullif(btrim(p_payload->>'customer_address2'),''),nullif(btrim(p_payload->>'customer_department'),''),nullif(btrim(p_payload->>'customer_contact_name'),''),
      coalesce(nullif(btrim(p_payload->>'customer_honorific'),''),'御中'),
      coalesce(nullif(btrim(p_payload->>'seller_company_name'),''),'合同会社リバーサイド'),nullif(btrim(p_payload->>'seller_registration_no'),''),
      nullif(btrim(p_payload->>'seller_postal_code'),''),nullif(btrim(p_payload->>'seller_address1'),''),nullif(btrim(p_payload->>'seller_address2'),''),nullif(btrim(p_payload->>'seller_phone'),''),
      nullif(btrim(p_payload->>'bank_name'),''),nullif(btrim(p_payload->>'bank_branch'),''),nullif(btrim(p_payload->>'bank_account_type'),''),
      nullif(btrim(p_payload->>'bank_account_no'),''),nullif(btrim(p_payload->>'bank_account_name'),''),nullif(p_payload->>'note',''),v_subtotal,v_tax,v_subtotal+v_tax,auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    select to_jsonb(x) into v_before from public.sales_documents x where x.id=p_document_id and x.deleted_at is null for update;
    if v_before is null then raise exception '帳票が見つかりません'; end if;
    update public.sales_documents set
      document_type=v_type,document_no=v_no,status=v_status,issue_date=coalesce(nullif(p_payload->>'issue_date','')::date,current_date),
      due_date=nullif(p_payload->>'due_date','')::date,delivery_date=nullif(p_payload->>'delivery_date','')::date,customer_id=nullif(p_payload->>'customer_id','')::uuid,
      customer_name=v_customer_name,customer_postal_code=nullif(btrim(p_payload->>'customer_postal_code'),''),customer_address1=nullif(btrim(p_payload->>'customer_address1'),''),
      customer_address2=nullif(btrim(p_payload->>'customer_address2'),''),customer_department=nullif(btrim(p_payload->>'customer_department'),''),
      customer_contact_name=nullif(btrim(p_payload->>'customer_contact_name'),''),customer_honorific=coalesce(nullif(btrim(p_payload->>'customer_honorific'),''),'御中'),
      seller_company_name=coalesce(nullif(btrim(p_payload->>'seller_company_name'),''),'合同会社リバーサイド'),seller_registration_no=nullif(btrim(p_payload->>'seller_registration_no'),''),
      seller_postal_code=nullif(btrim(p_payload->>'seller_postal_code'),''),seller_address1=nullif(btrim(p_payload->>'seller_address1'),''),seller_address2=nullif(btrim(p_payload->>'seller_address2'),''),seller_phone=nullif(btrim(p_payload->>'seller_phone'),''),
      bank_name=nullif(btrim(p_payload->>'bank_name'),''),bank_branch=nullif(btrim(p_payload->>'bank_branch'),''),bank_account_type=nullif(btrim(p_payload->>'bank_account_type'),''),
      bank_account_no=nullif(btrim(p_payload->>'bank_account_no'),''),bank_account_name=nullif(btrim(p_payload->>'bank_account_name'),''),note=nullif(p_payload->>'note',''),
      subtotal_yen=v_subtotal,tax_yen=v_tax,total_yen=v_subtotal+v_tax,updated_by=auth.uid(),updated_at=now()
    where id=p_document_id;
    delete from public.sales_document_items where document_id=p_document_id;
    v_id:=p_document_id;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    v_line := v_line + 1;
    v_amount := round(greatest(coalesce(nullif(v_item->>'unit_price_yen','')::numeric,0),0) * greatest(coalesce(nullif(v_item->>'quantity','')::numeric,0),0),2);
    insert into public.sales_document_items(document_id,line_no,product_id,item_name,unit_price_yen,quantity,unit,tax_rate,amount_yen,delivery_date)
    values(v_id,v_line,nullif(v_item->>'product_id','')::uuid,btrim(v_item->>'item_name'),greatest(coalesce(nullif(v_item->>'unit_price_yen','')::numeric,0),0),
      greatest(coalesce(nullif(v_item->>'quantity','')::numeric,0),0),coalesce(nullif(btrim(v_item->>'unit'),''),'個'),greatest(coalesce(nullif(v_item->>'tax_rate','')::numeric,0.08),0),v_amount,nullif(v_item->>'delivery_date','')::date);
  end loop;

  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),case when p_document_id is null then 'CREATE' else 'UPDATE' end,'sales_document',v_id::text,v_before,
    (select jsonb_build_object('document',to_jsonb(d),'items',(select jsonb_agg(to_jsonb(i) order by i.line_no) from public.sales_document_items i where i.document_id=v_id)) from public.sales_documents d where d.id=v_id));
  return v_id;
exception when unique_violation then
  raise exception '同じ帳票種別・番号がすでに存在します';
end $$;

create or replace function public.delete_sales_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_before jsonb;
begin
  perform public.require_app_permission_('documents.manage');
  select jsonb_build_object('document',to_jsonb(d),'items',(select jsonb_agg(to_jsonb(i) order by i.line_no) from public.sales_document_items i where i.document_id=d.id))
  into v_before from public.sales_documents d where d.id=p_document_id and d.deleted_at is null for update;
  if v_before is null then raise exception '帳票が見つかりません'; end if;
  update public.sales_documents set deleted_at=now(),updated_at=now(),updated_by=auth.uid() where id=p_document_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data)
  values(auth.uid(),'DELETE','sales_document',p_document_id::text,v_before);
end $$;

create or replace function public.admin_upsert_product(p_product_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_id uuid;
  v_sku text;
  v_name text;
  v_jan text;
  v_before jsonb;
  v_standard numeric;
begin
  perform public.require_app_permission_('products.manage');
  v_sku := upper(btrim(coalesce(p_payload->>'sku','')));
  v_name := btrim(coalesce(p_payload->>'product_name',''));
  v_jan := nullif(btrim(coalesce(p_payload->>'jan_code','')), '');
  if v_sku = '' then raise exception 'SKUを入力してください'; end if;
  if v_name = '' then raise exception '商品名を入力してください'; end if;
  v_standard := greatest(coalesce(nullif(p_payload->>'standard_price_yen','')::numeric, nullif(p_payload->>'retail_price_yen','')::numeric, 0),0);

  if p_product_id is null then
    insert into public.product_master(
      sku,product_name,category,brand_name,jan_code,net_content,content_unit,package_type,
      standard_price_yen,wholesale_price_yen,retail_price_yen,other_price_yen,packaging_cost_yen,status,note,created_by,updated_by
    ) values(
      v_sku,v_name,coalesce(nullif(btrim(p_payload->>'category'),''),'その他'),coalesce(nullif(btrim(p_payload->>'brand_name'),''),'五代目八木一兵衛'),v_jan,
      greatest(coalesce(nullif(p_payload->>'net_content','')::numeric,0),0),coalesce(nullif(btrim(p_payload->>'content_unit'),''),'g'),nullif(btrim(p_payload->>'package_type'),''),
      v_standard,greatest(coalesce(nullif(p_payload->>'wholesale_price_yen','')::numeric,0),0),greatest(coalesce(nullif(p_payload->>'retail_price_yen','')::numeric,v_standard),0),
      greatest(coalesce(nullif(p_payload->>'other_price_yen','')::numeric,0),0),greatest(coalesce(nullif(p_payload->>'packaging_cost_yen','')::numeric,0),0),
      case when upper(coalesce(p_payload->>'status','ACTIVE'))='INACTIVE' then 'INACTIVE' else 'ACTIVE' end,nullif(btrim(p_payload->>'note'),''),auth.uid(),auth.uid()
    ) returning id into v_id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)
    values(auth.uid(),'CREATE','product_master',v_id::text,(select to_jsonb(x) from public.product_master x where x.id=v_id));
  else
    select to_jsonb(x) into v_before from public.product_master x where x.id=p_product_id and x.deleted_at is null for update;
    if v_before is null then raise exception '商品が見つかりません'; end if;
    update public.product_master set
      sku=v_sku,product_name=v_name,category=coalesce(nullif(btrim(p_payload->>'category'),''),'その他'),brand_name=coalesce(nullif(btrim(p_payload->>'brand_name'),''),'五代目八木一兵衛'),jan_code=v_jan,
      net_content=greatest(coalesce(nullif(p_payload->>'net_content','')::numeric,0),0),content_unit=coalesce(nullif(btrim(p_payload->>'content_unit'),''),'g'),package_type=nullif(btrim(p_payload->>'package_type'),''),
      standard_price_yen=v_standard,wholesale_price_yen=greatest(coalesce(nullif(p_payload->>'wholesale_price_yen','')::numeric,wholesale_price_yen),0),
      retail_price_yen=greatest(coalesce(nullif(p_payload->>'retail_price_yen','')::numeric,v_standard),0),other_price_yen=greatest(coalesce(nullif(p_payload->>'other_price_yen','')::numeric,other_price_yen),0),
      packaging_cost_yen=greatest(coalesce(nullif(p_payload->>'packaging_cost_yen','')::numeric,0),0),status=case when upper(coalesce(p_payload->>'status','ACTIVE'))='INACTIVE' then 'INACTIVE' else 'ACTIVE' end,
      note=nullif(btrim(p_payload->>'note'),''),updated_by=auth.uid(),updated_at=now()
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

grant execute on function public.save_document_customer(uuid,jsonb) to authenticated;
grant execute on function public.delete_document_customer(uuid) to authenticated;
grant execute on function public.update_document_company_settings(jsonb) to authenticated;
grant execute on function public.save_sales_document(uuid,jsonb) to authenticated;
grant execute on function public.delete_sales_document(uuid) to authenticated;
