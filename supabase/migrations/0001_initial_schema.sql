create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'worker' check (role in ('admin','worker','viewer')),
  created_at timestamptz not null default now()
);

create table if not exists pesticides (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  famic_registration_no text,
  name text not null,
  category text,
  active_ingredient text,
  frac_irac text,
  toxicity text,
  official_url text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fields (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  location text,
  area_m2 numeric(12,2) not null check (area_m2 > 0),
  variety text,
  cultivation_type text default '茶園',
  standard_spray_l_per_10a numeric(12,2) not null default 300,
  harvest_planned_date date,
  assigned_to uuid references profiles(id),
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists inventory_lots (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  pesticide_id uuid not null references pesticides(id),
  purchase_date date,
  supplier text,
  purchase_unit_price numeric(12,2),
  package_count numeric(12,3),
  package_unit text,
  package_size numeric(12,3),
  content_unit text check (content_unit in ('ml','g')),
  purchased_content_qty numeric(14,3),
  expiry_date date,
  storage_location text,
  manufacturer_lot_no text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists spray_batches (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  spray_date date not null,
  prepared_volume_l numeric(14,3) not null check (prepared_volume_l > 0),
  target text,
  weather text,
  temperature_c numeric(6,2),
  operator_id uuid references profiles(id),
  operator_name_snapshot text,
  allocation_method text not null default 'proportional' check (allocation_method in ('proportional','manual')),
  pre_harvest_checked boolean not null default false,
  application_count_checked boolean not null default false,
  tank_mix_checked boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references profiles(id),
  delete_reason text
);

create table if not exists spray_batch_chemicals (
  id uuid primary key default gen_random_uuid(),
  spray_batch_id uuid not null references spray_batches(id) on delete cascade,
  pesticide_id uuid not null references pesticides(id),
  inventory_lot_id uuid not null references inventory_lots(id),
  dilution numeric(12,3) not null check (dilution > 0),
  chemical_qty numeric(14,3) not null check (chemical_qty > 0),
  chemical_unit text not null check (chemical_unit in ('ml','g')),
  created_at timestamptz not null default now()
);

create table if not exists spray_batch_fields (
  id uuid primary key default gen_random_uuid(),
  spray_batch_id uuid not null references spray_batches(id) on delete cascade,
  field_id uuid not null references fields(id),
  field_area_m2_snapshot numeric(12,2) not null,
  standard_volume_l numeric(14,3) not null,
  actual_spray_volume_l numeric(14,3) not null check (actual_spray_volume_l >= 0),
  created_at timestamptz not null default now(),
  unique (spray_batch_id, field_id)
);

create table if not exists inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  inventory_lot_id uuid not null references inventory_lots(id),
  transaction_type text not null check (transaction_type in ('PURCHASE','SPRAY','RETURN','ADJUSTMENT','DISPOSAL')),
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (unit in ('ml','g')),
  reference_type text,
  reference_id uuid,
  reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists annual_spray_plans (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  plan_year int not null,
  month int not null check (month between 1 and 12),
  period text,
  field_id uuid references fields(id),
  all_fields boolean not null default false,
  target_pest text not null,
  recommended_pesticide_id uuid references pesticides(id),
  recommended_pesticide_text text,
  frac_irac text,
  planned_date date,
  executed_date date,
  status text not null default 'planned',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create or replace view inventory_balances as
select
  l.id as inventory_lot_id,
  l.pesticide_id,
  l.content_unit,
  coalesce(sum(case
    when t.transaction_type in ('PURCHASE','RETURN') then t.quantity
    when t.transaction_type in ('SPRAY','DISPOSAL') then -t.quantity
    when t.transaction_type = 'ADJUSTMENT' then t.quantity
    else 0 end),0) as balance
from inventory_lots l
left join inventory_transactions t on t.inventory_lot_id = l.id
group by l.id,l.pesticide_id,l.content_unit;

create index if not exists idx_inventory_transactions_lot on inventory_transactions(inventory_lot_id, created_at);
create index if not exists idx_spray_batches_date on spray_batches(spray_date desc) where deleted_at is null;
create index if not exists idx_spray_batch_chemicals_batch on spray_batch_chemicals(spray_batch_id);
create index if not exists idx_spray_batch_fields_batch on spray_batch_fields(spray_batch_id);
create index if not exists idx_annual_spray_plans_date on annual_spray_plans(planned_date) where deleted_at is null;

alter table profiles enable row level security;
alter table pesticides enable row level security;
alter table fields enable row level security;
alter table inventory_lots enable row level security;
alter table spray_batches enable row level security;
alter table spray_batch_chemicals enable row level security;
alter table spray_batch_fields enable row level security;
alter table inventory_transactions enable row level security;
alter table annual_spray_plans enable row level security;
alter table audit_logs enable row level security;

create policy "authenticated read pesticides" on pesticides for select to authenticated using (true);
create policy "authenticated read fields" on fields for select to authenticated using (deleted_at is null);
create policy "authenticated read lots" on inventory_lots for select to authenticated using (true);
create policy "authenticated read sprays" on spray_batches for select to authenticated using (deleted_at is null);
create policy "authenticated read spray chemicals" on spray_batch_chemicals for select to authenticated using (true);
create policy "authenticated read spray fields" on spray_batch_fields for select to authenticated using (true);
create policy "authenticated read transactions" on inventory_transactions for select to authenticated using (true);
create policy "authenticated read plans" on annual_spray_plans for select to authenticated using (deleted_at is null);
