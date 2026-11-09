-- Fix PostgREST upsert: ON CONFLICT (mailbox_id,gmail_message_id) needs
-- a non-partial unique arbiter. PostgreSQL allows multiple NULL identities.
drop index if exists public.crm_messages_gmail_unique;
create unique index crm_messages_gmail_unique
  on public.crm_messages(mailbox_id,gmail_message_id);

-- User confirmed the actual MATCHA HIGH address is .jp; .com does not exist.
-- Preserve the connected Google OAuth subject, token and inquiry mailbox IDs.
update public.crm_mailboxes
set email='info@matchahigh.jp',
    oauth_email='info@matchahigh.jp',
    filter_query='to:info@matchahigh.jp',
    updated_at=now()
where email='info@matchahigh.com';

update public.crm_inquiries
set received_address='info@matchahigh.jp',updated_at=now()
where received_address='info@matchahigh.com';

create or replace function public.crm_backend_create_state_for_mailbox(
  p_state text,p_requested_by uuid,p_mailbox_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare v_recipient text; v_login text; v_filter text;
begin
 if p_state is null or length(p_state)<20 then raise exception 'Invalid OAuth state'; end if;
 select email,oauth_email,filter_query into v_recipient,v_login,v_filter
 from public.crm_mailboxes where id=p_mailbox_id;
 if v_recipient not in ('info@matchahigh.jp','info@godaimeyagiichibei.com')
    or v_login is null or v_login<>v_recipient
 then raise exception '接続対象のGoogle Workspaceアカウントが正しくありません'; end if;
 if nullif(trim(v_filter),'') is null or length(v_filter)>500
 then raise exception '検索条件が未設定です'; end if;
 insert into crm_private.oauth_states(state,requested_by,filter_query,expected_email,expires_at)
 values(p_state,p_requested_by,v_filter,v_login,now()+interval '10 minutes');
end $$;
revoke all on function public.crm_backend_create_state_for_mailbox(text,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.crm_backend_create_state_for_mailbox(text,uuid,uuid) to service_role;