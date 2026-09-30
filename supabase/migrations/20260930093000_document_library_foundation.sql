-- Document library foundation
-- Keeps OneDrive as the binary store and external_files as the canonical file ledger.

create table if not exists public.document_library_items (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null unique references public.external_files(id) on delete cascade,
  title text not null,
  document_type text not null default 'その他',
  document_date date,
  counterparty_name text,
  fiscal_year integer,
  category text not null default 'その他',
  tags text[] not null default '{}'::text[],
  note text,
  ocr_text text,
  ocr_status text not null default 'NOT_PROCESSED'
    check (ocr_status in ('NOT_PROCESSED','PROCESSING','COMPLETED','FAILED')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.document_library_items enable row level security;

revoke all on table public.document_library_items from anon;
revoke all on table public.document_library_items from authenticated;
grant select, insert, update, delete on table public.document_library_items to authenticated;

drop policy if exists document_library_items_select on public.document_library_items;
create policy document_library_items_select
on public.document_library_items
for select
to authenticated
using ((select public.has_app_permission('storage.view'::text)));

drop policy if exists document_library_items_insert on public.document_library_items;
create policy document_library_items_insert
on public.document_library_items
for insert
to authenticated
with check (
  (select public.has_app_permission('storage.upload'::text))
  and ((select auth.uid()) = created_by)
);

drop policy if exists document_library_items_update on public.document_library_items;
create policy document_library_items_update
on public.document_library_items
for update
to authenticated
using ((select public.has_app_permission('storage.upload'::text)))
with check ((select public.has_app_permission('storage.upload'::text)));

drop policy if exists document_library_items_delete on public.document_library_items;
create policy document_library_items_delete
on public.document_library_items
for delete
to authenticated
using ((select public.has_app_permission('storage.manage'::text)));

create index if not exists idx_document_library_items_document_date
  on public.document_library_items(document_date desc);
create index if not exists idx_document_library_items_document_type
  on public.document_library_items(document_type);
create index if not exists idx_document_library_items_category
  on public.document_library_items(category);
create index if not exists idx_document_library_items_counterparty
  on public.document_library_items(counterparty_name);
create index if not exists idx_document_library_items_fiscal_year
  on public.document_library_items(fiscal_year);
create index if not exists idx_document_library_items_tags
  on public.document_library_items using gin(tags);

insert into public.document_library_items (
  file_id,
  title,
  document_type,
  document_date,
  counterparty_name,
  fiscal_year,
  category,
  tags,
  note,
  created_by,
  created_at,
  updated_at
)
select
  ef.id,
  ef.file_name,
  case
    when coalesce(l.category,'') = '請求書' then '請求書'
    when coalesce(l.category,'') = '納品書' then '納品書'
    when coalesce(l.category,'') = '仕入請求書' then '仕入請求書'
    when coalesce(l.category,'') = '支払証憑' then '支払証憑'
    when coalesce(l.category,'') = '経費・領収書' then '領収書'
    when coalesce(l.category,'') = '圃場' then '圃場資料'
    when coalesce(l.category,'') = '機械設備' then '機械設備資料'
    when coalesce(l.category,'') = '農薬' then '農薬・肥料資料'
    when coalesce(l.category,'') = '肥料' then '農薬・肥料資料'
    else 'その他'
  end,
  coalesce(
    sd.issue_date,
    vi.invoice_date,
    (ec.purchase_at at time zone 'Asia/Tokyo')::date,
    (ef.uploaded_at at time zone 'Asia/Tokyo')::date
  ),
  coalesce(sd.customer_name, vi.vendor, ec.vendor),
  extract(year from coalesce(
    sd.issue_date,
    vi.invoice_date,
    (ec.purchase_at at time zone 'Asia/Tokyo')::date,
    (ef.uploaded_at at time zone 'Asia/Tokyo')::date
  ))::integer,
  case
    when coalesce(l.category,'') in ('請求書','納品書') then '帳票'
    when coalesce(l.category,'') in ('仕入請求書','支払証憑') then '仕入'
    when coalesce(l.category,'') = '経費・領収書' then '経費'
    when coalesce(l.category,'') = '圃場' then '圃場'
    when coalesce(l.category,'') = '機械設備' then '機械設備'
    when coalesce(l.category,'') in ('農薬','肥料','農薬・肥料') then '農薬・肥料'
    else 'その他'
  end,
  '{}'::text[],
  l.note,
  coalesce(l.created_by, ef.uploaded_by),
  coalesce(l.created_at, ef.uploaded_at),
  now()
from public.external_files ef
left join lateral (
  select x.*
  from public.external_file_links x
  where x.file_id = ef.id
  order by x.created_at desc
  limit 1
) l on true
left join public.sales_documents sd
  on l.entity_type = 'sales_document' and sd.id::text = l.entity_id
left join public.vendor_invoices vi
  on l.entity_type = 'vendor_invoice' and vi.id::text = l.entity_id
left join public.expense_claims ec
  on l.entity_type = 'expense_claim' and ec.id::text = l.entity_id
where ef.archived_at is null
  and coalesce(ef.metadata->>'kind','') <> 'photo'
on conflict (file_id) do nothing;
