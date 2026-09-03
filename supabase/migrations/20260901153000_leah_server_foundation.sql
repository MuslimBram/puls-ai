-- LEAH AI OS server foundation.
-- First-party Pulse add-on: workspace is authoritative; browser state is never authoritative.

create table public.leah_workspace_entitlements (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  status text not null check (status in ('trial','active','grace','suspended','cancelled')),
  source text not null default 'manual',
  valid_until timestamptz null,
  concurrency_limit integer not null default 1 check (concurrency_limit between 1 and 128),
  included_monthly_tokens bigint not null default 0 check (included_monthly_tokens >= 0),
  storage_bytes_limit bigint not null default 0 check (storage_bytes_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leah_access_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  last_used_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index leah_access_sessions_lookup_idx
  on public.leah_access_sessions(token_hash, expires_at)
  where revoked_at is null;
create index leah_access_sessions_workspace_user_idx
  on public.leah_access_sessions(workspace_id, user_id, created_at desc);

create table public.leah_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null check (length(slug) between 1 and 140),
  description text not null default '',
  goal text not null default '',
  status text not null default 'planning'
    check (status in ('planning','building','ready','deployed','failed','archived')),
  version integer not null default 1 check (version >= 1),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (id, workspace_id),
  unique (workspace_id, slug)
);

create table public.leah_project_artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  kind text not null check (length(trim(kind)) between 1 and 80),
  path text not null check (length(trim(path)) between 1 and 500),
  content text not null default '',
  content_hash text null,
  storage_ref text null,
  version integer not null default 1 check (version >= 1),
  supersedes_id uuid null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, project_id, path, version),
  constraint leah_artifact_project_fk foreign key (project_id, workspace_id)
    references public.leah_projects(id, workspace_id) on delete cascade,
  constraint leah_artifact_supersedes_fk foreign key (supersedes_id, workspace_id)
    references public.leah_project_artifacts(id, workspace_id) on delete set null
);
create index leah_project_artifacts_project_idx
  on public.leah_project_artifacts(workspace_id, project_id, created_at desc);

create table public.leah_executions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  requested_by uuid not null,
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','cancelled')),
  idempotency_key text null,
  attempt integer not null default 1 check (attempt >= 1),
  input jsonb not null default '{}'::jsonb,
  error_code text null,
  error_detail jsonb null,
  started_at timestamptz null,
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (id, project_id, workspace_id),
  constraint leah_execution_project_fk foreign key (project_id, workspace_id)
    references public.leah_projects(id, workspace_id) on delete cascade
);
create unique index leah_executions_idempotency_uq
  on public.leah_executions(workspace_id, idempotency_key)
  where idempotency_key is not null;
create index leah_executions_project_idx
  on public.leah_executions(workspace_id, project_id, created_at desc);

create table public.leah_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  execution_id uuid not null,
  project_id uuid not null,
  seq integer not null check (seq >= 0),
  priority integer not null default 100,
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','cancelled','retry_wait')),
  input jsonb not null default '{}'::jsonb,
  output jsonb null,
  error jsonb null,
  attempt integer not null default 0 check (attempt >= 0),
  available_at timestamptz not null default now(),
  started_at timestamptz null,
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, execution_id, seq),
  constraint leah_task_execution_project_fk foreign key (execution_id, project_id, workspace_id)
    references public.leah_executions(id, project_id, workspace_id) on delete cascade
);
create index leah_tasks_queue_idx
  on public.leah_tasks(workspace_id, status, priority, available_at, seq);

create table public.leah_execution_context (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  execution_id uuid not null,
  role text not null,
  content text not null,
  seq integer not null check (seq >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, execution_id, seq),
  constraint leah_context_execution_fk foreign key (execution_id, workspace_id)
    references public.leah_executions(id, workspace_id) on delete cascade
);
create index leah_execution_context_expiry_idx on public.leah_execution_context(expires_at);

create table public.leah_project_memory (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  key text not null check (length(trim(key)) between 1 and 200),
  value jsonb not null,
  version integer not null default 1 check (version >= 1),
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, project_id, key),
  constraint leah_project_memory_project_fk foreign key (project_id, workspace_id)
    references public.leah_projects(id, workspace_id) on delete cascade
);

create table public.leah_preferences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid null,
  scope text not null check (length(trim(scope)) between 1 and 80),
  key text not null check (length(trim(key)) between 1 and 200),
  value jsonb not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index leah_preferences_scope_uq
  on public.leah_preferences(workspace_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), scope, key);

