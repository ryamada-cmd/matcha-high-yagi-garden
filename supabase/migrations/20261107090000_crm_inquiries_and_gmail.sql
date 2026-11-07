-- Yagi Inquiry CRM / 2026-11-07
-- Additive schema. Existing agronomy and sales tables are not modified.
-- Safe to apply against the Supabase production installation where this schema was created.
insert into public.app_permission_definitions
(permission_key,feature_key,feature_label,item_label,description,sort_order,locked,worker_default)
values
('crm.view','crm','営業・問い合わせ','閲覧','問い合わせ・取引先・メール履歴を閲覧',143,false,false),
('crm.manage','crm','営業・問い合わせ','案件管理','問い合わせ・取引先・対応履歴を更新',144,false,false),
('crm.mailboxes','crm','営業・問い合わせ','メール連携管理','接続メールと同期を管理',145,true,false)
on conflict(permission_key) do update set
feature_key=excluded.feature_key,feature_label=excluded.feature_label,
item_label=excluded.item_label,description=excluded.description,
sort_order=excluded.sort_order,locked=excluded.locked;
insert into public.role_permissions(app_role,permission_key,allowed)
select 'admin',permission_key,true from public.app_permission_definitions where feature_key='crm'
on conflict(app_role,permission_key) do update set allowed=true;
insert into public.role_permissions(app_role,permission_key,allowed)
select 'worker',permission_key,false from public.app_permission_definitions where feature_key='crm'
on conflict(app_role,permission_key) do nothing;

create table if not exists public.crm_companies (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0),
 website text,industry text,country text,region text,address text,phone text,notes text,
 document_customer_id uuid references public.document_customers(id),
 created_by uuid references auth.users(id),created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists crm_companies_name_idx on public.crm_companies(lower(name));

