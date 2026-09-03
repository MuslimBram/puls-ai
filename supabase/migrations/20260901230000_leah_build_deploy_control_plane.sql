-- MR8D — LEAH Build / Deploy / Developer Hub control plane.
-- This migration authorizes and records build/deploy work. It deliberately does
-- not execute arbitrary shell commands or accept caller-controlled provider URLs.

create table public.leah_deployment_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  provider text not null check (provider in ('vercel','cloudflare_pages')),
  environment text not null check (environment in ('preview','production')),
  provider_project_ref text not null check (provider_project_ref ~ '^[A-Za-z0-9._:-]{1,200}$'),
  provider_account_ref text null check (provider_account_ref is null or provider_account_ref ~ '^[A-Za-z0-9._:-]{1,200}$'),
  credential_secret_id uuid null,
  status text not null default 'disabled' check (status in ('active','disabled')),
  version integer not null default 1 check (version >= 1),
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, workspace_id),
  unique (workspace_id, project_id, name),
  constraint leah_deployment_target_project_fk
    foreign key (project_id, workspace_id)
    references public.leah_projects(id, workspace_id) on delete cascade,
  constraint leah_deployment_target_secret_fk
    foreign key (credential_secret_id, workspace_id)
    references public.leah_secret_registry(id, workspace_id) on delete set null (credential_secret_id),
  constraint leah_deployment_target_provider_shape_ck check (
    (provider='vercel')
    or (provider='cloudflare_pages' and provider_account_ref is not null)
  ),
  constraint leah_deployment_target_active_credential_ck check (
    status <> 'active' or credential_secret_id is not null
  )
);
create index leah_deployment_targets_project_idx
  on public.leah_deployment_targets(workspace_id, project_id, environment, status, name);

create table public.leah_builds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  execution_id uuid not null,
  task_id uuid not null,
  authority_lease_hash text not null check (authority_lease_hash ~ '^[0-9a-f]{64}$'),
  build_key text not null check (length(build_key) between 1 and 200),
  status text not null default 'building'
    check (status in ('building','succeeded','failed','unknown','cancelled')),
  source_manifest jsonb not null,
  source_manifest_hash text not null check (source_manifest_hash ~ '^[0-9a-f]{64}$'),
  builder text not null check (length(trim(builder)) between 1 and 100),
  builder_version text null check (builder_version is null or length(builder_version) between 1 and 100),
  output_digest text null check (output_digest is null or output_digest ~ '^[0-9a-f]{64}$'),
  output_metadata jsonb not null default '{}'::jsonb,
  error_code text null check (error_code is null or length(error_code) between 1 and 120),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, workspace_id),
  unique (id, project_id, workspace_id),
  unique (workspace_id, project_id, build_key),
  constraint leah_build_execution_fk
    foreign key (execution_id, project_id, workspace_id)
    references public.leah_executions(id, project_id, workspace_id) on delete cascade,
  constraint leah_build_task_fk
    foreign key (task_id, execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id) on delete cascade,
  constraint leah_build_completion_ck check (
    (status='building' and completed_at is null and output_digest is null)
    or (status='succeeded' and completed_at is not null and output_digest is not null and error_code is null)
    or (status in ('failed','unknown','cancelled') and completed_at is not null and output_digest is null)
  ),
  constraint leah_build_manifest_size_ck check (octet_length(source_manifest::text) <= 262144),
  constraint leah_build_output_metadata_size_ck check (octet_length(output_metadata::text) <= 131072)
);
create index leah_builds_project_idx
  on public.leah_builds(workspace_id, project_id, created_at desc);
create index leah_builds_execution_idx
  on public.leah_builds(workspace_id, execution_id, created_at desc);

create table public.leah_build_source_artifacts (
  build_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  artifact_id uuid not null,
  artifact_version integer not null check (artifact_version >= 1),
  artifact_path text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null default 0 check (byte_size >= 0),
  primary key (build_id, artifact_id),
  constraint leah_build_source_build_fk
    foreign key (build_id, project_id, workspace_id)
    references public.leah_builds(id, project_id, workspace_id) on delete cascade,
  constraint leah_build_source_artifact_fk
    foreign key (artifact_id, workspace_id)
    references public.leah_project_artifacts(id, workspace_id) on delete restrict
);
create index leah_build_source_artifacts_artifact_idx
  on public.leah_build_source_artifacts(workspace_id, project_id, artifact_id);