-- Semantic memory is explicitly non-vector in this phase. Rows stay pending until a
-- real vector provider/pgvector adapter is certified; no fake embeddings are stored.
create table public.leah_semantic_memory (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  source_ref text not null,
  chunk text not null,
  provider text null,
  provider_ref text null,
  embedding_ref text null,
  status text not null default 'pending' check (status in ('pending','embedded','failed')),
  metadata jsonb not null default '{}'::jsonb,
  error jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  constraint leah_semantic_memory_project_fk foreign key (project_id, workspace_id)
    references public.leah_projects(id, workspace_id) on delete cascade
);
create index leah_semantic_memory_project_idx
  on public.leah_semantic_memory(workspace_id, project_id, status, created_at desc);

-- Only metadata lives here. Secret material remains in Supabase Vault.
create table public.leah_secret_registry (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  alias text not null check (alias ~ '^[A-Za-z0-9._-]{1,100}$'),
  provider text not null check (length(trim(provider)) between 1 and 100),
  vault_ref_id uuid null references public.vault_secret_refs(id) on delete set null,
  hint text not null,
  status text not null default 'active' check (status in ('active','rotated','revoked')),
  version integer not null default 1 check (version >= 1),
  rotated_from uuid null references public.leah_secret_registry(id) on delete set null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null,
  unique (id, workspace_id)
);
create unique index leah_secret_registry_active_alias_uq
  on public.leah_secret_registry(workspace_id, alias)
  where status = 'active';

create table public.leah_secret_access_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  secret_id uuid not null,
  execution_id uuid null,
  actor_id uuid not null,
  action text not null check (action in ('create','use','rotate','revoke','denied')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint leah_secret_access_secret_fk foreign key (secret_id, workspace_id)
    references public.leah_secret_registry(id, workspace_id) on delete cascade,
  constraint leah_secret_access_execution_fk foreign key (execution_id, workspace_id)
    references public.leah_executions(id, workspace_id) on delete set null
);
create index leah_secret_access_log_workspace_idx
  on public.leah_secret_access_log(workspace_id, created_at desc);

create table public.leah_usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  execution_id uuid null,
  provider text not null,
  model text not null,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint leah_usage_execution_fk foreign key (execution_id, workspace_id)
    references public.leah_executions(id, workspace_id) on delete set null
);
create index leah_usage_events_workspace_idx
  on public.leah_usage_events(workspace_id, created_at desc);

-- RLS is defense in depth. Browser roles get read-only views of workspace-scoped
-- non-secret state; every mutation is performed by a server function after resolving
-- a LEAH session to a workspace.
alter table public.leah_workspace_entitlements enable row level security;
alter table public.leah_workspace_entitlements force row level security;
alter table public.leah_access_sessions enable row level security;
alter table public.leah_access_sessions force row level security;
alter table public.leah_projects enable row level security;
alter table public.leah_projects force row level security;
alter table public.leah_project_artifacts enable row level security;
alter table public.leah_project_artifacts force row level security;
alter table public.leah_executions enable row level security;
alter table public.leah_executions force row level security;
alter table public.leah_tasks enable row level security;
alter table public.leah_tasks force row level security;
alter table public.leah_execution_context enable row level security;
alter table public.leah_execution_context force row level security;
alter table public.leah_project_memory enable row level security;
alter table public.leah_project_memory force row level security;
alter table public.leah_preferences enable row level security;
alter table public.leah_preferences force row level security;
alter table public.leah_semantic_memory enable row level security;
alter table public.leah_semantic_memory force row level security;
alter table public.leah_secret_registry enable row level security;
alter table public.leah_secret_registry force row level security;
alter table public.leah_secret_access_log enable row level security;
alter table public.leah_secret_access_log force row level security;
alter table public.leah_usage_events enable row level security;
alter table public.leah_usage_events force row level security;

create policy leah_entitlements_read on public.leah_workspace_entitlements
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin']::text[]));
create policy leah_projects_read on public.leah_projects
  for select to authenticated using (public.has_workspace_access(workspace_id));
create policy leah_artifacts_read on public.leah_project_artifacts
  for select to authenticated using (public.has_workspace_access(workspace_id));
create policy leah_executions_read on public.leah_executions
  for select to authenticated using (public.has_workspace_access(workspace_id));
create policy leah_tasks_read on public.leah_tasks
  for select to authenticated using (public.has_workspace_access(workspace_id));
create policy leah_context_read on public.leah_execution_context
  for select to authenticated using (public.has_workspace_access(workspace_id));
create policy leah_project_memory_read on public.leah_project_memory
  for select to authenticated using (public.has_workspace_access(workspace_id));
create policy leah_preferences_read on public.leah_preferences
  for select to authenticated using (public.has_workspace_access(workspace_id));
