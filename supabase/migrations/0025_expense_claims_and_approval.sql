-- Expense reimbursement claims with multi-line items, admin approval/rejection and audit logging.
-- Applied to production on 2026-08-26.

create table if not exists public.expense_claims (
  id uuid primary key default gen_random_uuid(),
  claim_no text not null unique,
  purchase_at timestamptz not null,
  vendor text not null,
  applicant_id uuid not null references auth.users(id),
  applicant_name_snapshot text not null,
  status text not null default 'SUBMITTED' check(status in ('SUBMITTED','APPROVED','REJECTED')),
  total_amount_yen numeric(16,2) not null default 0 check(total_amount_yen >= 0),
  note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewer_name_snapshot text,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_claim_items (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.expense_claims(id) on delete cascade,
  line_no integer not null check(line_no > 0),
  description text not null,
  quantity numeric(14,3) not null default 1 check(quantity > 0),
  unit_price_yen numeric(16,2) not null check(unit_price_yen >= 0),
  tax_rate numeric(5,2) not null default 10 check(tax_rate >= 0 and tax_rate <= 100),
  line_total_yen numeric(16,2) not null check(line_total_yen >= 0),
  note text,
  created_at timestamptz not null default now(),
  unique(claim_id,line_no)
);

create index if not exists idx_expense_claims_applicant on public.expense_claims(applicant_id,purchase_at desc);
create index if not exists idx_expense_claims_status on public.expense_claims(status,submitted_at desc);
create index if not exists idx_expense_claims_purchase on public.expense_claims(purchase_at desc);
create index if not exists idx_expense_claim_items_claim on public.expense_claim_items(claim_id,line_no);

alter table public.expense_claims enable row level security;
alter table public.expense_claim_items enable row level security;

drop policy if exists expense_claims_read on public.expense_claims;
create policy expense_claims_read on public.expense_claims for select to authenticated using(
  applicant_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);
drop policy if exists expense_claim_items_read on public.expense_claim_items;
create policy expense_claim_items_read on public.expense_claim_items for select to authenticated using(
  exists(select 1 from public.expense_claims c where c.id=claim_id and (c.applicant_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')))
);
grant select on public.expense_claims,public.expense_claim_items to authenticated;

create or replace function public.save_expense_claim(p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_id uuid; v_role text; v_display text; v_vendor text; v_purchase timestamptz; v_item jsonb;
  v_desc text; v_qty numeric; v_unit numeric; v_tax numeric; v_line numeric; v_total numeric:=0;
  v_line_no int:=0; v_status text; v_applicant uuid; v_before jsonb; v_after jsonb; v_no text;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select role,coalesce(nullif(display_name,''),'担当者') into v_role,v_display from public.profiles where id=auth.uid();
  if coalesce(v_role,'') not in('admin','worker') then raise exception '権限がありません'; end if;
  v_id:=nullif(p_payload->>'id','')::uuid;
  v_vendor:=btrim(coalesce(p_payload->>'vendor',''));
  v_purchase:=coalesce(nullif(p_payload->>'purchase_at','')::timestamptz,now());
  if v_vendor='' then raise exception '購入先を入力してください'; end if;
  if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')=0 then raise exception '購入明細を1件以上入力してください'; end if;

  if v_id is null then
    v_no:='EXP-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(md5(random()::text),1,4));
    insert into public.expense_claims(claim_no,purchase_at,vendor,applicant_id,applicant_name_snapshot,status,note,submitted_at)
    values(v_no,v_purchase,v_vendor,auth.uid(),v_display,'SUBMITTED',nullif(btrim(p_payload->>'note'),''),now()) returning id into v_id;
  else
    select applicant_id,status,jsonb_build_object('claim',to_jsonb(c),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no),'[]'::jsonb) from public.expense_claim_items i where i.claim_id=c.id))
      into v_applicant,v_status,v_before from public.expense_claims c where c.id=v_id for update;
    if v_before is null then raise exception '経費申請が見つかりません'; end if;
    if v_applicant<>auth.uid() then raise exception 'この経費申請を編集する権限がありません'; end if;
    if v_status<>'REJECTED' then raise exception '差戻しされた申請のみ修正して再申請できます'; end if;
    delete from public.expense_claim_items where claim_id=v_id;
    update public.expense_claims set purchase_at=v_purchase,vendor=v_vendor,status='SUBMITTED',note=nullif(btrim(p_payload->>'note'),''),submitted_at=now(),reviewed_at=null,reviewed_by=null,reviewer_name_snapshot=null,review_comment=null,updated_at=now() where id=v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_line_no:=v_line_no+1;
    v_desc:=btrim(coalesce(v_item->>'description',''));
    v_qty:=coalesce(nullif(v_item->>'quantity','')::numeric,0);
    v_unit:=coalesce(nullif(v_item->>'unit_price_yen','')::numeric,-1);
    v_tax:=coalesce(nullif(v_item->>'tax_rate','')::numeric,10);
    if v_desc='' then raise exception '購入内容を入力してください'; end if;
    if v_qty<=0 then raise exception '数量は0より大きくしてください'; end if;
    if v_unit<0 then raise exception '単価は0以上で入力してください'; end if;
    if v_tax<0 or v_tax>100 then raise exception '税率を確認してください'; end if;
    v_line:=round(v_qty*v_unit,0);
    v_total:=v_total+v_line;
    insert into public.expense_claim_items(claim_id,line_no,description,quantity,unit_price_yen,tax_rate,line_total_yen,note)
    values(v_id,v_line_no,v_desc,round(v_qty,3),round(v_unit,2),round(v_tax,2),v_line,nullif(btrim(v_item->>'note'),''));
  end loop;
  update public.expense_claims set total_amount_yen=v_total,updated_at=now() where id=v_id;
  select jsonb_build_object('claim',to_jsonb(c),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no),'[]'::jsonb) from public.expense_claim_items i where i.claim_id=c.id)) into v_after from public.expense_claims c where c.id=v_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),case when v_before is null then 'SUBMIT' else 'RESUBMIT' end,'expense_claim',v_id::text,v_before,v_after);
  return v_id;
