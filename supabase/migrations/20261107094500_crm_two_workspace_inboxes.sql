-- Prepare two independent Google Workspace accounts for explicit per-address OAuth.
-- Neither account is connected or synchronized by this migration.
alter table crm_private.oauth_states
 add column if not exists expected_email text;

insert into public.crm_mailboxes(email,filter_query,status)
values
 ('info@matchahigh.com','to:info@matchahigh.com','paused'),
 ('info@godaimeyagiichibei.com','to:info@godaimeyagiichibei.com','paused')
on conflict(email) do nothing;

alter table public.crm_mailboxes drop constraint if exists crm_mailboxes_active_requires_auth;
alter table public.crm_mailboxes add constraint crm_mailboxes_active_requires_auth
 check (status <> 'active' or (connected_at is not null and google_subject is not null));

revoke update on public.crm_mailboxes from authenticated;
grant update(status,filter_query,updated_at) on public.crm_mailboxes to authenticated;

create or replace function public.crm_backend_create_state_for_mailbox(
 p_state text,p_requested_by uuid,p_mailbox_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare v_email text; v_filter text;
begin
 if p_state is null or length(p_state)<20 then raise exception 'Invalid OAuth state'; end if;
 select email,filter_query into v_email,v_filter from public.crm_mailboxes where id=p_mailbox_id;
 if v_email is null or v_email not in ('info@matchahigh.com','info@godaimeyagiichibei.com')
 then raise exception 'メールアカウントを確認できません'; end if;
 if nullif(trim(v_filter),'') is null or length(v_filter)>500 then raise exception '検索条件が未設定です'; end if;
 insert into crm_private.oauth_states(state,requested_by,filter_query,expected_email,expires_at)
 values(p_state,p_requested_by,v_filter,v_email,now()+interval '10 minutes');
end $$;

create or replace function public.crm_backend_consume_state(p_state text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v crm_private.oauth_states%rowtype;
begin
 delete from crm_private.oauth_states where state=p_state and expires_at>now()
 returning * into v;
 if not found then return null; end if;
 return jsonb_build_object('requested_by',v.requested_by,
  'filter_query',v.filter_query,'expected_email',v.expected_email);
end $$;

revoke all on function public.crm_backend_create_state_for_mailbox(text,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.crm_backend_create_state_for_mailbox(text,uuid,uuid) to service_role;