create policy leah_semantic_memory_read on public.leah_semantic_memory
  for select to authenticated using (public.has_workspace_access(workspace_id));
create policy leah_secret_registry_read on public.leah_secret_registry
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin']::text[]));
create policy leah_secret_access_log_read on public.leah_secret_access_log
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin']::text[]));
create policy leah_usage_events_read on public.leah_usage_events
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin']::text[]));

revoke all on public.leah_workspace_entitlements, public.leah_access_sessions,
  public.leah_projects, public.leah_project_artifacts, public.leah_executions,
  public.leah_tasks, public.leah_execution_context, public.leah_project_memory,
  public.leah_preferences, public.leah_semantic_memory, public.leah_secret_registry,
  public.leah_secret_access_log, public.leah_usage_events from public, anon, authenticated;

grant select on public.leah_workspace_entitlements, public.leah_projects,
  public.leah_project_artifacts, public.leah_executions, public.leah_tasks,
  public.leah_execution_context, public.leah_project_memory, public.leah_preferences,
  public.leah_semantic_memory, public.leah_secret_registry, public.leah_secret_access_log,
  public.leah_usage_events to authenticated;

grant all on public.leah_workspace_entitlements, public.leah_access_sessions,
  public.leah_projects, public.leah_project_artifacts, public.leah_executions,
  public.leah_tasks, public.leah_execution_context, public.leah_project_memory,
  public.leah_preferences, public.leah_semantic_memory, public.leah_secret_registry,
  public.leah_secret_access_log, public.leah_usage_events to service_role;

