-- MR5-A: first-party Pulse -> LEAH SSO handoff.
-- Pulse JWT issues a short-lived one-time code; LEAH redeems it atomically into a
-- normal LEAH session. Raw handoff/session tokens are never persisted.

create table public.leah_handoff_tickets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, workspace_id),
  constraint leah_handoff_expiry_ck check (
    expires_at > created_at and expires_at <= created_at + interval '5 minutes'
  ),
  constraint leah_handoff_consumed_ck check (
    consumed_at is null or consumed_at >= created_at
  )
);

create index leah_handoff_expiry_idx
  on public.leah_handoff_tickets(expires_at)
  where consumed_at is null;

alter table public.leah_handoff_tickets enable row level security;
alter table public.leah_handoff_tickets force row level security;
revoke all on public.leah_handoff_tickets from public, anon, authenticated;
grant all on public.leah_handoff_tickets to service_role;

-- LEAH uses the authoritative Pulse role helpers. This value is presentation/session
-- context only; privileged actions continue to re-check Pulse roles server-side.
create or replace function public.leah_role_for_user(
  _user_id uuid,
  _workspace_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if _user_id is null or _workspace_id is null then return null; end if;

  if public.has_workspace_role_for_user(_user_id, _workspace_id, array['owner']::text[]) then
    return 'owner';
  end if;
  if public.has_workspace_role_for_user(_user_id, _workspace_id, array['admin']::text[]) then
    return 'admin';
  end if;
  if public.has_workspace_role_for_user(_user_id, _workspace_id, array['member']::text[]) then
    return 'member';
  end if;
  return null;
end;
$$;

revoke all on function public.leah_role_for_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leah_role_for_user(uuid, uuid) to service_role;

create or replace function public.leah_redeem_handoff(
  _code_hash text,
  _session_token_hash text,
  _session_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _ticket public.leah_handoff_tickets%rowtype;
  _entitlement public.leah_workspace_entitlements%rowtype;
  _role text;
  _session_id uuid;
  _now timestamptz := clock_timestamp();
begin
  if _code_hash is null or _code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'LEAH_HANDOFF_INVALID';
  end if;
  if _session_token_hash is null or _session_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'LEAH_HANDOFF_INVALID';
  end if;
  if _session_expires_at is null
     or _session_expires_at <= _now
     or _session_expires_at > _now + interval '65 minutes' then
    raise exception 'LEAH_HANDOFF_INVALID';
  end if;

  select h.* into _ticket
  from public.leah_handoff_tickets h
  where h.code_hash = _code_hash
    and h.consumed_at is null
    and h.expires_at > _now
  for update;
  if not found then raise exception 'LEAH_HANDOFF_INVALID'; end if;

  _role := public.leah_role_for_user(_ticket.user_id, _ticket.workspace_id);
  if _role is null then raise exception 'LEAH_HANDOFF_ACCESS_REVOKED'; end if;

  select e.* into _entitlement
  from public.leah_workspace_entitlements e
  where e.workspace_id = _ticket.workspace_id;
  if not found
     or _entitlement.status not in ('trial','active','grace')
     or (_entitlement.valid_until is not null and _entitlement.valid_until <= _now) then
    raise exception 'LEAH_HANDOFF_ENTITLEMENT_INACTIVE';
  end if;

  update public.leah_handoff_tickets
  set consumed_at = _now
  where id = _ticket.id and workspace_id = _ticket.workspace_id;

  insert into public.leah_access_sessions(
    workspace_id, user_id, token_hash, expires_at
  ) values (
    _ticket.workspace_id, _ticket.user_id, _session_token_hash, _session_expires_at
  ) returning id into _session_id;

  return jsonb_build_object(
    'session_id', _session_id,
    'workspace_id', _ticket.workspace_id,
    'user_id', _ticket.user_id,
    'role', _role,
    'expires_at', _session_expires_at,
    'limits', jsonb_build_object(
      'concurrency', _entitlement.concurrency_limit,
      'included_monthly_tokens', _entitlement.included_monthly_tokens,
      'storage_bytes', _entitlement.storage_bytes_limit
    )
  );
end;
$$;

revoke all on function public.leah_redeem_handoff(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.leah_redeem_handoff(text, text, timestamptz) to service_role;
