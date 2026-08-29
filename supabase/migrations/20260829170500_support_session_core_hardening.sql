begin;

lock table public.workspace_support_sessions in share row exclusive mode;

do $$
begin
  if exists(
    select 1 from public.workspace_support_sessions s,
    lateral unnest(s.scopes) scope
    where scope not in ('metadata','messages','files','customer_data')
  ) then
    raise exception 'Cannot harden support sessions: unsupported existing scope found';
  end if;
end
$$;

alter table public.workspace_support_sessions
  drop constraint if exists workspace_support_sessions_scopes_allowed_check;
alter table public.workspace_support_sessions
  add constraint workspace_support_sessions_scopes_allowed_check
  check (scopes <@ array['metadata','messages','files','customer_data']::text[]) not valid;
alter table public.workspace_support_sessions
  validate constraint workspace_support_sessions_scopes_allowed_check;

create or replace function public.has_active_support_scope(_workspace uuid, _scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_operator()
    and exists(
      select 1
      from public.workspace_support_sessions s
      where s.workspace_id=_workspace
        and s.support_user_id=(select auth.uid())
        and s.revoked_at is null
        and s.expires_at>pg_catalog.now()
        and _scope=any(s.scopes)
    )
$$;

create or replace function public.start_workspace_support_session(
  _workspace uuid,
  _reason text,
  _scopes text[],
  _expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit uuid;
  v_session uuid;
begin
  if not public.is_platform_operator() then
    raise exception 'Only Pulse AI platform operators can start support sessions';
  end if;
  if _workspace is null or not exists(select 1 from public.workspaces w where w.id=_workspace) then
    raise exception 'Valid workspace is required';
  end if;
  if _reason is null or length(btrim(_reason)) < 10 then
    raise exception 'Support reason is required';
  end if;
  if _scopes is null or cardinality(_scopes)=0 then
    raise exception 'Support scope is required';
  end if;
  if exists(select 1 from unnest(_scopes) s where s not in ('metadata','messages','files','customer_data')) then
    raise exception 'Unsupported support scope';
  end if;
  if _expires_at is null or _expires_at <= pg_catalog.now() then
    raise exception 'Support session expiry must be in the future';
  end if;
  if _expires_at > pg_catalog.now() + interval '8 hours' then
    raise exception 'Support sessions may not exceed 8 hours';
  end if;

  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
  values(
    (select auth.uid()),
    'support_session_started',
    'workspace',
    _workspace::text,
    jsonb_build_object('reason',_reason,'scopes',_scopes,'expires_at',_expires_at)
  ) returning id into v_audit;

  insert into public.workspace_support_sessions(
    workspace_id,support_user_id,reason,scopes,expires_at,audit_log_id
  ) values(
    _workspace,(select auth.uid()),_reason,_scopes,_expires_at,v_audit
  ) returning id into v_session;

  return v_session;
end
$$;

create or replace function public.revoke_workspace_support_session(
  _session_id uuid,
  _reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_support_user uuid;
  v_revoker_kind text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if _reason is null or length(btrim(_reason))<10 then
    raise exception 'Revocation reason is required';
  end if;

  select workspace_id,support_user_id
    into v_workspace,v_support_user
  from public.workspace_support_sessions
  where id=_session_id and revoked_at is null
  for update;

  if not found then raise exception 'Active support session not found'; end if;

  if public.is_workspace_owner((select auth.uid()),v_workspace) then
    v_revoker_kind := 'workspace_owner';
  elsif public.is_platform_operator() then
    v_revoker_kind := 'platform_operator';
  else
    raise exception 'Only workspace owners or Pulse AI platform operators can revoke support sessions';
  end if;

  update public.workspace_support_sessions
  set revoked_at=pg_catalog.now()
  where id=_session_id;

  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
  values(
    (select auth.uid()),
    'support_session_revoked',
    'workspace_support_session',
    _session_id::text,
    jsonb_build_object(
      'workspace_id',v_workspace,
      'support_user_id',v_support_user,
      'reason',_reason,
      'revoked_by_kind',v_revoker_kind
    )
  );
end
$$;

revoke all on function public.has_active_support_scope(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.start_workspace_support_session(uuid,text,text[],timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_workspace_support_session(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.has_active_support_scope(uuid,text) to authenticated,service_role;
grant execute on function public.start_workspace_support_session(uuid,text,text[],timestamptz) to authenticated,service_role;
grant execute on function public.revoke_workspace_support_session(uuid,text) to authenticated,service_role;

drop policy if exists "support users can view their own sessions" on public.workspace_support_sessions;
create policy "p1_support_sessions_select_authorized"
on public.workspace_support_sessions for select to authenticated
using (
  support_user_id=(select auth.uid())
  or public.is_workspace_owner((select auth.uid()),workspace_id)
  or public.is_platform_operator()
);

revoke all privileges on table public.workspace_support_sessions
  from public,anon,authenticated,sandbox_exec,service_role;
grant select on table public.workspace_support_sessions to authenticated;
grant select,insert,update,delete on table public.workspace_support_sessions to service_role;

commit;