-- Service-only Vault functions. No function returns secret plaintext to browser roles.
create or replace function public.leah_vault_create(
  _workspace_id uuid,
  _user_id uuid,
  _alias text,
  _provider text,
  _secret_value text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _vault_id uuid;
  _vault_name text;
  _vault_ref_id uuid;
  _registry_id uuid;
  _hint text;
begin
  if not public.has_workspace_role_for_user(_user_id, _workspace_id, array['owner','admin']::text[]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if _alias is null or _alias !~ '^[A-Za-z0-9._-]{1,100}$' then
    raise exception 'Invalid secret alias';
  end if;
  if _provider is null or length(trim(_provider)) < 1 then
    raise exception 'Provider is required';
  end if;
  if _secret_value is null or length(_secret_value) < 4 then
    raise exception 'Secret value is required';
  end if;

  _vault_name := 'leah_' || _workspace_id::text || '_' || _alias || '_' ||
    encode(extensions.gen_random_bytes(8), 'hex');
  _hint := case when length(_secret_value) <= 4 then '••••' else '••••' || right(_secret_value, 4) end;

  select vault.create_secret(_secret_value, _vault_name, 'LEAH ' || _provider || ' / ' || _alias)
    into _vault_id;

  insert into public.vault_secret_refs(workspace_id, integration_key, label, vault_secret_name, created_by)
  values (_workspace_id, 'leah:' || _alias, 'LEAH ' || _provider, _vault_name, _user_id)
  returning id into _vault_ref_id;

  insert into public.leah_secret_registry(workspace_id, alias, provider, vault_ref_id, hint, created_by)
  values (_workspace_id, _alias, _provider, _vault_ref_id, _hint, _user_id)
  returning id into _registry_id;

  insert into public.leah_secret_access_log(workspace_id, secret_id, actor_id, action)
  values (_workspace_id, _registry_id, _user_id, 'create');

  return jsonb_build_object(
    'id', _registry_id,
    'alias', _alias,
    'provider', _provider,
    'hint', _hint,
    'status', 'active',
    'version', 1
  );
end;
$$;

create or replace function public.leah_vault_read_for_runtime(
  _workspace_id uuid,
  _user_id uuid,
  _secret_id uuid,
  _execution_id uuid default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  _secret public.leah_secret_registry%rowtype;
  _vault_name text;
  _value text;
begin
  if not public.has_workspace_role_for_user(_user_id, _workspace_id, array['owner','admin','member']::text[]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select * into _secret
  from public.leah_secret_registry
  where id = _secret_id and workspace_id = _workspace_id and status = 'active'
  for update;
  if not found or _secret.vault_ref_id is null then
    raise exception 'Secret unavailable' using errcode = '42501';
  end if;

  select vault_secret_name into _vault_name
  from public.vault_secret_refs
  where id = _secret.vault_ref_id and workspace_id = _workspace_id;
  if _vault_name is null then
    raise exception 'Secret unavailable' using errcode = '42501';
  end if;

  select decrypted_secret into _value
  from vault.decrypted_secrets
  where name = _vault_name
  limit 1;
  if _value is null then
    raise exception 'Secret unavailable' using errcode = '42501';
  end if;

  insert into public.leah_secret_access_log(workspace_id, secret_id, execution_id, actor_id, action)
  values (_workspace_id, _secret_id, _execution_id, _user_id, 'use');
  return _value;
end;
$$;

create or replace function public.leah_vault_rotate(
  _workspace_id uuid,
  _user_id uuid,
  _secret_id uuid,
  _secret_value text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _old public.leah_secret_registry%rowtype;
  _old_vault_name text;
  _new_vault_name text;
  _new_vault_id uuid;
  _new_ref_id uuid;
  _new_registry_id uuid;
  _hint text;
begin
  if not public.has_workspace_role_for_user(_user_id, _workspace_id, array['owner','admin']::text[]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if _secret_value is null or length(_secret_value) < 4 then
    raise exception 'Secret value is required';
  end if;

  select * into _old
  from public.leah_secret_registry
  where id = _secret_id and workspace_id = _workspace_id and status = 'active'
  for update;
  if not found or _old.vault_ref_id is null then
    raise exception 'Secret unavailable' using errcode = '42501';
  end if;

  select vault_secret_name into _old_vault_name
  from public.vault_secret_refs
  where id = _old.vault_ref_id and workspace_id = _workspace_id;

  _new_vault_name := 'leah_' || _workspace_id::text || '_' || _old.alias || '_' ||
    encode(extensions.gen_random_bytes(8), 'hex');
  _hint := case when length(_secret_value) <= 4 then '••••' else '••••' || right(_secret_value, 4) end;

  select vault.create_secret(_secret_value, _new_vault_name, 'LEAH ' || _old.provider || ' / ' || _old.alias)
    into _new_vault_id;
  insert into public.vault_secret_refs(workspace_id, integration_key, label, vault_secret_name, created_by)
  values (_workspace_id, 'leah:' || _old.alias, 'LEAH ' || _old.provider, _new_vault_name, _user_id)
  returning id into _new_ref_id;

  update public.leah_secret_registry
    set status = 'rotated', revoked_at = now()
    where id = _old.id;

  insert into public.leah_secret_registry(
    workspace_id, alias, provider, vault_ref_id, hint, status, version, rotated_from, created_by
  ) values (
    _workspace_id, _old.alias, _old.provider, _new_ref_id, _hint, 'active', _old.version + 1, _old.id, _user_id
  ) returning id into _new_registry_id;

  insert into public.leah_secret_access_log(workspace_id, secret_id, actor_id, action,
    metadata)
  values (_workspace_id, _new_registry_id, _user_id, 'rotate',
    jsonb_build_object('rotated_from', _old.id));

  if _old_vault_name is not null then
    delete from vault.secrets where name = _old_vault_name;
  end if;
  delete from public.vault_secret_refs where id = _old.vault_ref_id;

  return jsonb_build_object(
    'id', _new_registry_id,
    'alias', _old.alias,
    'provider', _old.provider,
    'hint', _hint,
    'status', 'active',
    'version', _old.version + 1
  );
end;
$$;

create or replace function public.leah_vault_revoke(
  _workspace_id uuid,
  _user_id uuid,
  _secret_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _secret public.leah_secret_registry%rowtype;
  _vault_name text;
begin
  if not public.has_workspace_role_for_user(_user_id, _workspace_id, array['owner','admin']::text[]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select * into _secret
  from public.leah_secret_registry
  where id = _secret_id and workspace_id = _workspace_id and status = 'active'
  for update;
  if not found then
    return false;
  end if;

  if _secret.vault_ref_id is not null then
    select vault_secret_name into _vault_name
    from public.vault_secret_refs
    where id = _secret.vault_ref_id and workspace_id = _workspace_id;
    if _vault_name is not null then
      delete from vault.secrets where name = _vault_name;
    end if;
    delete from public.vault_secret_refs where id = _secret.vault_ref_id;
  end if;

  update public.leah_secret_registry
  set status = 'revoked', revoked_at = now()
  where id = _secret.id;

  insert into public.leah_secret_access_log(workspace_id, secret_id, actor_id, action)
  values (_workspace_id, _secret.id, _user_id, 'revoke');
  return true;
end;
$$;

revoke all on function public.leah_vault_create(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.leah_vault_read_for_runtime(uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.leah_vault_rotate(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.leah_vault_revoke(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.leah_vault_create(uuid,uuid,text,text,text) to service_role;
grant execute on function public.leah_vault_read_for_runtime(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.leah_vault_rotate(uuid,uuid,uuid,text) to service_role;
grant execute on function public.leah_vault_revoke(uuid,uuid,uuid) to service_role;