create table public.leah_deployments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  build_id uuid not null,
  target_id uuid not null,
  target_version integer not null check (target_version >= 1),
  provider text not null check (provider in ('vercel','cloudflare_pages')),
  environment text not null check (environment in ('preview','production')),
  provider_project_ref text not null,
  provider_account_ref text null,
  credential_secret_id uuid not null,
  request_key text not null check (length(request_key) between 1 and 200),
  requested_execution_id uuid not null,
  requested_task_id uuid not null,
  requested_by uuid not null,
  status text not null
    check (status in ('awaiting_approval','queued','deploying','succeeded','failed','unknown','cancelled')),
  approval_build_digest text null check (approval_build_digest is null or approval_build_digest ~ '^[0-9a-f]{64}$'),
  approved_by uuid null,
  approved_at timestamptz null,
  rejected_by uuid null,
  rejected_at timestamptz null,
  executor_execution_id uuid null,
  executor_task_id uuid null,
  authority_lease_hash text null check (authority_lease_hash is null or authority_lease_hash ~ '^[0-9a-f]{64}$'),
  deployment_reservation_id uuid null,
  operation_nonce uuid null,
  provider_ref text null check (provider_ref is null or length(provider_ref) between 1 and 500),
  public_url text null check (public_url is null or public_url ~ '^https://[^[:space:]@]+$'),
  cost_micros bigint null check (cost_micros is null or cost_micros >= 0),
  error_code text null check (error_code is null or length(error_code) between 1 and 120),
  started_at timestamptz null,
  completed_at timestamptz null,
  unknown_since timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, workspace_id),
  unique (workspace_id, project_id, request_key),
  constraint leah_deployment_project_fk
    foreign key (project_id, workspace_id)
    references public.leah_projects(id, workspace_id) on delete cascade,
  constraint leah_deployment_build_fk
    foreign key (build_id, project_id, workspace_id)
    references public.leah_builds(id, project_id, workspace_id) on delete restrict,
  constraint leah_deployment_target_fk
    foreign key (target_id, workspace_id)
    references public.leah_deployment_targets(id, workspace_id) on delete restrict,
  constraint leah_deployment_credential_fk
    foreign key (credential_secret_id, workspace_id)
    references public.leah_secret_registry(id, workspace_id) on delete restrict,
  constraint leah_deployment_request_execution_fk
    foreign key (requested_execution_id, project_id, workspace_id)
    references public.leah_executions(id, project_id, workspace_id) on delete cascade,
  constraint leah_deployment_request_task_fk
    foreign key (requested_task_id, requested_execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id) on delete cascade,
  constraint leah_deployment_executor_execution_fk
    foreign key (executor_execution_id, project_id, workspace_id)
    references public.leah_executions(id, project_id, workspace_id) on delete set null (executor_execution_id),
  constraint leah_deployment_executor_task_fk
    foreign key (executor_task_id, executor_execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id) on delete set null (executor_task_id, executor_execution_id),
  constraint leah_deployment_reservation_fk
    foreign key (deployment_reservation_id, workspace_id)
    references public.leah_deployment_reservations(id, workspace_id) on delete set null (deployment_reservation_id),
  constraint leah_deployment_approval_shape_ck check (
    (environment='preview' and approved_by is null and approved_at is null and approval_build_digest is null)
    or
    (environment='production' and (
      (status='awaiting_approval' and approved_by is null and approved_at is null and approval_build_digest is null and rejected_by is null and rejected_at is null)
      or
      (status='cancelled' and (
        (approved_by is null and approved_at is null and approval_build_digest is null)
        or (approved_by is not null and approved_at is not null and approval_build_digest is not null)
      ))
      or
      (status in ('queued','deploying','succeeded','failed','unknown') and approved_by is not null and approved_at is not null and approval_build_digest is not null)
    ))
  ),
  constraint leah_deployment_runtime_shape_ck check (
    (status in ('awaiting_approval','queued','cancelled') and executor_task_id is null and authority_lease_hash is null and deployment_reservation_id is null and operation_nonce is null and started_at is null)
    or
    (status='deploying' and executor_task_id is not null and executor_execution_id is not null and authority_lease_hash is not null and deployment_reservation_id is not null and operation_nonce is not null and started_at is not null and completed_at is null and provider_ref is null)
    or
    (status='succeeded' and executor_task_id is not null and deployment_reservation_id is not null and operation_nonce is not null and provider_ref is not null and completed_at is not null and unknown_since is null and error_code is null)
    or
    (status='failed' and executor_task_id is not null and deployment_reservation_id is not null and operation_nonce is not null and completed_at is not null and provider_ref is null and unknown_since is null)
    or
    (status='unknown' and executor_task_id is not null and deployment_reservation_id is not null and operation_nonce is not null and completed_at is null and unknown_since is not null)
  )
);
create index leah_deployments_project_idx
  on public.leah_deployments(workspace_id, project_id, created_at desc);