end $$;
revoke all on function public.save_expense_claim(jsonb) from public,anon;
grant execute on function public.save_expense_claim(jsonb) to authenticated;

create or replace function public.review_expense_claim(p_id uuid,p_action text,p_comment text default null) returns void
language plpgsql security definer set search_path=public as $$
declare v_before jsonb;v_after jsonb;v_display text;v_action text;
begin
  perform public.require_admin_();
  v_action:=upper(btrim(coalesce(p_action,'')));
  if v_action not in('APPROVE','REJECT') then raise exception '承認または差戻しを指定してください'; end if;
  if v_action='REJECT' and btrim(coalesce(p_comment,''))='' then raise exception '差戻し理由を入力してください'; end if;
  select jsonb_build_object('claim',to_jsonb(c),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no),'[]'::jsonb) from public.expense_claim_items i where i.claim_id=c.id)) into v_before from public.expense_claims c where c.id=p_id and c.status='SUBMITTED' for update;
  if v_before is null then raise exception '申請中の経費精算が見つかりません'; end if;
  select coalesce(nullif(display_name,''),'管理者') into v_display from public.profiles where id=auth.uid();
  update public.expense_claims set status=case when v_action='APPROVE' then 'APPROVED' else 'REJECTED' end,reviewed_at=now(),reviewed_by=auth.uid(),reviewer_name_snapshot=v_display,review_comment=nullif(btrim(p_comment),''),updated_at=now() where id=p_id;
  select jsonb_build_object('claim',to_jsonb(c),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no),'[]'::jsonb) from public.expense_claim_items i where i.claim_id=c.id)) into v_after from public.expense_claims c where c.id=p_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),v_action,'expense_claim',p_id::text,v_before,v_after);
end $$;
revoke all on function public.review_expense_claim(uuid,text,text) from public,anon;
grant execute on function public.review_expense_claim(uuid,text,text) to authenticated;
