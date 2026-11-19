-- Shared media has its own approval and never grants storage or other operational permissions.
create table public.media_approvals (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  approved boolean not null default false,
  changed_at timestamptz not null default now()
);

create table public.media_albums (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index media_album_name_unique on public.media_albums(lower(btrim(name)));

create table public.media_items (
  id uuid primary key references public.external_files(id),
  kind text not null check (kind in ('photo','video')),
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text,
  size_bytes bigint not null check (size_bytes >= 0),
  category text not null check (category in ('茶摘み','イベント','圃場','機械設備','作業記録','商品・制作','その他')),
  album_id uuid references public.media_albums(id),
  taken_at date,
  note text check (char_length(note) <= 2000),
  field_id uuid references public.fields(id) on delete set null,
  equipment_id uuid references public.equipment_assets(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  posted_at timestamptz not null default now(),
  -- Imported files can still be used elsewhere and cannot be removed from OneDrive here.
  legacy boolean not null default false,
  state text not null default 'ready' check (state in ('ready','removed'))
);
create index media_items_listing on public.media_items(posted_at desc,id desc) where state='ready';
create index media_items_album on public.media_items(album_id);
create index media_items_owner on public.media_items(owner_id);
create index media_items_field on public.media_items(field_id);

create table public.media_upload_sessions (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id),
  original_name text not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes between 1 and 20000000000),
  mime_type text not null,
  kind text not null check (kind in ('photo','video')),
  category text not null check (category in ('茶摘み','イベント','圃場','機械設備','作業記録','商品・制作','その他')),
  album_id uuid references public.media_albums(id),
  taken_at date,
  note text check (char_length(note) <= 2000),
  field_id uuid references public.fields(id) on delete set null,
  equipment_id uuid references public.equipment_assets(id) on delete set null,
  drive_id text not null,
  folder_path text not null,
  object_name text not null,
  encrypted_url text,
  expires_at timestamptz,
  missing_since timestamptz,
  state text not null default 'open' check (state in ('open','finalized','cancelled','expired','rejected')),
  media_id uuid references public.media_items(id),
  created_at timestamptz not null default now(),
  unique (drive_id, folder_path, object_name)
);
create index media_sessions_owner_time on public.media_upload_sessions(owner_id,created_at desc);
create unique index media_sessions_active_fingerprint
  on public.media_upload_sessions(owner_id,size_bytes,fingerprint) where state in ('open','finalized');

create table public.media_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  subject_user_id uuid,
  action text not null,
  media_id uuid,
  occurred_at timestamptz not null default now()
);

alter table public.media_approvals enable row level security;
alter table public.media_items enable row level security;
alter table public.media_albums enable row level security;
alter table public.media_upload_sessions enable row level security;
alter table public.media_audit_logs enable row level security;

revoke all on public.media_approvals, public.media_items, public.media_albums,
  public.media_upload_sessions, public.media_audit_logs from public, anon, authenticated;
grant select on public.media_approvals, public.media_items, public.media_albums to authenticated;
grant select,insert,update,delete on public.media_approvals, public.media_items, public.media_albums,
  public.media_upload_sessions, public.media_audit_logs to service_role;

insert into public.media_approvals(user_id,approved)
select id, role in ('admin','worker') from public.profiles;

create function public.sync_media_approval_from_legacy_role()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.role is not distinct from old.role
    or (new.role='worker' and old.role='admin')) then return new; end if;
  insert into public.media_approvals(user_id,approved)
  values(new.id,new.role in ('admin','worker'))
  on conflict(user_id) do update set approved=excluded.approved,changed_at=now();
  return new;
end;
$$;
revoke all on function public.sync_media_approval_from_legacy_role() from public,anon,authenticated;
create trigger profile_media_approval after insert or update of role on public.profiles
for each row execute function public.sync_media_approval_from_legacy_role();

create policy media_approval_own on public.media_approvals
for select to authenticated using (user_id=(select auth.uid()));

