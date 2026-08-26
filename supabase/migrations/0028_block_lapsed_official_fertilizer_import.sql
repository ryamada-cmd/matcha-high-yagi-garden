-- Prevent newly linking lapsed MAFF fertilizer registrations to the operational fertilizer master.
-- Applied to production on 2026-08-26.

create or replace function public.prevent_lapsed_official_fertilizer_link_()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_lapse text;
begin
  if new.official_registration_id is not null
     and (tg_op='INSERT' or old.official_registration_id is distinct from new.official_registration_id) then
    select lapse_status into v_lapse
    from public.fertilizer_official_registrations
    where id=new.official_registration_id;
    if not found then
      raise exception '公式肥料データが見つかりません';
    end if;
    if btrim(coalesce(v_lapse,''))<>'' then
      raise exception '失効した公式登録肥料（%）は自社肥料マスタへ新規登録できません', v_lapse;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_prevent_lapsed_official_fertilizer_link on public.fertilizers;
create trigger trg_prevent_lapsed_official_fertilizer_link
before insert or update of official_registration_id on public.fertilizers
for each row execute function public.prevent_lapsed_official_fertilizer_link_();
