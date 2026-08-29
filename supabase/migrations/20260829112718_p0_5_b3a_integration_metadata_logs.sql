begin;

lock table public.media_provider_settings, public.integration_event_logs, public.connection_logs in share row exclusive mode;

alter table public.integration_event_logs
  add column if not exists workspace_id uuid;
alter table public.connection_logs
  add column if not exists workspace_id uuid;

-- Resolve integration-event ownership from canonical parents first, then from the
-- already persisted workspace metadata used by Telegram. Never guess by user_id.
update public.integration_event_logs l
set workspace_id = coalesce(
  (select ei.workspace_id from public.external_integrations ei where ei.id = l.integration_id),
  (select uc.workspace_id from public.unified_connections uc where uc.id = l.connection_id),
  case
    when coalesce(l.metadata->>'workspace_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (l.metadata->>'workspace_id')::uuid
    else null
  end
)
where l.workspace_id is null;

update public.connection_logs l
set workspace_id = coalesce(
  (select uc.workspace_id from public.unified_connections uc where uc.id = l.connection_id),
  case
    when coalesce(l.metadata->>'workspace_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (l.metadata->>'workspace_id')::uuid
    else null
  end
)
where l.workspace_id is null;

do $$
begin
  if exists (select 1 from public.integration_event_logs where workspace_id is null) then
    raise exception 'Cannot harden integration_event_logs: unresolved workspace rows remain';
  end if;
  if exists (select 1 from public.connection_logs where workspace_id is null) then
    raise exception 'Cannot harden connection_logs: unresolved workspace rows remain';
  end if;

  if exists (
    select 1
    from public.integration_event_logs l
    join public.external_integrations ei on ei.id = l.integration_id
    where ei.workspace_id <> l.workspace_id
  ) then
    raise exception 'Cannot harden integration_event_logs: external integration workspace mismatch';
  end if;

  if exists (
    select 1
    from public.integration_event_logs l
    join public.unified_connections uc on uc.id = l.connection_id
    where uc.workspace_id <> l.workspace_id
  ) then
    raise exception 'Cannot harden integration_event_logs: connection workspace mismatch';
  end if;

  if exists (
    select 1
    from public.connection_logs l
    join public.unified_connections uc on uc.id = l.connection_id
    where uc.workspace_id <> l.workspace_id
  ) then
    raise exception 'Cannot harden connection_logs: connection workspace mismatch';
  end if;

  if exists (
    select 1
    from public.integration_event_logs l
    where coalesce(l.metadata->>'workspace_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (l.metadata->>'workspace_id')::uuid <> l.workspace_id
  ) then
    raise exception 'Cannot harden integration_event_logs: metadata workspace mismatch';
  end if;

  if exists (
    select 1
    from public.connection_logs l
    where coalesce(l.metadata->>'workspace_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (l.metadata->>'workspace_id')::uuid <> l.workspace_id
  ) then
    raise exception 'Cannot harden connection_logs: metadata workspace mismatch';
  end if;
end
$$;

-- Rollout compatibility: the currently deployed Telegram writer already includes
-- workspace_id in metadata, but not yet as a top-level column. These invoker
-- triggers materialize and validate workspace identity before NOT NULL enforcement,
-- so inbound events remain safe during the short function-deploy transition.
create or replace function public.resolve_integration_event_log_workspace()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  integration_workspace uuid;
  connection_workspace uuid;
  metadata_workspace uuid;
  resolved_workspace uuid;
begin
  if new.integration_id is not null then
    select workspace_id into integration_workspace
    from public.external_integrations
    where id = new.integration_id;
  end if;

  if new.connection_id is not null then
    select workspace_id into connection_workspace
    from public.unified_connections
    where id = new.connection_id;
  end if;

  if coalesce(new.metadata->>'workspace_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    metadata_workspace := (new.metadata->>'workspace_id')::uuid;
  end if;

  resolved_workspace := coalesce(new.workspace_id, integration_workspace, connection_workspace, metadata_workspace);
  if resolved_workspace is null then
    raise exception 'integration_event_logs workspace_id is required';
  end if;
  if integration_workspace is not null and integration_workspace <> resolved_workspace then
    raise exception 'integration_event_logs external integration workspace mismatch';
  end if;
  if connection_workspace is not null and connection_workspace <> resolved_workspace then
    raise exception 'integration_event_logs connection workspace mismatch';
  end if;
  if metadata_workspace is not null and metadata_workspace <> resolved_workspace then
    raise exception 'integration_event_logs metadata workspace mismatch';
  end if;

  new.workspace_id := resolved_workspace;
  return new;
end
$$;

create or replace function public.resolve_connection_log_workspace()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  connection_workspace uuid;
  metadata_workspace uuid;
  resolved_workspace uuid;
begin
  if new.connection_id is not null then
    select workspace_id into connection_workspace
    from public.unified_connections
    where id = new.connection_id;
  end if;

  if coalesce(new.metadata->>'workspace_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    metadata_workspace := (new.metadata->>'workspace_id')::uuid;
  end if;

  resolved_workspace := coalesce(new.workspace_id, connection_workspace, metadata_workspace);
  if resolved_workspace is null then
    raise exception 'connection_logs workspace_id is required';
  end if;
  if connection_workspace is not null and connection_workspace <> resolved_workspace then
    raise exception 'connection_logs connection workspace mismatch';
  end if;
  if metadata_workspace is not null and metadata_workspace <> resolved_workspace then
    raise exception 'connection_logs metadata workspace mismatch';
  end if;

  new.workspace_id := resolved_workspace;
  return new;
end
$$;

drop trigger if exists trg_resolve_integration_event_log_workspace on public.integration_event_logs;
create trigger trg_resolve_integration_event_log_workspace
before insert or update of workspace_id, integration_id, connection_id, metadata
on public.integration_event_logs
for each row execute function public.resolve_integration_event_log_workspace();

drop trigger if exists trg_resolve_connection_log_workspace on public.connection_logs;
create trigger trg_resolve_connection_log_workspace
before insert or update of workspace_id, connection_id, metadata
on public.connection_logs
for each row execute function public.resolve_connection_log_workspace();

revoke all on function public.resolve_integration_event_log_workspace() from public, anon, authenticated;
revoke all on function public.resolve_connection_log_workspace() from public, anon, authenticated;
grant execute on function public.resolve_integration_event_log_workspace() to service_role;
grant execute on function public.resolve_connection_log_workspace() to service_role;

alter table public.integration_event_logs alter column workspace_id set not null;
alter table public.connection_logs alter column workspace_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.integration_event_logs'::regclass
      and conname = 'integration_event_logs_workspace_id_fkey'
  ) then
    alter table public.integration_event_logs
      add constraint integration_event_logs_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.connection_logs'::regclass
      and conname = 'connection_logs_workspace_id_fkey'
  ) then
    alter table public.connection_logs
      add constraint connection_logs_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces(id) on delete cascade;
  end if;
end
$$;

create index if not exists idx_integration_event_logs_workspace_created
  on public.integration_event_logs(workspace_id, created_at desc);
create index if not exists idx_connection_logs_workspace_created
  on public.connection_logs(workspace_id, created_at desc);

-- These logs may contain provider payload/metadata. Browser access is replaced by
-- the authenticated workspace Edge Function, which returns a sanitized projection.
drop policy if exists "Admins can view all integration_event_logs" on public.integration_event_logs;
drop policy if exists "Users can insert own integration_event_logs" on public.integration_event_logs;
drop policy if exists "Users can view own integration_event_logs" on public.integration_event_logs;

drop policy if exists "Admins view all connection logs" on public.connection_logs;
drop policy if exists "Users insert own connection logs" on public.connection_logs;
drop policy if exists "Users view own connection logs" on public.connection_logs;

revoke all privileges on table public.integration_event_logs from public, anon, authenticated, sandbox_exec;
revoke all privileges on table public.connection_logs from public, anon, authenticated, sandbox_exec;

revoke all privileges on table public.integration_event_logs from service_role;
grant select, insert, update, delete on table public.integration_event_logs to service_role;
revoke all privileges on table public.connection_logs from service_role;
grant select, insert, update, delete on table public.connection_logs to service_role;

-- Provider settings are global platform metadata. They must never be a browser
-- credential transport. Platform admins manage them through the existing
-- manage-media-provider-credentials Edge Function.
drop policy if exists "Admins can delete media provider settings" on public.media_provider_settings;
drop policy if exists "Admins can insert media provider settings" on public.media_provider_settings;
drop policy if exists "Admins can update media provider settings" on public.media_provider_settings;
drop policy if exists "Admins can view media provider settings" on public.media_provider_settings;

revoke all privileges on table public.media_provider_settings from public, anon, authenticated, sandbox_exec;
revoke all privileges on table public.media_provider_settings from service_role;
grant select, insert, update, delete on table public.media_provider_settings to service_role;

commit;