create function public.media_can_access()
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce((select approved from public.media_approvals where user_id=(select auth.uid())),false);
$$;
revoke all on function public.media_can_access() from public,anon;
grant execute on function public.media_can_access() to authenticated;

create policy media_read_ready on public.media_items
for select to authenticated using (state='ready' and (select public.media_can_access()));
create policy media_album_read on public.media_albums
for select to authenticated using ((select public.media_can_access()));

-- Legacy field, equipment and general gallery files keep their existing IDs and paths.
-- Files linked to daily reports or other restricted records stay outside the shared gallery.
insert into public.media_albums(name)
select distinct on(lower(left(btrim(f.metadata->>'album'),100))) left(btrim(f.metadata->>'album'),100)
from public.external_files f
where f.provider='ONEDRIVE' and f.archived_at is null and f.metadata->>'kind'='photo'
  and nullif(btrim(f.metadata->>'album'),'') is not null
  and exists(select 1 from public.external_file_links l where l.file_id=f.id and l.entity_type in ('photo','field','equipment'))
  and not exists(select 1 from public.external_file_links l where l.file_id=f.id and l.entity_type not in ('photo','field','equipment'))
order by lower(left(btrim(f.metadata->>'album'),100)), left(btrim(f.metadata->>'album'),100);

insert into public.media_items(id,kind,original_name,mime_type,size_bytes,category,album_id,taken_at,note,field_id,equipment_id,owner_id,posted_at,legacy)
select f.id,'photo',left(coalesce(nullif(f.metadata->>'originalName',''),f.file_name),255),
  f.mime_type,f.size_bytes,case when f.metadata->>'photoCategory' in ('茶摘み','イベント','圃場','機械設備','作業記録','商品・制作','その他')
    then f.metadata->>'photoCategory' else 'その他' end,
  a.id,case when (f.metadata->>'takenAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and pg_input_is_valid(f.metadata->>'takenAt','date') then (f.metadata->>'takenAt')::date end,
  left(l.note,2000),p.id,e.id,owner.id,f.uploaded_at,true
from public.external_files f
join lateral (select x.* from public.external_file_links x where x.file_id=f.id
  and x.entity_type in ('photo','field','equipment') order by (x.entity_type='field') desc,x.created_at,x.id limit 1) l on true
left join public.fields p on l.entity_type='field' and p.id::text=l.entity_id
left join public.equipment_assets e on l.entity_type='equipment' and e.id::text=l.entity_id
left join public.profiles owner on owner.id=f.uploaded_by
left join public.media_albums a on lower(a.name)=lower(left(btrim(f.metadata->>'album'),100))
where f.provider='ONEDRIVE' and f.archived_at is null and f.metadata->>'kind'='photo'
  and not exists(select 1 from public.external_file_links x where x.file_id=f.id and x.entity_type not in ('photo','field','equipment'));

create function public.media_finalize(p_session uuid,p_owner uuid,p_item_id text,p_web_url text,p_sha1 text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  s public.media_upload_sessions%rowtype;
  new_id uuid;
begin
  select * into s from public.media_upload_sessions where id=p_session and owner_id=p_owner for update;
  if not found then raise exception 'media session not found'; end if;
  if not exists(select 1 from public.media_approvals where user_id=p_owner and approved) then
    raise exception 'media approval required';
  end if;
  if s.state='finalized' then return s.media_id; end if;
  if s.state<>'open' then raise exception 'media session closed'; end if;

  insert into public.external_files(provider,drive_id,provider_item_id,file_name,mime_type,size_bytes,folder_path,web_url,sha1_hash,uploaded_by,metadata)
  values ('ONEDRIVE',s.drive_id,p_item_id,s.original_name,s.mime_type,s.size_bytes,s.folder_path,p_web_url,p_sha1,p_owner,
    jsonb_build_object('kind','shared_media','mediaKind',s.kind,'originalName',s.original_name))
  returning id into new_id;

  insert into public.media_items(id,kind,original_name,mime_type,size_bytes,category,album_id,taken_at,note,field_id,equipment_id,owner_id)
  values (new_id,s.kind,s.original_name,s.mime_type,s.size_bytes,s.category,s.album_id,s.taken_at,s.note,s.field_id,s.equipment_id,p_owner);

  insert into public.external_file_links(file_id,entity_type,entity_id,category,note,created_by)
  values (new_id,'media',null,s.category,s.note,p_owner);
  if s.field_id is not null then
    insert into public.external_file_links(file_id,entity_type,entity_id,category,note,created_by)
    values (new_id,'field',s.field_id::text,s.category,s.note,p_owner);
  end if;
  if s.equipment_id is not null then
    insert into public.external_file_links(file_id,entity_type,entity_id,category,note,created_by)
    values (new_id,'equipment',s.equipment_id::text,s.category,s.note,p_owner);
  end if;

  update public.media_upload_sessions set state='finalized', media_id=new_id, encrypted_url=null where id=s.id;
  insert into public.media_audit_logs(actor_id,action,media_id) values (p_owner,'upload',new_id);
  return new_id;
end;
$$;
revoke all on function public.media_finalize(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.media_finalize(uuid,uuid,text,text,text) to service_role;

create function public.media_poster_ids()
returns table(owner_id uuid) language sql stable security invoker set search_path='' as $$
  select distinct item.owner_id from public.media_items item where item.state='ready' and item.owner_id is not null;
$$;

create function public.media_set_approval(p_actor uuid,p_user uuid,p_approved boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_actor=p_user or not exists(select 1 from public.profiles p join public.media_approvals a on a.user_id=p.id
    where p.id=p_actor and p.role='admin' and a.approved) then raise exception 'media admin required'; end if;
  if not p_approved and exists(select 1 from public.profiles where id=p_user and role='admin') then
    raise exception 'admin approval is managed with the admin role';
  end if;
  update public.media_approvals set approved=p_approved,changed_at=now() where user_id=p_user;
  if not found then raise exception 'profile not found'; end if;
  insert into public.media_audit_logs(actor_id,subject_user_id,action) values(p_actor,p_user,case when p_approved then 'approve' else 'revoke' end);
end;
$$;

create function public.media_mark_removed(p_media uuid,p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.profiles p join public.media_approvals a on a.user_id=p.id
    where p.id=p_actor and p.role='admin' and a.approved) then raise exception 'media admin required'; end if;
  update public.media_items set state='removed' where id=p_media and not legacy and state<>'removed';
  if found then
    update public.external_files set archived_at=now() where id=p_media;
    insert into public.media_audit_logs(actor_id,action,media_id) values(p_actor,'remove',p_media);
  end if;
end;
$$;

revoke all on function public.media_poster_ids(),public.media_set_approval(uuid,uuid,boolean),
  public.media_mark_removed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.media_poster_ids(),public.media_set_approval(uuid,uuid,boolean),
  public.media_mark_removed(uuid,uuid) to service_role;

-- Existing field/equipment uploads can still run through the legacy endpoint.
create function public.media_sync_legacy_photo()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  f public.external_files%rowtype;
  album_name text;
  album_key uuid;
  field_key uuid;
  equipment_key uuid;
begin
  if new.entity_type not in ('photo','field','equipment') then
    update public.media_items set state='removed' where id=new.file_id and legacy;
    return new;
  end if;
  select * into f from public.external_files where id=new.file_id and provider='ONEDRIVE'
    and archived_at is null and metadata->>'kind'='photo';
  if not found or exists(select 1 from public.external_file_links x
    where x.file_id=new.file_id and x.entity_type not in ('photo','field','equipment')) then return new; end if;

  album_name:=left(btrim(f.metadata->>'album'),100);
  if nullif(album_name,'') is not null then
    insert into public.media_albums(name) values(album_name) on conflict do nothing;
    select id into album_key from public.media_albums where lower(btrim(name))=lower(album_name);
  end if;
  if new.entity_type='field' then
    select id into field_key from public.fields where id::text=new.entity_id;
  elsif new.entity_type='equipment' then
    select id into equipment_key from public.equipment_assets where id::text=new.entity_id;
  end if;

  insert into public.media_items(id,kind,original_name,mime_type,size_bytes,category,album_id,taken_at,note,field_id,equipment_id,owner_id,posted_at,legacy)
  select f.id,'photo',left(coalesce(nullif(f.metadata->>'originalName',''),f.file_name),255),
    f.mime_type,f.size_bytes,case when f.metadata->>'photoCategory' in ('茶摘み','イベント','圃場','機械設備','作業記録','商品・制作','その他')
      then f.metadata->>'photoCategory' else 'その他' end,
    album_key,case when (f.metadata->>'takenAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and pg_input_is_valid(f.metadata->>'takenAt','date') then (f.metadata->>'takenAt')::date end,
    left(new.note,2000),field_key,equipment_key,(select id from public.profiles where id=f.uploaded_by),f.uploaded_at,true
  on conflict(id) do nothing;
  return new;
end;
$$;
revoke all on function public.media_sync_legacy_photo() from public,anon,authenticated;
create trigger media_sync_legacy_photo_after_link after insert on public.external_file_links
for each row execute function public.media_sync_legacy_photo();

create function public.media_sync_legacy_archive()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.archived_at is not null then
    update public.media_items set state='removed' where id=new.id and legacy;
  end if;
  return new;
end;
$$;
revoke all on function public.media_sync_legacy_archive() from public,anon,authenticated;
create trigger media_sync_legacy_photo_after_archive after update of archived_at on public.external_files
for each row execute function public.media_sync_legacy_archive();

create function public.media_edit(p_actor uuid,p_media uuid,p_changes jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare
  updated public.media_items%rowtype;
begin
  if not exists(select 1 from public.media_approvals where user_id=p_actor and approved) then return false; end if;
  update public.media_items set category=p_changes->>'category',album_id=(p_changes->>'album_id')::uuid,
    taken_at=(p_changes->>'taken_at')::date,note=p_changes->>'note',
    field_id=case when p_changes ? 'field_id' then (p_changes->>'field_id')::uuid else field_id end,
    equipment_id=case when p_changes ? 'equipment_id' then (p_changes->>'equipment_id')::uuid else equipment_id end
  where id=p_media and state='ready'
    and (owner_id=p_actor or exists(select 1 from public.profiles where id=p_actor and role='admin'))
  returning * into updated;
  if not found then return false; end if;

  if not updated.legacy then
    delete from public.external_file_links where file_id=p_media and entity_type in ('media','field','equipment');
    insert into public.external_file_links(file_id,entity_type,entity_id,category,note,created_by)
    select p_media,kind,target,updated.category,updated.note,updated.owner_id
    from (values ('media',null),('field',updated.field_id::text),('equipment',updated.equipment_id::text)) l(kind,target)
    where kind='media' or target is not null;
  end if;
  insert into public.media_audit_logs(actor_id,action,media_id) values(p_actor,'edit',p_media);
  return true;
end;
$$;
revoke all on function public.media_edit(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.media_edit(uuid,uuid,jsonb) to service_role;

create function public.media_limit_pending_uploads()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  total bigint;
  pending bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,861));
  select count(*),coalesce(sum(size_bytes),0) into pending,total
    from public.media_upload_sessions where owner_id=new.owner_id and state='open'
      and created_at>now()-interval '7 days';
  if pending>=10 or total+new.size_bytes>40000000000 then
    raise exception 'too many active media uploads' using errcode='53300';
  end if;
  return new;
end;
$$;
revoke all on function public.media_limit_pending_uploads() from public,anon,authenticated;
create trigger media_upload_limit before insert on public.media_upload_sessions
for each row execute function public.media_limit_pending_uploads();