create table if not exists public.crm_contacts (
 id uuid primary key default gen_random_uuid(),company_id uuid references public.crm_companies(id) on delete set null,
 name text not null default '',email text,phone text,position text,language text,country text,notes text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists crm_contacts_email_unique on public.crm_contacts(lower(email))
 where email is not null and length(trim(email))>0;
create index if not exists crm_contacts_company_idx on public.crm_contacts(company_id);

create table if not exists public.crm_mailboxes(
 id uuid primary key default gen_random_uuid(),email text not null unique,
 google_subject text unique,filter_query text not null default '',
 status text not null default 'paused' check(status in('paused','active','error')),
 last_sync_at timestamptz,last_error text,connected_at timestamptz,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.crm_inquiries(
 id uuid primary key default gen_random_uuid(),subject text not null check(length(trim(subject))>0),
 category text not null default 'other' check(category in('purchase','wholesale','oem','export','sample','other')),
 stage text not null default 'new' check(stage in('new','qualifying','sampling','quoted','negotiating','won','lost','on_hold')),
 waiting_on text not null default 'our_team' check(waiting_on in('our_team','customer','none')),
 priority text not null default 'normal' check(priority in('high','normal','low')),
 source text not null default 'manual',
 company_id uuid references public.crm_companies(id) on delete set null,
 contact_id uuid references public.crm_contacts(id) on delete set null,
 mailbox_id uuid references public.crm_mailboxes(id) on delete set null,gmail_thread_id text,
 summary text,notes text,assigned_to uuid references auth.users(id) on delete set null,
 next_action_at timestamptz,requested_product text,quantity_kg numeric(14,3),
 monthly_quantity_kg numeric(14,3),expected_amount numeric(16,2),
 currency text not null default 'JPY',country text,
 customer_id uuid references public.document_customers(id) on delete set null,
 sales_document_id uuid references public.sales_documents(id) on delete set null,
 first_received_at timestamptz,last_message_at timestamptz,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint crm_gmail_thread_pair check (
  (mailbox_id is null and gmail_thread_id is null) or
  (mailbox_id is not null and gmail_thread_id is not null))
);
create unique index if not exists crm_inquiries_thread_unique on public.crm_inquiries(mailbox_id,gmail_thread_id) where gmail_thread_id is not null;
create index if not exists crm_inquiries_stage_idx on public.crm_inquiries(stage,waiting_on,next_action_at);
create index if not exists crm_inquiries_company_idx on public.crm_inquiries(company_id);
create index if not exists crm_inquiries_contact_idx on public.crm_inquiries(contact_id);
create index if not exists crm_inquiries_last_idx on public.crm_inquiries(last_message_at desc nulls last);

create table if not exists public.crm_messages (
 id uuid primary key default gen_random_uuid(),inquiry_id uuid not null references public.crm_inquiries(id) on delete cascade,
 mailbox_id uuid references public.crm_mailboxes(id) on delete set null,gmail_message_id text,
 direction text not null check(direction in('inbound','outbound')),
 from_address text,to_addresses text,cc_addresses text,subject text,body_plain text,snippet text,
 sent_at timestamptz not null,has_attachments boolean not null default false,
 created_at timestamptz not null default now()
);
create unique index if not exists crm_messages_gmail_unique on public.crm_messages(mailbox_id,gmail_message_id) where gmail_message_id is not null;
create index if not exists crm_messages_inquiry_idx on public.crm_messages(inquiry_id,sent_at);
create table if not exists public.crm_activities(
 id uuid primary key default gen_random_uuid(),inquiry_id uuid not null references public.crm_inquiries(id) on delete cascade,
 activity_type text not null check(activity_type in('note','call','meeting','sample','task','stage','other')),
 title text not null,body text,occurred_at timestamptz not null default now(),
 created_by uuid references auth.users(id),created_at timestamptz not null default now()
);
create index if not exists crm_activities_inquiry_idx on public.crm_activities(inquiry_id,occurred_at);
create table if not exists public.crm_attachments(
 id uuid primary key default gen_random_uuid(),message_id uuid not null references public.crm_messages(id) on delete cascade,
 gmail_attachment_id text,filename text not null,mime_type text,size_bytes bigint not null default 0,
 created_at timestamptz not null default now()
);
create index if not exists crm_attachments_message_idx on public.crm_attachments(message_id);
drop index if exists public.crm_attachment_identity;
create unique index crm_attachment_identity on public.crm_attachments(message_id,gmail_attachment_id);

create schema if not exists crm_private;
create table if not exists crm_private.gmail_tokens(
 mailbox_id uuid primary key references public.crm_mailboxes(id) on delete cascade,
 refresh_token_enc text not null,updated_at timestamptz not null default now()
);
create table if not exists crm_private.oauth_states(
 state text primary key,requested_by uuid not null references auth.users(id),
 filter_query text not null,expires_at timestamptz not null,created_at timestamptz not null default now()
);
revoke all on schema crm_private from public,anon,authenticated;
revoke all on all tables in schema crm_private from public,anon,authenticated;
grant usage on schema crm_private to service_role;
grant all on all tables in schema crm_private to service_role;

alter table public.crm_companies enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_mailboxes enable row level security;
alter table public.crm_inquiries enable row level security;
alter table public.crm_messages enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_attachments enable row level security;
revoke all on public.crm_companies,public.crm_contacts,public.crm_mailboxes,
 public.crm_inquiries,public.crm_messages,public.crm_activities,public.crm_attachments from anon,authenticated;
grant select,insert,update on public.crm_companies,public.crm_contacts,public.crm_inquiries to authenticated;
grant select,insert on public.crm_activities to authenticated;
grant select on public.crm_messages,public.crm_attachments,public.crm_mailboxes to authenticated;
grant update on public.crm_mailboxes to authenticated;

drop policy if exists crm_companies_read on public.crm_companies;
drop policy if exists crm_companies_write on public.crm_companies;
drop policy if exists crm_companies_edit on public.crm_companies;
create policy crm_companies_read on public.crm_companies for select to authenticated using(public.has_app_permission('crm.view'));
create policy crm_companies_write on public.crm_companies for insert to authenticated with check(public.has_app_permission('crm.manage'));
create policy crm_companies_edit on public.crm_companies for update to authenticated using(public.has_app_permission('crm.manage')) with check(public.has_app_permission('crm.manage'));
drop policy if exists crm_contacts_read on public.crm_contacts;
drop policy if exists crm_contacts_write on public.crm_contacts;
drop policy if exists crm_contacts_edit on public.crm_contacts;
create policy crm_contacts_read on public.crm_contacts for select to authenticated using(public.has_app_permission('crm.view'));
create policy crm_contacts_write on public.crm_contacts for insert to authenticated with check(public.has_app_permission('crm.manage'));
create policy crm_contacts_edit on public.crm_contacts for update to authenticated using(public.has_app_permission('crm.manage')) with check(public.has_app_permission('crm.manage'));
drop policy if exists crm_inquiries_read on public.crm_inquiries;
drop policy if exists crm_inquiries_write on public.crm_inquiries;
drop policy if exists crm_inquiries_edit on public.crm_inquiries;
create policy crm_inquiries_read on public.crm_inquiries for select to authenticated using(public.has_app_permission('crm.view'));
create policy crm_inquiries_write on public.crm_inquiries for insert to authenticated with check(public.has_app_permission('crm.manage'));
create policy crm_inquiries_edit on public.crm_inquiries for update to authenticated using(public.has_app_permission('crm.manage')) with check(public.has_app_permission('crm.manage'));
drop policy if exists crm_messages_read on public.crm_messages;
create policy crm_messages_read on public.crm_messages for select to authenticated using(public.has_app_permission('crm.view'));
drop policy if exists crm_activities_read on public.crm_activities;
drop policy if exists crm_activities_write on public.crm_activities;
create policy crm_activities_read on public.crm_activities for select to authenticated using(public.has_app_permission('crm.view'));
create policy crm_activities_write on public.crm_activities for insert to authenticated
 with check(public.has_app_permission('crm.manage') and created_by=auth.uid());
drop policy if exists crm_attachments_read on public.crm_attachments;
create policy crm_attachments_read on public.crm_attachments for select to authenticated using(public.has_app_permission('crm.view'));
drop policy if exists crm_mailboxes_read on public.crm_mailboxes;
drop policy if exists crm_mailboxes_edit on public.crm_mailboxes;
create policy crm_mailboxes_read on public.crm_mailboxes for select to authenticated using(public.has_app_permission('crm.mailboxes'));
create policy crm_mailboxes_edit on public.crm_mailboxes for update to authenticated
 using(public.has_app_permission('crm.mailboxes')) with check(public.has_app_permission('crm.mailboxes'));

create or replace function public.crm_backend_create_state(p_state text,p_requested_by uuid,p_filter_query text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_state is null or length(p_state)<20 or length(p_filter_query)>500 then raise exception 'Invalid state'; end if;
 insert into crm_private.oauth_states(state,requested_by,filter_query,expires_at)
 values(p_state,p_requested_by,p_filter_query,now()+interval '10 minutes');
end $$;
create or replace function public.crm_backend_consume_state(p_state text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v crm_private.oauth_states%rowtype;
begin
 delete from crm_private.oauth_states where state=p_state and expires_at>now()
 returning * into v;
 if not found then return null; end if;
 return jsonb_build_object('requested_by',v.requested_by,'filter_query',v.filter_query);
end $$;
create or replace function public.crm_backend_store_token(p_mailbox_id uuid,p_token_enc text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_token_enc is null or length(p_token_enc)>16000 then raise exception 'Invalid token'; end if;
 insert into crm_private.gmail_tokens(mailbox_id,refresh_token_enc)
 values(p_mailbox_id,p_token_enc)
 on conflict(mailbox_id) do update set refresh_token_enc=excluded.refresh_token_enc,updated_at=now();
end $$;
create or replace function public.crm_backend_get_token(p_mailbox_id uuid)
returns text language sql stable security definer set search_path='' as $$
 select refresh_token_enc from crm_private.gmail_tokens where mailbox_id=p_mailbox_id
$$;

-- A unique cron token is kept only in Supabase Vault.
do $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='crm_cron_secret') then
  perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'crm_cron_secret','CRM Gmail scheduled sync');
 end if;
end $$;
create or replace function public.crm_backend_validate_cron(p_secret text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(
  (select length(p_secret)=64 and p_secret=decrypted_secret from vault.decrypted_secrets
    where name='crm_cron_secret' limit 1), false)
$$;
revoke all on function public.crm_backend_create_state(text,uuid,text) from public,anon,authenticated;
revoke all on function public.crm_backend_consume_state(text) from public,anon,authenticated;
revoke all on function public.crm_backend_store_token(uuid,text) from public,anon,authenticated;
revoke all on function public.crm_backend_get_token(uuid) from public,anon,authenticated;
revoke all on function public.crm_backend_validate_cron(text) from public,anon,authenticated;
grant execute on function public.crm_backend_create_state(text,uuid,text),
 public.crm_backend_consume_state(text),public.crm_backend_store_token(uuid,text),
 public.crm_backend_get_token(uuid),public.crm_backend_validate_cron(text) to service_role;

-- No Gmail messages are scanned until a mailbox is explicitly connected, filtered and activated.
select cron.schedule('yagi-crm-gmail-every-5m','*/5 * * * *',
 $cron$
 select net.http_post(
  url:='https://mdbtngousidfanmrjybt.supabase.co/functions/v1/crm-gmail',
  headers:=jsonb_build_object('Content-Type','application/json',
   'x-crm-cron',(select decrypted_secret from vault.decrypted_secrets where name='crm_cron_secret')),
  body:='{"action":"cron"}'::jsonb,timeout_milliseconds:=30000
 ) where exists(select 1 from public.crm_mailboxes
  where status='active' and nullif(trim(filter_query),'') is not null)
 $cron$
);


-- Staff names can be used by CRM managers without exposing profile emails.
create or replace function public.crm_list_assignees()
returns table(id uuid,display_name text)
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.require_app_permission_('crm.view');
 return query select p.id,p.display_name from public.profiles p
 where p.role in('admin','worker') order by p.display_name;
end $$;
revoke all on function public.crm_list_assignees() from public,anon;
grant execute on function public.crm_list_assignees() to authenticated;
