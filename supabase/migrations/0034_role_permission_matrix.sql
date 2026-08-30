-- Granular role permission matrix for admin / worker.
-- Existing role permission values are preserved. Security-critical permissions stay fixed.

create table if not exists public.app_permission_definitions (
  permission_key text primary key,
  feature_key text not null,
  feature_label text not null,
  item_label text not null,
  description text not null default '',
  sort_order integer not null default 0,
  locked boolean not null default false,
  worker_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  app_role text not null check (app_role in ('admin','worker')),
  permission_key text not null references public.app_permission_definitions(permission_key) on delete cascade,
  allowed boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (app_role, permission_key)
);

insert into public.app_permission_definitions(permission_key,feature_key,feature_label,item_label,description,sort_order,locked,worker_default) values
('dashboard.view','dashboard','ダッシュボード','閲覧','集計と注意情報を閲覧',10,false,true),
('sprays.view','sprays','散布・防除','閲覧','散布画面と散布履歴を閲覧',20,false,true),
('sprays.create','sprays','散布・防除','散布登録','新しい散布記録を登録',21,false,true),
('sprays.edit','sprays','散布・防除','散布編集','既存の散布記録を編集',22,false,true),
('sprays.delete','sprays','散布・防除','散布削除','散布記録を削除して在庫を戻入',23,false,false),
('pesticide_inventory.view','pesticide_inventory','農薬在庫','閲覧','農薬在庫と入出庫を閲覧',30,false,true),
('pesticide_inventory.manage','pesticide_inventory','農薬在庫','入庫・棚卸・廃棄','農薬在庫を変更',31,false,false),
('pesticides.view','pesticides','農薬マスタ・公式DB','閲覧','農薬マスタと公式情報を閲覧',40,false,true),
('pesticides.manage','pesticides','農薬マスタ・公式DB','マスタ登録','公式DBから自社マスタへ登録',41,false,false),
('pesticides.sync','pesticides','農薬マスタ・公式DB','公式DB同期','FAMIC公式データを同期',42,false,false),
('spray_plans.view','spray_plans','年間防除計画','閲覧','年間防除計画を閲覧',50,false,true),
('spray_plans.manage','spray_plans','年間防除計画','登録・編集・削除','年間防除計画を変更',51,false,false),
('fertilizer_applications.view','fertilizer_applications','施肥・施肥履歴','閲覧','施肥画面と履歴を閲覧',60,false,true),
('fertilizer_applications.create','fertilizer_applications','施肥・施肥履歴','施肥登録','新しい施肥記録を登録',61,false,true),
('fertilizer_applications.edit','fertilizer_applications','施肥・施肥履歴','施肥編集','既存の施肥記録を編集',62,false,true),
('fertilizer_applications.delete','fertilizer_applications','施肥・施肥履歴','施肥削除','施肥記録を削除して在庫を戻入',63,false,false),
('fertilizer_inventory.view','fertilizer_inventory','肥料在庫','閲覧','肥料在庫と入出庫を閲覧',70,false,true),
('fertilizer_inventory.manage','fertilizer_inventory','肥料在庫','入庫・棚卸・廃棄','肥料在庫を変更',71,false,false),
('fertilizers.view','fertilizers','肥料マスタ・公式DB','閲覧','肥料マスタと公式情報を閲覧',80,false,true),
('fertilizers.manage','fertilizers','肥料マスタ・公式DB','マスタ登録・編集','自社肥料マスタを変更',81,false,false),
('fertilizers.sync','fertilizers','肥料マスタ・公式DB','公式DB同期','農水省公式肥料DBを同期',82,false,false),
('fertilizer_plans.view','fertilizer_plans','年間施肥計画','閲覧','年間施肥計画を閲覧',90,false,true),
('fertilizer_plans.manage','fertilizer_plans','年間施肥計画','登録・編集・削除','年間施肥計画を変更',91,false,false),
('harvest_processing.view','harvest_processing','摘採・製茶','閲覧','摘採・製茶の記録を閲覧',100,false,true),
('harvest_processing.manage','harvest_processing','摘採・製茶','登録・編集','摘採・製茶の記録を登録・編集',101,false,true),
('harvest_processing.delete','harvest_processing','摘採・製茶','削除','摘採・製茶の記録を削除',102,false,false),
('production.view','production','製造・製品在庫','閲覧','製造ロットと製品在庫を閲覧',110,false,true),
('production.process_manage','production','製造・製品在庫','製造実績の登録・編集','二次加工の製造実績を登録・編集',111,false,true),
('production.process_delete','production','製造・製品在庫','製造実績の削除','二次加工の製造実績を削除',112,false,false),
('production.inventory_manage','production','製造・製品在庫','入庫・棚卸・廃棄','原料・製品在庫を変更',113,false,false),
('products.view','products','商品マスタ','閲覧','商品マスタを閲覧',120,false,true),
('products.manage','products','商品マスタ','登録・編集・削除','商品マスタを変更',121,false,false),
('packaging.view','packaging','商品化・SKU在庫','閲覧','商品化履歴とSKU在庫を閲覧',130,false,true),
('packaging.manage','packaging','商品化・SKU在庫','登録・編集・削除','商品化実績を変更',131,false,false),
('sales.view','sales','販売・出庫','閲覧','販売・出庫履歴を閲覧',140,false,true),
('sales.manage','sales','販売・出庫','登録・取消','販売登録と取消を実行',141,false,false),
('equipment.view','equipment','機械設備管理','閲覧','設備台帳と整備履歴を閲覧',150,false,true),
('equipment.manage','equipment','機械設備管理','設備・履歴の変更','設備台帳と修理・整備履歴を変更',151,false,false),
('daily_reports.view','daily_reports','日報','閲覧','日報を閲覧',160,false,true),
('daily_reports.manage_own','daily_reports','日報','自分の日報の登録・編集・削除','自分の日報を変更',161,false,true),
('daily_reports.review','daily_reports','日報','確認・全員分の操作','全員の日報を確認・変更',162,false,false),
('expenses.view','expenses','経費精算','自分の申請を閲覧','自分の経費申請を閲覧',170,false,true),
('expenses.manage_own','expenses','経費精算','自分の申請・再申請','自分の経費申請を登録・編集',171,false,true),
('expenses.review','expenses','経費精算','全員分の閲覧・承認・差戻し','経費申請を審査',172,false,false),
('expenses.export','expenses','経費精算','CSV出力','絞り込み結果をCSV出力',173,false,false),
('vendor_invoices.view','vendor_invoices','請求書・支払管理','閲覧','外部請求書と支払情報を閲覧',180,false,false),
('vendor_invoices.manage','vendor_invoices','請求書・支払管理','登録・編集・削除・支払','請求書と支払履歴を変更',181,false,false),
('vendor_invoices.export','vendor_invoices','請求書・支払管理','CSV出力','請求書一覧をCSV出力',182,false,false),
('fields.view','fields','圃場・圃場カルテ','閲覧','圃場と圃場カルテを閲覧',190,false,true),
('fields.manage','fields','圃場・圃場カルテ','登録・編集・削除','圃場マスタを変更',191,false,false),
('manual.view','manual','操作ガイド','閲覧','アプリ内操作ガイドを閲覧',200,false,true),
('settings.view','settings','設定・監査','設定画面の閲覧','管理設定画面を閲覧',210,true,false),
('settings.manage','settings','設定・監査','アプリ設定の変更','警告基準や天気地点を変更',211,true,false),
('users.manage','settings','設定・監査','ユーザー役割の変更','管理者・作業者の役割を変更',212,true,false),
('audit.view','settings','設定・監査','監査ログの閲覧','全ユーザーの監査ログを閲覧',213,true,false),
('permissions.manage','settings','設定・監査','権限設定の変更','役割別の許可・不許可を変更',214,true,false)
on conflict (permission_key) do update set
 feature_key=excluded.feature_key, feature_label=excluded.feature_label, item_label=excluded.item_label,
 description=excluded.description, sort_order=excluded.sort_order, locked=excluded.locked, worker_default=excluded.worker_default;

