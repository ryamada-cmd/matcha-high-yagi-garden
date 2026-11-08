-- Separate public email recipient from Google Workspace OAuth login.
-- MATCHA HIGH inquiries arrive at .com; Workspace account is .jp.
alter table public.crm_mailboxes add column if not exists oauth_email text;

update public.crm_mailboxes set
  oauth_email = case
    when email = 'info@matchahigh.com' then 'info@matchahigh.jp'
    else 'info@godaimeyagiichibei.com'
  end,
  updated_at = now()
where email in ('info@matchahigh.com','info@godaimeyagiichibei.com')
  and oauth_email is distinct from case
    when email = 'info@matchahigh.com' then 'info@matchahigh.jp'
    else 'info@godaimeyagiichibei.com'
  end;

create unique index if not exists crm_mailboxes_oauth_email_unique
on public.crm_mailboxes(lower(oauth_email))
where oauth_email is not null;

comment on column public.crm_mailboxes.oauth_email is
  'Actual Google Workspace account used for OAuth login; can differ from recipient alias in email/filter_query.';

create or replace function public.crm_backend_create_state_for_mailbox(
 p_state text,p_requested_by uuid,p_mailbox_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare v_recipient text; v_login text; v_filter text;
begin
 if p_state is null or length(p_state)<20 then raise exception 'Invalid OAuth state'; end if;
 select email,oauth_email,filter_query into v_recipient,v_login,v_filter
 from public.crm_mailboxes where id=p_mailbox_id;
 if v_recipient not in ('info@matchahigh.com','info@godaimeyagiichibei.com')
    or v_login is null
    or (v_recipient='info@matchahigh.com' and v_login<>'info@matchahigh.jp')
    or (v_recipient='info@godaimeyagiichibei.com' and v_login<>'info@godaimeyagiichibei.com')
 then raise exception '接続対象のGoogle Workspaceアカウントが正しくありません'; end if;
 if nullif(trim(v_filter),'') is null or length(v_filter)>500
 then raise exception '検索条件が未設定です'; end if;
 insert into crm_private.oauth_states(state,requested_by,filter_query,expected_email,expires_at)
 values(p_state,p_requested_by,v_filter,v_login,now()+interval '10 minutes');
end $$;

revoke all on function public.crm_backend_create_state_for_mailbox(text,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.crm_backend_create_state_for_mailbox(text,uuid,uuid)
 to service_role;
