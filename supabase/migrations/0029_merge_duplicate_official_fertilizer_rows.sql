-- Canonicalize duplicate rows within the same MAFF fertilizer snapshot.
-- Applied to production on 2026-08-26.

create or replace function public.merge_official_fertilizer_duplicate_()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if tg_op='UPDATE' and old.sync_token=new.sync_token then
    new.components := coalesce(old.components,'{}'::jsonb) || coalesce(new.components,'{}'::jsonb);
    new.tn := coalesce(new.tn,old.tn); new.an := coalesce(new.an,old.an); new.nn := coalesce(new.nn,old.nn);
    new.tp := coalesce(new.tp,old.tp); new.cp := coalesce(new.cp,old.cp); new.sp := coalesce(new.sp,old.sp); new.wp := coalesce(new.wp,old.wp);
    new.tk := coalesce(new.tk,old.tk); new.ck := coalesce(new.ck,old.ck); new.wk := coalesce(new.wk,old.wk);
    new.smg := coalesce(new.smg,old.smg); new.cmg := coalesce(new.cmg,old.cmg); new.wmg := coalesce(new.wmg,old.wmg);
    new.sca := coalesce(new.sca,old.sca); new.cca := coalesce(new.cca,old.cca); new.wca := coalesce(new.wca,old.wca);
    if btrim(coalesce(old.lapse_status,''))='' or btrim(coalesce(new.lapse_status,''))='' then
      new.lapse_status := null;
      new.search_text := regexp_replace(coalesce(new.search_text,''),'(満期失効|廃止失効)','','g');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_merge_official_fertilizer_duplicate on public.fertilizer_official_registrations;
create trigger trg_merge_official_fertilizer_duplicate
before update on public.fertilizer_official_registrations
for each row execute function public.merge_official_fertilizer_duplicate_();

create or replace function public.finalize_official_fertilizer_sync(p_sync_token uuid,p_source_date date,p_row_count integer)
returns integer
language plpgsql security definer set search_path=public as $$
declare v_deleted integer;v_total integer;
begin
  perform public.require_fertilizer_admin_();
  delete from public.fertilizer_official_registrations where sync_token<>p_sync_token;
  get diagnostics v_deleted=row_count;
  select count(*) into v_total from public.fertilizer_official_registrations where sync_token=p_sync_token;
  if v_total=0 then raise exception '公式肥料DBの同期結果が0件です'; end if;
  if p_row_count>0 and v_total>p_row_count then raise exception '同期件数が不正です（DB %, CSV %）',v_total,p_row_count;end if;
  insert into public.fertilizer_official_sync_log(source_date,row_count,sync_token,synced_by)
  values(p_source_date,v_total,p_sync_token,auth.uid());
  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'SYNC','fertilizer_official_registry',p_sync_token::text,
    jsonb_build_object('source_date',p_source_date,'row_count',v_total,'source_rows',p_row_count,'collapsed_duplicates',greatest(p_row_count-v_total,0),'deleted_old',v_deleted));
  return v_total;
end $$;
revoke all on function public.finalize_official_fertilizer_sync(uuid,date,integer) from public,anon;
grant execute on function public.finalize_official_fertilizer_sync(uuid,date,integer) to authenticated;