insert into public.role_permissions(app_role,permission_key,allowed)
select 'admin',permission_key,true from public.app_permission_definitions
on conflict (app_role,permission_key) do nothing;
insert into public.role_permissions(app_role,permission_key,allowed)
select 'worker',permission_key,worker_default from public.app_permission_definitions
on conflict (app_role,permission_key) do nothing;

-- Security-critical permissions cannot be delegated to workers or removed from administrators.
update public.role_permissions rp set allowed=(rp.app_role='admin')
from public.app_permission_definitions d where d.permission_key=rp.permission_key and d.locked;

alter table public.app_permission_definitions enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists permission_definitions_read on public.app_permission_definitions;
create policy permission_definitions_read on public.app_permission_definitions for select using (true);

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select using (
  app_role=(select p.role from public.profiles p where p.id=(select auth.uid()))
  or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);

create or replace function public.has_app_permission(p_permission_key text)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists(
    select 1 from public.profiles p
    join public.role_permissions rp on rp.app_role=p.role
    where p.id=(select auth.uid()) and rp.permission_key=p_permission_key and rp.allowed
  )
$$;

create or replace function public.require_app_permission_(p_permission_key text)
returns uuid language plpgsql stable security definer set search_path to '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'ログインが必要です'; end if;
  if not public.has_app_permission(p_permission_key) then
    raise exception 'この操作は権限設定で許可されていません（%）',p_permission_key;
  end if;
  return v_user;