create index leah_deployments_status_idx
  on public.leah_deployments(workspace_id, status, created_at desc);
create index leah_deployments_unknown_idx
  on public.leah_deployments(unknown_since)
  where status='unknown';

alter table public.leah_deployment_targets enable row level security;
alter table public.leah_deployment_targets force row level security;
alter table public.leah_builds enable row level security;
alter table public.leah_builds force row level security;
alter table public.leah_build_source_artifacts enable row level security;
alter table public.leah_build_source_artifacts force row level security;
alter table public.leah_deployments enable row level security;
alter table public.leah_deployments force row level security;

revoke all on public.leah_deployment_targets, public.leah_builds,
  public.leah_build_source_artifacts, public.leah_deployments
  from public,anon,authenticated;
grant all on public.leah_deployment_targets, public.leah_builds,
  public.leah_build_source_artifacts, public.leah_deployments
  to service_role;

create or replace function public.leah_deploy_require_task(_task_id uuid,_lease_token uuid)
returns public.leah_tasks
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _task public.leah_tasks%rowtype;
begin
  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions e on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id and t.status='running' and t.lease_token=_lease_token
    and t.lease_expires_at > clock_timestamp() and e.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;
  return _task;
end;
$$;

create or replace function public.leah_save_deployment_target_for_actor(
  _workspace_id uuid,
  _actor_id uuid,
  _project_id uuid,
  _target_id uuid,
  _expected_version integer,
  _name text,
  _provider text,
  _environment text,
  _provider_project_ref text,
  _provider_account_ref text,
  _credential_secret_id uuid,
  _status text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _target public.leah_deployment_targets%rowtype; _secret_provider text;
begin
  if not public.has_workspace_role_for_user(_actor_id,_workspace_id,array['owner','admin']::text[]) then
    raise exception 'Forbidden: LEAH workspace admin required';
  end if;
  if not exists(select 1 from public.leah_projects p where p.id=_project_id and p.workspace_id=_workspace_id and p.archived_at is null) then
    raise exception 'Project not found';
  end if;
  if _name is null or length(trim(_name)) not between 1 and 120 then raise exception 'Invalid deployment target name'; end if;
  if _provider not in ('vercel','cloudflare_pages') then raise exception 'Invalid deployment provider'; end if;
  if _environment not in ('preview','production') then raise exception 'Invalid deployment environment'; end if;
  if _provider_project_ref is null or _provider_project_ref !~ '^[A-Za-z0-9._:-]{1,200}$' then raise exception 'Invalid provider project ref'; end if;
  if _provider_account_ref is not null and _provider_account_ref !~ '^[A-Za-z0-9._:-]{1,200}$' then raise exception 'Invalid provider account ref'; end if;
  if _provider='cloudflare_pages' and _provider_account_ref is null then raise exception 'Cloudflare account ref is required'; end if;
  if _status not in ('active','disabled') then raise exception 'Invalid deployment target status'; end if;
  if _status='active' and _credential_secret_id is null then raise exception 'Active deployment target requires credential'; end if;

  if _credential_secret_id is not null then
    select s.provider into _secret_provider from public.leah_secret_registry s
    where s.id=_credential_secret_id and s.workspace_id=_workspace_id and s.status='active';
    if not found then raise exception 'Deployment credential unavailable'; end if;
    if _provider='vercel' and lower(_secret_provider) <> 'vercel' then raise exception 'Deployment credential provider mismatch'; end if;
    if _provider='cloudflare_pages' and lower(_secret_provider) not in ('cloudflare','cloudflare_pages') then raise exception 'Deployment credential provider mismatch'; end if;
  end if;

  if _target_id is null then
    insert into public.leah_deployment_targets(
      workspace_id,project_id,name,provider,environment,provider_project_ref,provider_account_ref,
      credential_secret_id,status,created_by,updated_by
    ) values (
      _workspace_id,_project_id,trim(_name),_provider,_environment,trim(_provider_project_ref),
      nullif(trim(coalesce(_provider_account_ref,'')),''),_credential_secret_id,_status,_actor_id,_actor_id
    ) returning * into _target;
  else
    if _expected_version is null or _expected_version < 1 then raise exception 'expected_version is required'; end if;
    update public.leah_deployment_targets t
    set name=trim(_name),provider=_provider,environment=_environment,
        provider_project_ref=trim(_provider_project_ref),
        provider_account_ref=nullif(trim(coalesce(_provider_account_ref,'')),''),
        credential_secret_id=_credential_secret_id,status=_status,
        version=t.version+1,updated_by=_actor_id,updated_at=clock_timestamp()
    where t.id=_target_id and t.workspace_id=_workspace_id and t.project_id=_project_id
      and t.version=_expected_version
    returning * into _target;
    if not found then raise exception 'Deployment target version conflict or not found'; end if;
  end if;

  return to_jsonb(_target) - 'credential_secret_id'
    || jsonb_build_object('credential_configured',_target.credential_secret_id is not null);
end;
$$;

create or replace function public.leah_begin_build_for_task(
  _task_id uuid,
  _lease_token uuid,
  _build_key text,
  _artifact_ids uuid[],
  _builder text,
  _builder_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _build public.leah_builds%rowtype;
  _existing public.leah_builds%rowtype;
  _manifest jsonb;
  _manifest_text text;
  _manifest_hash text;
  _source_count integer;
  _distinct_count integer;
  _lease_hash text;
begin
  _task := public.leah_deploy_require_task(_task_id,_lease_token);
  if _build_key is null or length(trim(_build_key)) not between 1 and 200 then raise exception 'Invalid build key'; end if;
  if _artifact_ids is null or cardinality(_artifact_ids) < 1 or cardinality(_artifact_ids) > 200 then raise exception 'Build requires 1-200 source artifacts'; end if;
  if _builder is null or length(trim(_builder)) not between 1 and 100 then raise exception 'Invalid builder'; end if;
  if _builder_version is not null and length(trim(_builder_version)) not between 1 and 100 then raise exception 'Invalid builder version'; end if;

  select count(*),count(distinct a.id),
         jsonb_agg(jsonb_build_object(
           'artifact_id',a.id,'version',a.version,'path',a.path,
           'content_hash',a.content_hash,'byte_size',a.byte_size
         ) order by a.path,a.version,a.id)
  into _source_count,_distinct_count,_manifest
  from public.leah_project_artifacts a
  where a.id=any(_artifact_ids)
    and a.workspace_id=_task.workspace_id
    and a.project_id=_task.project_id
    and a.content_hash ~ '^[0-9a-f]{64}$';
  if _source_count<>cardinality(_artifact_ids) or _distinct_count<>cardinality(_artifact_ids) then
    raise exception 'Build source set contains duplicate, foreign or invalid artifact';
  end if;
  _manifest_text := _manifest::text;
  _manifest_hash := encode(digest(convert_to(_manifest_text,'UTF8'),'sha256'),'hex');
  _lease_hash := encode(digest(convert_to(_lease_token::text,'UTF8'),'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended(_task.workspace_id::text||':'||_task.project_id::text||':'||trim(_build_key),0));
  select b.* into _existing from public.leah_builds b
  where b.workspace_id=_task.workspace_id and b.project_id=_task.project_id and b.build_key=trim(_build_key);
  if found then
    if _existing.source_manifest_hash<>_manifest_hash
       or _existing.builder<>trim(_builder)
       or _existing.builder_version is distinct from nullif(trim(coalesce(_builder_version,'')),'') then
      raise exception 'LEAH_BUILD_IDEMPOTENCY_CONFLICT';
    end if;
    return (to_jsonb(_existing) - 'authority_lease_hash') || jsonb_build_object('idempotent_replay',true);
  end if;

  insert into public.leah_builds(
    workspace_id,project_id,execution_id,task_id,authority_lease_hash,build_key,
    source_manifest,source_manifest_hash,builder,builder_version
  ) values (
    _task.workspace_id,_task.project_id,_task.execution_id,_task.id,_lease_hash,trim(_build_key),
    _manifest,_manifest_hash,trim(_builder),nullif(trim(coalesce(_builder_version,'')),'')
  ) returning * into _build;

  insert into public.leah_build_source_artifacts(
    build_id,workspace_id,project_id,artifact_id,artifact_version,artifact_path,content_hash,byte_size
  )
  select _build.id,a.workspace_id,a.project_id,a.id,a.version,a.path,a.content_hash,a.byte_size
  from public.leah_project_artifacts a
  where a.id=any(_artifact_ids) and a.workspace_id=_task.workspace_id and a.project_id=_task.project_id;

  return (to_jsonb(_build) - 'authority_lease_hash') || jsonb_build_object('idempotent_replay',false);
end;
$$;

create or replace function public.leah_finish_build_for_task(
  _task_id uuid,
  _lease_token uuid,
  _build_id uuid,
  _outcome text,
  _output_digest text,
  _output_metadata jsonb,
  _error_code text
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare _build public.leah_builds%rowtype; _lease_hash text; _metadata jsonb:=coalesce(_output_metadata,'{}'::jsonb);
begin
  if _outcome not in ('succeeded','failed','unknown') then raise exception 'Invalid build outcome'; end if;
  if octet_length(_metadata::text)>131072 then raise exception 'Build output metadata exceeds 128 KB'; end if;
  if _outcome='succeeded' and (_output_digest is null or _output_digest !~ '^[0-9a-f]{64}$') then raise exception 'Successful build requires output digest'; end if;
  if _outcome<>'succeeded' and _output_digest is not null then raise exception 'Non-successful build cannot carry output digest'; end if;
  if _outcome<>'succeeded' and (_error_code is null or length(trim(_error_code)) not between 1 and 120) then raise exception 'Failed or unknown build requires error code'; end if;
  _lease_hash:=encode(digest(convert_to(_lease_token::text,'UTF8'),'sha256'),'hex');

  select b.* into _build from public.leah_builds b
  where b.id=_build_id and b.task_id=_task_id and b.authority_lease_hash=_lease_hash
  for update;
  if not found then raise exception 'Build authority mismatch'; end if;
  if _build.status<>'building' then
    if _build.status=_outcome
       and _build.output_digest is not distinct from _output_digest
       and _build.output_metadata=_metadata
       and _build.error_code is not distinct from nullif(trim(coalesce(_error_code,'')),'') then
      return (to_jsonb(_build)-'authority_lease_hash')||jsonb_build_object('idempotent_replay',true);
    end if;
    raise exception 'LEAH_BUILD_FINALIZE_CONFLICT';
  end if;

  update public.leah_builds b
  set status=_outcome,
      output_digest=case when _outcome='succeeded' then _output_digest else null end,
      output_metadata=_metadata,
      error_code=case when _outcome='succeeded' then null else trim(_error_code) end,
      completed_at=clock_timestamp(),updated_at=clock_timestamp()
  where b.id=_build.id and b.workspace_id=_build.workspace_id
  returning * into _build;
  return (to_jsonb(_build)-'authority_lease_hash')||jsonb_build_object('idempotent_replay',false);
end;
$$;

create or replace function public.leah_request_deployment_for_task(
  _task_id uuid,
  _lease_token uuid,
  _build_id uuid,
  _target_id uuid,
  _request_key text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _build public.leah_builds%rowtype;
  _target public.leah_deployment_targets%rowtype;
  _existing public.leah_deployments%rowtype;
  _row public.leah_deployments%rowtype;
  _requested_by uuid;
  _status text;
begin
  _task:=public.leah_deploy_require_task(_task_id,_lease_token);
  if _request_key is null or length(trim(_request_key)) not between 1 and 200 then raise exception 'Invalid deployment request key'; end if;

  select b.* into _build from public.leah_builds b
  where b.id=_build_id and b.workspace_id=_task.workspace_id and b.project_id=_task.project_id and b.status='succeeded';
  if not found then raise exception 'Deployment requires successful same-project build'; end if;

  select t.* into _target from public.leah_deployment_targets t
  where t.id=_target_id and t.workspace_id=_task.workspace_id and t.project_id=_task.project_id
    and t.status='active' and t.credential_secret_id is not null;
  if not found then raise exception 'Deployment target unavailable'; end if;
  if not exists(select 1 from public.leah_secret_registry s
    where s.id=_target.credential_secret_id and s.workspace_id=_task.workspace_id and s.status='active') then
    raise exception 'Deployment credential unavailable';
  end if;

  select e.requested_by into _requested_by from public.leah_executions e
  where e.id=_task.execution_id and e.workspace_id=_task.workspace_id;
  _status:=case when _target.environment='production' then 'awaiting_approval' else 'queued' end;

  perform pg_advisory_xact_lock(hashtextextended(_task.workspace_id::text||':'||_task.project_id::text||':'||trim(_request_key),0));
  select d.* into _existing from public.leah_deployments d
  where d.workspace_id=_task.workspace_id and d.project_id=_task.project_id and d.request_key=trim(_request_key);
  if found then
    if _existing.build_id<>_build.id or _existing.target_id<>_target.id
       or _existing.target_version<>_target.version or _existing.requested_task_id<>_task.id then
      raise exception 'LEAH_DEPLOYMENT_REQUEST_CONFLICT';
    end if;
    return to_jsonb(_existing)||jsonb_build_object('idempotent_replay',true);
  end if;

  insert into public.leah_deployments(
    workspace_id,project_id,build_id,target_id,target_version,provider,environment,
    provider_project_ref,provider_account_ref,credential_secret_id,request_key,
    requested_execution_id,requested_task_id,requested_by,status
  ) values (
    _task.workspace_id,_task.project_id,_build.id,_target.id,_target.version,_target.provider,_target.environment,
    _target.provider_project_ref,_target.provider_account_ref,_target.credential_secret_id,trim(_request_key),
    _task.execution_id,_task.id,_requested_by,_status
  ) returning * into _row;
  return to_jsonb(_row)||jsonb_build_object('idempotent_replay',false);
end;
$$;

create or replace function public.leah_decide_deployment_for_actor(
  _workspace_id uuid,
  _actor_id uuid,
  _deployment_id uuid,
  _decision text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _row public.leah_deployments%rowtype; _build public.leah_builds%rowtype;
begin
  if _decision not in ('approve','reject') then raise exception 'Invalid deployment decision'; end if;
  if not public.has_workspace_role_for_user(_actor_id,_workspace_id,array['owner','admin']::text[]) then
    raise exception 'Forbidden: LEAH workspace admin required';
  end if;
  select d.* into _row from public.leah_deployments d
  where d.id=_deployment_id and d.workspace_id=_workspace_id and d.environment='production'
    and d.status='awaiting_approval' for update;
  if not found then raise exception 'Production deployment is not awaiting approval'; end if;
  select b.* into _build from public.leah_builds b where b.id=_row.build_id and b.workspace_id=_row.workspace_id and b.status='succeeded';
  if not found then raise exception 'Approved deployment build is no longer successful'; end if;

  if _decision='approve' then
    update public.leah_deployments d
    set status='queued',approved_by=_actor_id,approved_at=clock_timestamp(),
        approval_build_digest=_build.output_digest,updated_at=clock_timestamp()
    where d.id=_row.id and d.workspace_id=_row.workspace_id returning * into _row;
  else
    update public.leah_deployments d
    set status='cancelled',rejected_by=_actor_id,rejected_at=clock_timestamp(),
        error_code='rejected_by_admin',updated_at=clock_timestamp()
    where d.id=_row.id and d.workspace_id=_row.workspace_id returning * into _row;
  end if;
  return to_jsonb(_row);
end;
$$;

create or replace function public.leah_begin_deployment_for_task(
  _task_id uuid,
  _lease_token uuid,
  _deployment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _row public.leah_deployments%rowtype;
  _target public.leah_deployment_targets%rowtype;
  _build public.leah_builds%rowtype;
  _reservation jsonb;
  _reservation_id uuid;
  _lease_hash text;
  _nonce uuid:=gen_random_uuid();
begin
  _task:=public.leah_deploy_require_task(_task_id,_lease_token);
  select d.* into _row from public.leah_deployments d
  where d.id=_deployment_id and d.workspace_id=_task.workspace_id and d.project_id=_task.project_id
  for update;
  if not found then raise exception 'Deployment not found'; end if;
  if _row.status<>'queued' then raise exception 'Deployment is not queued'; end if;

  select b.* into _build from public.leah_builds b
  where b.id=_row.build_id and b.workspace_id=_row.workspace_id and b.project_id=_row.project_id and b.status='succeeded';
  if not found then raise exception 'Deployment build is not successful'; end if;
  if _row.environment='production' and (_row.approved_at is null or _row.approval_build_digest is distinct from _build.output_digest) then
    raise exception 'Production deployment approval missing or stale';
  end if;

  select t.* into _target from public.leah_deployment_targets t
  where t.id=_row.target_id and t.workspace_id=_row.workspace_id and t.project_id=_row.project_id
    and t.version=_row.target_version and t.status='active'
    and t.provider=_row.provider and t.environment=_row.environment
    and t.provider_project_ref=_row.provider_project_ref
    and t.provider_account_ref is not distinct from _row.provider_account_ref
    and t.credential_secret_id=_row.credential_secret_id;
  if not found then raise exception 'Deployment target changed or disabled; re-request required'; end if;
  if not exists(select 1 from public.leah_secret_registry s
    where s.id=_row.credential_secret_id and s.workspace_id=_row.workspace_id and s.status='active') then
    raise exception 'Deployment credential unavailable';
  end if;

  _reservation:=public.leah_reserve_deployment_for_task(
    _task.id,_lease_token,'deploy:'||_row.id::text,_row.provider||':'||_row.environment,900
  );
  _reservation_id:=(_reservation->>'id')::uuid;
  _lease_hash:=encode(digest(convert_to(_lease_token::text,'UTF8'),'sha256'),'hex');

  update public.leah_deployments d
  set status='deploying',executor_execution_id=_task.execution_id,executor_task_id=_task.id,
      authority_lease_hash=_lease_hash,deployment_reservation_id=_reservation_id,
      operation_nonce=_nonce,started_at=clock_timestamp(),updated_at=clock_timestamp()
  where d.id=_row.id and d.workspace_id=_row.workspace_id returning * into _row;

  return jsonb_build_object(
    'deployment_id',_row.id,'operation_nonce',_row.operation_nonce,
    'provider',_row.provider,'environment',_row.environment,
    'provider_project_ref',_row.provider_project_ref,'provider_account_ref',_row.provider_account_ref,
    'credential_secret_id',_row.credential_secret_id,'build_id',_row.build_id,
    'build_output_digest',_build.output_digest,'reservation_id',_reservation_id
  );
end;
$$;

create or replace function public.leah_settle_deployment_for_task(
  _task_id uuid,
  _lease_token uuid,
  _deployment_id uuid,
  _operation_nonce uuid,
  _outcome text,
  _provider_ref text,
  _public_url text,
  _cost_micros bigint,
  _error_code text
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  _row public.leah_deployments%rowtype;
  _lease_hash text;
  _usage jsonb;
  _now timestamptz:=clock_timestamp();
begin
  if _outcome not in ('succeeded','failed','unknown') then raise exception 'Invalid deployment outcome'; end if;
  if _cost_micros is null or _cost_micros<0 then raise exception 'Invalid deployment cost'; end if;
  if _outcome='succeeded' and (_provider_ref is null or length(trim(_provider_ref)) not between 1 and 500) then raise exception 'Successful deployment requires provider ref'; end if;
  if _outcome<>'succeeded' and _provider_ref is not null then raise exception 'Non-successful deployment cannot carry provider ref'; end if;
  if _public_url is not null and _public_url !~ '^https://[^[:space:]@]+$' then raise exception 'Invalid deployment public URL'; end if;
  if _outcome='failed' and (_error_code is null or length(trim(_error_code)) not between 1 and 120) then raise exception 'Failed deployment requires error code'; end if;
  if _outcome='unknown' and (_error_code is null or length(trim(_error_code)) not between 1 and 120) then raise exception 'Unknown deployment requires error code'; end if;

  _lease_hash:=encode(digest(convert_to(_lease_token::text,'UTF8'),'sha256'),'hex');
  select d.* into _row from public.leah_deployments d
  where d.id=_deployment_id and d.executor_task_id=_task_id
    and d.authority_lease_hash=_lease_hash and d.operation_nonce=_operation_nonce
  for update;
  if not found then raise exception 'Deployment settlement authority mismatch'; end if;
  if _row.status<>'deploying' then
    if _row.status=_outcome
       and _row.provider_ref is not distinct from nullif(trim(coalesce(_provider_ref,'')),'')
       and _row.public_url is not distinct from _public_url
       and _row.cost_micros is not distinct from _cost_micros then
      return to_jsonb(_row)||jsonb_build_object('idempotent_replay',true);
    end if;
    raise exception 'LEAH_DEPLOYMENT_SETTLE_CONFLICT';
  end if;

  if _outcome='succeeded' then
    _usage:=public.leah_finalize_deployment_usage(
      _task_id,_lease_token,_row.deployment_reservation_id,trim(_provider_ref),_cost_micros,
      jsonb_build_object('leah_deployment_id',_row.id,'environment',_row.environment,'target_id',_row.target_id)
    );
    update public.leah_deployments d
    set status='succeeded',provider_ref=trim(_provider_ref),public_url=_public_url,cost_micros=_cost_micros,
        error_code=null,completed_at=_now,unknown_since=null,updated_at=_now
    where d.id=_row.id and d.workspace_id=_row.workspace_id returning * into _row;
  elsif _outcome='failed' then
    perform public.leah_release_deployment_reservation(_task_id,_lease_token,_row.deployment_reservation_id);
    update public.leah_deployments d
    set status='failed',provider_ref=null,public_url=null,cost_micros=_cost_micros,
        error_code=trim(_error_code),completed_at=_now,unknown_since=null,updated_at=_now
    where d.id=_row.id and d.workspace_id=_row.workspace_id returning * into _row;
  else
    update public.leah_deployment_reservations r
    set expires_at=greatest(r.expires_at,_now+interval '7 days')
    where r.id=_row.deployment_reservation_id and r.workspace_id=_row.workspace_id and r.status='reserved';
    update public.leah_deployments d
    set status='unknown',provider_ref=null,public_url=null,cost_micros=_cost_micros,
        error_code=trim(_error_code),unknown_since=_now,updated_at=_now
    where d.id=_row.id and d.workspace_id=_row.workspace_id returning * into _row;
  end if;
  return to_jsonb(_row)||jsonb_build_object('idempotent_replay',false,'usage',_usage);
end;
$$;

create or replace function public.leah_reconcile_unknown_deployment(
  _deployment_id uuid,
  _operation_nonce uuid,
  _outcome text,
  _provider_ref text,
  _public_url text,
  _cost_micros bigint,
  _error_code text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  _row public.leah_deployments%rowtype;
  _reservation public.leah_deployment_reservations%rowtype;
  _usage jsonb;
  _now timestamptz:=clock_timestamp();
begin
  if _outcome not in ('succeeded','failed') then raise exception 'Reconciliation outcome must be succeeded or failed'; end if;
  if _cost_micros is null or _cost_micros<0 then raise exception 'Invalid deployment cost'; end if;
  if _outcome='succeeded' and (_provider_ref is null or length(trim(_provider_ref)) not between 1 and 500) then raise exception 'Successful reconciliation requires provider ref'; end if;
  if _outcome='failed' and (_error_code is null or length(trim(_error_code)) not between 1 and 120) then raise exception 'Failed reconciliation requires error code'; end if;
  if _public_url is not null and _public_url !~ '^https://[^[:space:]@]+$' then raise exception 'Invalid deployment public URL'; end if;

  select d.* into _row from public.leah_deployments d
  where d.id=_deployment_id and d.operation_nonce=_operation_nonce and d.status='unknown' for update;
  if not found then raise exception 'Unknown deployment not found for reconciliation'; end if;
  select r.* into _reservation from public.leah_deployment_reservations r
  where r.id=_row.deployment_reservation_id and r.workspace_id=_row.workspace_id for update;
  if not found then raise exception 'Deployment reservation missing during reconciliation'; end if;

  if _outcome='succeeded' then
    _usage:=public.leah_finalize_deployment_usage(
      _row.executor_task_id,_reservation.authority_lease_token,_reservation.id,
      trim(_provider_ref),_cost_micros,
      jsonb_build_object('leah_deployment_id',_row.id,'reconciled',true,'environment',_row.environment)
    );
    update public.leah_deployments d
    set status='succeeded',provider_ref=trim(_provider_ref),public_url=_public_url,cost_micros=_cost_micros,
        error_code=null,completed_at=_now,unknown_since=null,updated_at=_now
    where d.id=_row.id and d.workspace_id=_row.workspace_id returning * into _row;
  else
    perform public.leah_release_deployment_reservation(_row.executor_task_id,_reservation.authority_lease_token,_reservation.id);
    update public.leah_deployments d
    set status='failed',provider_ref=null,public_url=null,cost_micros=_cost_micros,
        error_code=trim(_error_code),completed_at=_now,unknown_since=null,updated_at=_now
    where d.id=_row.id and d.workspace_id=_row.workspace_id returning * into _row;
  end if;
  return to_jsonb(_row)||jsonb_build_object('usage',_usage,'reconciled',true);
end;
$$;

revoke all on function public.leah_deploy_require_task(uuid,uuid) from public,anon,authenticated;
revoke all on function public.leah_save_deployment_target_for_actor(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.leah_begin_build_for_task(uuid,uuid,text,uuid[],text,text) from public,anon,authenticated;
revoke all on function public.leah_finish_build_for_task(uuid,uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.leah_request_deployment_for_task(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.leah_decide_deployment_for_actor(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.leah_begin_deployment_for_task(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.leah_settle_deployment_for_task(uuid,uuid,uuid,uuid,text,text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.leah_reconcile_unknown_deployment(uuid,uuid,text,text,text,bigint,text) from public,anon,authenticated;

grant execute on function public.leah_deploy_require_task(uuid,uuid) to service_role;
grant execute on function public.leah_save_deployment_target_for_actor(uuid,uuid,uuid,uuid,integer,text,text,text,text,text,uuid,text) to service_role;
grant execute on function public.leah_begin_build_for_task(uuid,uuid,text,uuid[],text,text) to service_role;
grant execute on function public.leah_finish_build_for_task(uuid,uuid,uuid,text,text,jsonb,text) to service_role;
grant execute on function public.leah_request_deployment_for_task(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.leah_decide_deployment_for_actor(uuid,uuid,uuid,text) to service_role;
grant execute on function public.leah_begin_deployment_for_task(uuid,uuid,uuid) to service_role;
grant execute on function public.leah_settle_deployment_for_task(uuid,uuid,uuid,uuid,text,text,text,bigint,text) to service_role;
grant execute on function public.leah_reconcile_unknown_deployment(uuid,uuid,text,text,text,bigint,text) to service_role;
