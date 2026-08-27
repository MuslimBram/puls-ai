-- Support sessions must always have a linked audit event. Existing table is empty.
alter table public.workspace_support_sessions alter column audit_log_id set not null;

create or replace function public.start_workspace_support_session(
  _workspace uuid,
  _reason text,
  _scopes text[],
  _expires_at timestamptz
) returns uuid language plpgsql security definer set search_path=public
as $$
declare v_audit uuid; v_session uuid;
begin
  if not public.is_platform_operator() then raise exception 'Only Owner or Pulse AI Admin can start support sessions'; end if;
  if _workspace is null then raise exception 'Workspace is required'; end if;
  if _reason is null or length(btrim(_reason)) < 10 then raise exception 'Support reason is required'; end if;
  if _scopes is null or cardinality(_scopes)=0 then raise exception 'Support scope is required'; end if;
  if _expires_at is null or _expires_at <= now() then raise exception 'Support session expiry must be in the future'; end if;
  if exists(select 1 from unnest(_scopes) s where s not in ('metadata','messages','files','customer_data','secrets')) then raise exception 'Unsupported support scope'; end if;
  if _expires_at > now() + interval '8 hours' then raise exception 'Support sessions may not exceed 8 hours'; end if;
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
  values((select auth.uid()),'support_session_started','workspace',_workspace::text,jsonb_build_object('reason',_reason,'scopes',_scopes,'expires_at',_expires_at)) returning id into v_audit;
  insert into public.workspace_support_sessions(workspace_id,support_user_id,reason,scopes,expires_at,audit_log_id)
  values(_workspace,(select auth.uid()),_reason,_scopes,_expires_at,v_audit) returning id into v_session;
  return v_session;
end;
$$;

create or replace function public.revoke_workspace_support_session(_session_id uuid,_reason text)
returns void language plpgsql security definer set search_path=public
as $$
declare v_workspace uuid;
begin
  if not public.is_platform_operator() then raise exception 'Only Owner or Pulse AI Admin can revoke support sessions'; end if;
  if _reason is null or length(btrim(_reason))<10 then raise exception 'Revocation reason is required'; end if;
  select workspace_id into v_workspace from public.workspace_support_sessions where id=_session_id and support_user_id=(select auth.uid()) and revoked_at is null for update;
  if not found then raise exception 'Active support session not found'; end if;
  update public.workspace_support_sessions set revoked_at=now() where id=_session_id;
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
  values((select auth.uid()),'support_session_revoked','workspace_support_session',_session_id::text,jsonb_build_object('workspace_id',v_workspace,'reason',_reason));
end;
$$;

revoke all on function public.start_workspace_support_session(uuid,text,text[],timestamptz) from public,anon;
grant execute on function public.start_workspace_support_session(uuid,text,text[],timestamptz) to authenticated;
revoke all on function public.revoke_workspace_support_session(uuid,text) from public,anon;
grant execute on function public.revoke_workspace_support_session(uuid,text) to authenticated;

-- No direct authenticated INSERT/UPDATE: session lifecycle goes through audited RPCs.
drop policy if exists "platform operators can create support sessions" on public.workspace_support_sessions;
drop policy if exists "platform operators can revoke their support sessions" on public.workspace_support_sessions;
revoke insert,update,delete on table public.workspace_support_sessions from authenticated;
revoke truncate,references,trigger on table public.workspace_support_sessions from authenticated;
revoke all on function public.has_active_support_scope(uuid,text) from public,anon;
grant execute on function public.has_active_support_scope(uuid,text) to authenticated,service_role;