end $$;

create or replace function public.get_my_app_permissions()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'role',p.role,
    'permissions',coalesce((select jsonb_object_agg(rp.permission_key,rp.allowed) from public.role_permissions rp where rp.app_role=p.role),'{}'::jsonb)
  ) from public.profiles p where p.id=(select auth.uid())
$$;

create or replace function public.get_role_permission_matrix()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_result jsonb;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin') then
    raise exception '権限設定は管理者のみ閲覧できます';
  end if;
  select jsonb_build_object('definitions',coalesce(jsonb_agg(jsonb_build_object(
    'permission_key',d.permission_key,'feature_key',d.feature_key,'feature_label',d.feature_label,
    'item_label',d.item_label,'description',d.description,'sort_order',d.sort_order,'locked',d.locked,
    'admin_allowed',coalesce(a.allowed,false),'worker_allowed',coalesce(w.allowed,false)
  ) order by d.sort_order),'[]'::jsonb)) into v_result
  from public.app_permission_definitions d
  left join public.role_permissions a on a.permission_key=d.permission_key and a.app_role='admin'
  left join public.role_permissions w on w.permission_key=d.permission_key and w.app_role='worker';
  return v_result;
end $$;

create or replace function public.update_role_permissions(p_role text,p_permissions jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_before jsonb; v_after jsonb; v_key text; v_value jsonb;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin') then
    raise exception '権限の変更は管理者のみ実行できます';
  end if;
  if p_role not in ('admin','worker') then raise exception '対象役割が不正です'; end if;
  if jsonb_typeof(p_permissions)<>'object' then raise exception '権限設定の形式が不正です'; end if;
  select coalesce(jsonb_object_agg(permission_key,allowed),'{}'::jsonb) into v_before from public.role_permissions where app_role=p_role;
  for v_key,v_value in select key,value from jsonb_each(p_permissions) loop
    if jsonb_typeof(v_value)<>'boolean' then raise exception '許可・不許可は真偽値で指定してください'; end if;
    if not exists(select 1 from public.app_permission_definitions d where d.permission_key=v_key) then raise exception '不明な権限項目です（%）',v_key; end if;
    if exists(select 1 from public.app_permission_definitions d where d.permission_key=v_key and d.locked) then continue; end if;
    update public.role_permissions set allowed=(v_value::text)::boolean,updated_by=auth.uid(),updated_at=now()
    where app_role=p_role and permission_key=v_key;
  end loop;
  update public.role_permissions rp set allowed=(rp.app_role='admin'),updated_by=auth.uid(),updated_at=now()
  from public.app_permission_definitions d where d.permission_key=rp.permission_key and d.locked;
  select coalesce(jsonb_object_agg(permission_key,allowed),'{}'::jsonb) into v_after from public.role_permissions where app_role=p_role;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'UPDATE','role_permissions',p_role,v_before,v_after);
  return v_after;
end $$;

grant execute on function public.has_app_permission(text) to authenticated;
grant execute on function public.get_my_app_permissions() to authenticated;
grant execute on function public.get_role_permission_matrix() to authenticated;
grant execute on function public.update_role_permissions(text,jsonb) to authenticated;
