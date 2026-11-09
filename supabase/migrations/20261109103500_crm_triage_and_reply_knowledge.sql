-- CRM reversible triage, exact sender rules and approval-gated sales facts.
-- Already applied to production; keep this migration for repeatable environments.
alter table public.crm_inquiries add column if not exists excluded_at timestamptz;
alter table public.crm_inquiries add column if not exists excluded_by uuid references auth.users(id) on delete set null;
alter table public.crm_inquiries add column if not exists excluded_reason text;
create index if not exists crm_inquiries_exclusion_idx on public.crm_inquiries(excluded_at,created_at desc);

create table if not exists public.crm_sender_rules (
 id uuid primary key default gen_random_uuid(),
 mailbox_id uuid not null references public.crm_mailboxes(id) on delete cascade,
 sender_email text not null check(length(sender_email) between 3 and 254 and sender_email like '%@%'),
 active boolean not null default true,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(mailbox_id,sender_email)
);
create index if not exists crm_sender_rules_active_idx
 on public.crm_sender_rules(mailbox_id,sender_email) where active;
create or replace function public.crm_normalize_sender_rule() returns trigger
language plpgsql set search_path='' as $$
begin
 new.sender_email=lower(trim(new.sender_email));
 new.updated_at=now();
 return new;
end $$;
drop trigger if exists crm_normalize_sender_rule_trigger on public.crm_sender_rules;
create trigger crm_normalize_sender_rule_trigger before insert or update on public.crm_sender_rules
 for each row execute function public.crm_normalize_sender_rule();

create table if not exists public.crm_reply_knowledge (
 id uuid primary key default gen_random_uuid(),
 kind text not null default 'product' check(kind in('product','general')),
 title text not null check(length(trim(title)) between 2 and 160),
 brand text, product_name text, variety text, grade text, unit_size text,
 unit_price numeric(16,2) check(unit_price>=0),
 currency text not null default 'JPY' check(currency in('JPY','USD','EUR','GBP','AUD','CAD')),
 moq_kg numeric(16,3) check(moq_kg>0), lead_time text,
 sample_price numeric(16,2) check(sample_price>=0),
 sample_quantity_g numeric(16,2) check(sample_quantity_g>0),
 sample_moq_qty numeric(16,2) check(sample_moq_qty>0),
 shipping_terms text,payment_terms text,notes text,valid_until date,
 approved boolean not null default false,
 approved_at timestamptz,approved_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint crm_reply_product_has_name check(kind='general' or nullif(trim(product_name),'') is not null)
);
create index if not exists crm_reply_knowledge_active_idx
 on public.crm_reply_knowledge(kind,approved,valid_until);
create or replace function public.crm_guard_knowledge_approval() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if row(new.kind,new.title,new.brand,new.product_name,new.variety,new.grade,new.unit_size,
          new.unit_price,new.currency,new.moq_kg,new.lead_time,new.sample_price,
          new.sample_quantity_g,new.sample_moq_qty,new.shipping_terms,
          new.payment_terms,new.notes,new.valid_until)
      is distinct from
      row(old.kind,old.title,old.brand,old.product_name,old.variety,old.grade,old.unit_size,
          old.unit_price,old.currency,old.moq_kg,old.lead_time,old.sample_price,
          old.sample_quantity_g,old.sample_moq_qty,old.shipping_terms,
          old.payment_terms,old.notes,old.valid_until)
   then
     new.approved=false;new.approved_at=null;new.approved_by=null;
   end if;
 end if;
 if new.approved and (tg_op='INSERT' or not old.approved) then
   new.approved_at=now();new.approved_by=auth.uid();
 elsif not new.approved then
   new.approved_at=null;new.approved_by=null;
 end if;
 new.updated_at=now();
 return new;
end $$;
drop trigger if exists crm_guard_knowledge_approval_trigger on public.crm_reply_knowledge;
create trigger crm_guard_knowledge_approval_trigger before insert or update on public.crm_reply_knowledge
 for each row execute function public.crm_guard_knowledge_approval();

create table if not exists public.crm_reply_drafts (
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null references public.crm_inquiries(id) on delete cascade,
 knowledge_id uuid references public.crm_reply_knowledge(id) on delete set null,
 summary text not null, reply_subject text not null, reply_body text not null,
 missing_fields text[] not null default '{}',
 knowledge_snapshot jsonb not null default '{}'::jsonb,
 method text not null check(method in('ai','template')),
 language text not null default 'ja' check(language in('ja','en')),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists crm_reply_drafts_inquiry_idx
 on public.crm_reply_drafts(inquiry_id,created_at desc);

alter table public.crm_sender_rules enable row level security;
alter table public.crm_reply_knowledge enable row level security;
alter table public.crm_reply_drafts enable row level security;
revoke all on public.crm_sender_rules,public.crm_reply_knowledge,public.crm_reply_drafts from anon,authenticated;
grant select,insert,update on public.crm_sender_rules,public.crm_reply_knowledge to authenticated;
grant select,update on public.crm_reply_drafts to authenticated;

drop policy if exists crm_sender_rules_read on public.crm_sender_rules;
drop policy if exists crm_sender_rules_write on public.crm_sender_rules;
drop policy if exists crm_sender_rules_edit on public.crm_sender_rules;
create policy crm_sender_rules_read on public.crm_sender_rules
 for select to authenticated using(public.has_app_permission('crm.manage'));
create policy crm_sender_rules_write on public.crm_sender_rules
 for insert to authenticated with check(public.has_app_permission('crm.manage'));
create policy crm_sender_rules_edit on public.crm_sender_rules
 for update to authenticated using(public.has_app_permission('crm.manage'))
 with check(public.has_app_permission('crm.manage'));

drop policy if exists crm_reply_knowledge_read on public.crm_reply_knowledge;
drop policy if exists crm_reply_knowledge_write on public.crm_reply_knowledge;
drop policy if exists crm_reply_knowledge_edit on public.crm_reply_knowledge;
create policy crm_reply_knowledge_read on public.crm_reply_knowledge
 for select to authenticated using(public.has_app_permission('crm.manage'));
create policy crm_reply_knowledge_write on public.crm_reply_knowledge
 for insert to authenticated with check(public.has_app_permission('crm.manage'));
create policy crm_reply_knowledge_edit on public.crm_reply_knowledge
 for update to authenticated using(public.has_app_permission('crm.manage'))
 with check(public.has_app_permission('crm.manage'));

drop policy if exists crm_reply_drafts_read on public.crm_reply_drafts;
drop policy if exists crm_reply_drafts_edit on public.crm_reply_drafts;
create policy crm_reply_drafts_read on public.crm_reply_drafts
 for select to authenticated using(public.has_app_permission('crm.manage'));
create policy crm_reply_drafts_edit on public.crm_reply_drafts
 for update to authenticated using(public.has_app_permission('crm.manage'))
 with check(public.has_app_permission('crm.manage'));
