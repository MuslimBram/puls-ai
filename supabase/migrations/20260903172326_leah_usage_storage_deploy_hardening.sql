-- MR5-B hardening: storage and deployment quotas before side effects, plus
-- settlement-safe reservations. No monetary price is introduced.

alter table public.leah_workspace_entitlements
  add column included_monthly_deploys bigint not null default 0
    check (included_monthly_deploys >= 0),
  add column deploy_overage_enabled boolean not null default false,
  add column storage_overage_enabled boolean not null default false;

alter table public.leah_usage_reservations
  add column authority_lease_token uuid null;

-- This table is new in the immediately preceding migration, so no legacy rows should
-- exist during an ordered deployment. Fail closed rather than inventing authority.
do $$
begin
  if exists (select 1 from public.leah_usage_reservations where authority_lease_token is null) then
    raise exception 'LEAH_USAGE_RESERVATION_PRECONDITION: null authority lease token';
  end if;
end;
$$;

alter table public.leah_usage_reservations
  alter column authority_lease_token set not null;

alter table public.leah_project_artifacts
  add column byte_size bigint not null default 0 check (byte_size >= 0);

update public.leah_project_artifacts
set byte_size = octet_length(content)
where byte_size <> octet_length(content);

create table public.leah_deployment_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  execution_id uuid not null,
  task_id uuid not null,
  authority_lease_token uuid not null,
  event_key text not null check (length(event_key) between 1 and 200),
  target text not null check (length(trim(target)) between 1 and 100),
  status text not null default 'reserved' check (status in ('reserved','consumed','released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  finalized_at timestamptz null,
  unique (id, workspace_id),
  unique (workspace_id, event_key),
  constraint leah_deploy_reservation_execution_fk
    foreign key (execution_id, workspace_id)
    references public.leah_executions(id, workspace_id) on delete cascade,
  constraint leah_deploy_reservation_task_fk
    foreign key (task_id, execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id) on delete cascade,
  constraint leah_deploy_reservation_expiry_ck check (expires_at > created_at)
);
create index leah_deployment_reservations_active_idx
  on public.leah_deployment_reservations(workspace_id, expires_at)
  where status='reserved';

alter table public.leah_deployment_reservations enable row level security;
alter table public.leah_deployment_reservations force row level security;
revoke all on public.leah_deployment_reservations from public, anon, authenticated;
grant all on public.leah_deployment_reservations to service_role;

create or replace function public.leah_reap_usage_reservations(_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _tokens integer := 0;
  _deploys integer := 0;
  _now timestamptz := clock_timestamp();
begin
  if _limit < 1 or _limit > 5000 then raise exception 'Invalid reservation reap limit'; end if;

  with expired as (
    select id, workspace_id from public.leah_usage_reservations
    where status='reserved' and expires_at <= _now
    order by expires_at for update skip locked limit _limit
  )
  update public.leah_usage_reservations r
  set status='released', finalized_at=_now
  from expired e
  where r.id=e.id and r.workspace_id=e.workspace_id;
  get diagnostics _tokens = row_count;

  with expired as (
    select id, workspace_id from public.leah_deployment_reservations
    where status='reserved' and expires_at <= _now
    order by expires_at for update skip locked limit _limit
  )
  update public.leah_deployment_reservations r
  set status='released', finalized_at=_now
  from expired e
  where r.id=e.id and r.workspace_id=e.workspace_id;
  get diagnostics _deploys = row_count;

  return jsonb_build_object('token_reservations_released',_tokens,'deployment_reservations_released',_deploys);
end;
$$;

-- Replace token reservation so the exact lease authority that initiated the provider
-- side effect is durably bound to settlement.
create or replace function public.leah_reserve_managed_tokens(
  _task_id uuid,
  _lease_token uuid,
  _event_key text,
  _requested_tokens bigint,
  _ttl_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _ent public.leah_workspace_entitlements%rowtype;
  _existing public.leah_usage_reservations%rowtype;
  _used bigint := 0;
  _reserved bigint := 0;
  _month_start timestamptz;
  _reservation public.leah_usage_reservations%rowtype;
  _now timestamptz := clock_timestamp();
begin
  if _task_id is null or _lease_token is null then raise exception 'Task and lease token are required'; end if;
  if _event_key is null or length(_event_key) < 1 or length(_event_key) > 200 then raise exception 'Invalid usage event key'; end if;
  if _requested_tokens is null or _requested_tokens < 1 or _requested_tokens > 10000000 then raise exception 'Invalid token reservation'; end if;
  if _ttl_seconds < 30 or _ttl_seconds > 900 then raise exception 'Invalid reservation TTL'; end if;

  perform public.leah_reap_usage_reservations(500);

  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions x on x.id=t.execution_id and x.workspace_id=t.workspace_id
  where t.id=_task_id and t.status='running' and t.lease_token=_lease_token
    and t.lease_expires_at > _now and x.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select e.* into _ent from public.leah_workspace_entitlements e
  where e.workspace_id=_task.workspace_id for update;
  if not found or _ent.status not in ('trial','active','grace')
     or (_ent.valid_until is not null and _ent.valid_until <= _now) then
    raise exception 'LEAH entitlement inactive';
  end if;
  if _ent.ai_funding_mode not in ('managed','hybrid') then raise exception 'LEAH_MANAGED_AI_DISABLED'; end if;

  select r.* into _existing from public.leah_usage_reservations r
  where r.workspace_id=_task.workspace_id and r.event_key=_event_key;
  if found then
    if _existing.execution_id <> _task.execution_id or _existing.task_id <> _task.id
       or _existing.requested_tokens <> _requested_tokens
       or _existing.authority_lease_token <> _lease_token then
      raise exception 'LEAH_USAGE_RESERVATION_CONFLICT';
    end if;
    return to_jsonb(_existing) || jsonb_build_object('idempotent_replay',true);
  end if;

  _month_start := date_trunc('month', _now at time zone 'UTC') at time zone 'UTC';
  select coalesce(sum(u.input_tokens+u.output_tokens),0) into _used
  from public.leah_usage_events u
  where u.workspace_id=_task.workspace_id and u.funding_source='managed'
    and u.usage_type='model_tokens' and u.created_at >= _month_start;
  select coalesce(sum(r.requested_tokens),0) into _reserved
  from public.leah_usage_reservations r
  where r.workspace_id=_task.workspace_id and r.status='reserved'
    and r.expires_at > _now and r.created_at >= _month_start;

  if not _ent.metered_overage_enabled
     and (_used + _reserved + _requested_tokens) > _ent.included_monthly_tokens then
    raise exception 'LEAH_TOKEN_QUOTA_EXCEEDED';
  end if;

  insert into public.leah_usage_reservations(
    workspace_id,execution_id,task_id,authority_lease_token,event_key,requested_tokens,expires_at
  ) values (
    _task.workspace_id,_task.execution_id,_task.id,_lease_token,_event_key,_requested_tokens,
    _now + make_interval(secs => _ttl_seconds)
  ) returning * into _reservation;

  return to_jsonb(_reservation) || jsonb_build_object(
    'used_monthly_tokens',_used,'reserved_monthly_tokens',_reserved,
    'included_monthly_tokens',_ent.included_monthly_tokens,
    'metered_overage_enabled',_ent.metered_overage_enabled,'idempotent_replay',false
  );
end;
$$;

-- Settlement is authorized by the reservation's originating lease token. It may run
-- after the task lease itself expired, because dropping provider usage after a paid
-- side effect would corrupt billing truth. Settlement cannot authorize new work.
create or replace function public.leah_finalize_managed_usage(
  _task_id uuid,
  _lease_token uuid,
  _reservation_id uuid,
  _provider text,
  _model text,
  _input_tokens bigint,
  _output_tokens bigint,
  _cost_micros bigint,
  _metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _reservation public.leah_usage_reservations%rowtype;
  _existing public.leah_usage_events%rowtype;
  _usage public.leah_usage_events%rowtype;
  _actual_tokens bigint;
  _now timestamptz := clock_timestamp();
begin
  if _task_id is null or _lease_token is null or _reservation_id is null then raise exception 'Usage settlement identifiers are required'; end if;
  if _provider is null or length(trim(_provider)) not between 1 and 100 then raise exception 'Invalid provider'; end if;
  if _model is null or length(trim(_model)) not between 1 and 200 then raise exception 'Invalid model'; end if;
  if _input_tokens < 0 or _output_tokens < 0 or _cost_micros < 0 then raise exception 'Invalid usage values'; end if;
  _actual_tokens := _input_tokens + _output_tokens;

  select r.* into _reservation from public.leah_usage_reservations r
  where r.id=_reservation_id and r.task_id=_task_id and r.authority_lease_token=_lease_token
  for update;
  if not found then raise exception 'Usage reservation not found'; end if;

  if _reservation.status='consumed' then
    select u.* into _existing from public.leah_usage_events u
    where u.workspace_id=_reservation.workspace_id and u.event_key=_reservation.event_key;
    if not found then raise exception 'Consumed reservation missing usage event'; end if;
    if _existing.provider <> trim(_provider) or _existing.model <> trim(_model)
       or _existing.input_tokens <> _input_tokens or _existing.output_tokens <> _output_tokens
       or _existing.cost_micros <> _cost_micros then raise exception 'LEAH_USAGE_FINALIZE_CONFLICT'; end if;
    return to_jsonb(_existing) || jsonb_build_object('idempotent_replay',true);
  end if;
  if _reservation.status <> 'reserved' then raise exception 'Usage reservation is not active'; end if;

  insert into public.leah_usage_events(
    workspace_id,execution_id,event_key,provider,model,input_tokens,output_tokens,cost_micros,
    usage_type,quantity,funding_source,reservation_id,metadata
  ) values (
    _reservation.workspace_id,_reservation.execution_id,_reservation.event_key,
    trim(_provider),trim(_model),_input_tokens,_output_tokens,_cost_micros,
    'model_tokens',_actual_tokens,'managed',_reservation.id,
    coalesce(_metadata,'{}'::jsonb) || jsonb_build_object(
      'reserved_tokens',_reservation.requested_tokens,
      'reservation_overrun',_actual_tokens > _reservation.requested_tokens
    )
  ) returning * into _usage;

  update public.leah_usage_reservations set status='consumed',finalized_at=_now
  where id=_reservation.id and workspace_id=_reservation.workspace_id;
  return to_jsonb(_usage) || jsonb_build_object('idempotent_replay',false);
end;
$$;

create or replace function public.leah_release_managed_token_reservation(
  _task_id uuid,_lease_token uuid,_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if _task_id is null or _lease_token is null or _reservation_id is null then return false; end if;
  update public.leah_usage_reservations r
  set status='released', finalized_at=clock_timestamp()
  where r.id=_reservation_id and r.task_id=_task_id
    and r.authority_lease_token=_lease_token and r.status='reserved';
  return found;
end;
$$;

create or replace function public.leah_reserve_deployment_for_task(
  _task_id uuid,_lease_token uuid,_event_key text,_target text,_ttl_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _ent public.leah_workspace_entitlements%rowtype;
  _existing public.leah_deployment_reservations%rowtype;
  _used bigint := 0; _reserved bigint := 0;
  _month_start timestamptz; _now timestamptz := clock_timestamp();
  _row public.leah_deployment_reservations%rowtype;
begin
  if _event_key is null or length(_event_key) not between 1 and 200 then raise exception 'Invalid deployment event key'; end if;
  if _target is null or length(trim(_target)) not between 1 and 100 then raise exception 'Invalid deployment target'; end if;
  if _ttl_seconds < 60 or _ttl_seconds > 1800 then raise exception 'Invalid deployment reservation TTL'; end if;
  perform public.leah_reap_usage_reservations(500);

  select t.* into _task from public.leah_tasks t
  join public.leah_executions x on x.id=t.execution_id and x.workspace_id=t.workspace_id
  where t.id=_task_id and t.status='running' and t.lease_token=_lease_token
    and t.lease_expires_at > _now and x.status='running' for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select e.* into _ent from public.leah_workspace_entitlements e
  where e.workspace_id=_task.workspace_id for update;
  if not found or _ent.status not in ('trial','active','grace')
     or (_ent.valid_until is not null and _ent.valid_until <= _now) then raise exception 'LEAH entitlement inactive'; end if;

  select r.* into _existing from public.leah_deployment_reservations r
  where r.workspace_id=_task.workspace_id and r.event_key=_event_key;
  if found then
    if _existing.execution_id <> _task.execution_id or _existing.task_id <> _task.id
       or _existing.authority_lease_token <> _lease_token or _existing.target <> trim(_target) then
      raise exception 'LEAH_DEPLOY_RESERVATION_CONFLICT';
    end if;
    return to_jsonb(_existing) || jsonb_build_object('idempotent_replay',true);
  end if;

  _month_start := date_trunc('month',_now at time zone 'UTC') at time zone 'UTC';
  select coalesce(sum(quantity),0) into _used from public.leah_usage_events
  where workspace_id=_task.workspace_id and usage_type='deployment' and created_at >= _month_start;
  select count(*)::bigint into _reserved from public.leah_deployment_reservations
  where workspace_id=_task.workspace_id and status='reserved' and expires_at > _now and created_at >= _month_start;

  if not _ent.deploy_overage_enabled and (_used + _reserved + 1) > _ent.included_monthly_deploys then
    raise exception 'LEAH_DEPLOY_QUOTA_EXCEEDED';
  end if;

  insert into public.leah_deployment_reservations(
    workspace_id,execution_id,task_id,authority_lease_token,event_key,target,expires_at
  ) values (
    _task.workspace_id,_task.execution_id,_task.id,_lease_token,_event_key,trim(_target),
    _now + make_interval(secs => _ttl_seconds)
  ) returning * into _row;

  return to_jsonb(_row) || jsonb_build_object(
    'used_monthly_deploys',_used,'reserved_monthly_deploys',_reserved,
    'included_monthly_deploys',_ent.included_monthly_deploys,
    'deploy_overage_enabled',_ent.deploy_overage_enabled,'idempotent_replay',false
  );
end;
$$;

create or replace function public.leah_finalize_deployment_usage(
  _task_id uuid,_lease_token uuid,_reservation_id uuid,
  _provider_ref text,_cost_micros bigint default 0,_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _r public.leah_deployment_reservations%rowtype;
  _existing public.leah_usage_events%rowtype;
  _usage public.leah_usage_events%rowtype;
  _now timestamptz := clock_timestamp();
begin
  if _provider_ref is null or length(trim(_provider_ref)) not between 1 and 500 then raise exception 'Invalid deployment provider ref'; end if;
  if _cost_micros < 0 then raise exception 'Invalid deployment cost'; end if;

  select r.* into _r from public.leah_deployment_reservations r
  where r.id=_reservation_id and r.task_id=_task_id and r.authority_lease_token=_lease_token for update;
  if not found then raise exception 'Deployment reservation not found'; end if;
  if _r.status='consumed' then
    select u.* into _existing from public.leah_usage_events u
    where u.workspace_id=_r.workspace_id and u.event_key=_r.event_key;
    if not found then raise exception 'Consumed deployment reservation missing usage event'; end if;
    if coalesce(_existing.metadata->>'provider_ref','') <> trim(_provider_ref)
       or _existing.cost_micros <> _cost_micros then raise exception 'LEAH_DEPLOY_FINALIZE_CONFLICT'; end if;
    return to_jsonb(_existing) || jsonb_build_object('idempotent_replay',true);
  end if;
  if _r.status <> 'reserved' then raise exception 'Deployment reservation is not active'; end if;

  insert into public.leah_usage_events(
    workspace_id,execution_id,event_key,provider,model,input_tokens,output_tokens,cost_micros,
    usage_type,quantity,funding_source,metadata
  ) values (
    _r.workspace_id,_r.execution_id,_r.event_key,_r.target,'n/a',0,0,_cost_micros,
    'deployment',1,'platform',coalesce(_metadata,'{}'::jsonb) || jsonb_build_object('provider_ref',trim(_provider_ref))
  ) returning * into _usage;
  update public.leah_deployment_reservations set status='consumed',finalized_at=_now
  where id=_r.id and workspace_id=_r.workspace_id;
  return to_jsonb(_usage) || jsonb_build_object('idempotent_replay',false);
end;
$$;

create or replace function public.leah_release_deployment_reservation(
  _task_id uuid,_lease_token uuid,_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.leah_deployment_reservations r
  set status='released',finalized_at=clock_timestamp()
  where r.id=_reservation_id and r.task_id=_task_id
    and r.authority_lease_token=_lease_token and r.status='reserved';
  return found;
end;
$$;

-- Storage quota is enforced before an artifact version is persisted. All retained
-- versions count toward storage because they occupy durable database storage.
create or replace function public.leah_put_artifact_for_task(
  _task_id uuid,_lease_token uuid,_kind text,_path text,_content text,_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _ent public.leah_workspace_entitlements%rowtype;
  _requested_by uuid; _latest_id uuid; _latest_version integer;
  _artifact public.leah_project_artifacts%rowtype;
  _used_bytes bigint := 0; _new_bytes bigint;
begin
  if _task_id is null or _lease_token is null then raise exception 'Task and lease token are required'; end if;
  if _kind is null or length(trim(_kind)) not between 1 and 80 then raise exception 'Invalid artifact kind'; end if;
  if _path is null or length(trim(_path)) not between 1 and 500 then raise exception 'Invalid artifact path'; end if;
  if _content is null then _content := ''; end if;
  _new_bytes := octet_length(_content);
  if _new_bytes > 1000000 then raise exception 'Artifact content exceeds 1 MB; use object storage'; end if;
  if _content_hash is null or _content_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid artifact content hash'; end if;

  select t.* into _task from public.leah_tasks t
  join public.leah_executions x on x.id=t.execution_id and x.workspace_id=t.workspace_id
  where t.id=_task_id and t.status='running' and t.lease_token=_lease_token
    and t.lease_expires_at > clock_timestamp() and x.status='running' for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select e.* into _ent from public.leah_workspace_entitlements e
  where e.workspace_id=_task.workspace_id for update;
  if not found or _ent.status not in ('trial','active','grace')
     or (_ent.valid_until is not null and _ent.valid_until <= clock_timestamp()) then raise exception 'LEAH entitlement inactive'; end if;

  select coalesce(sum(a.byte_size),0) into _used_bytes
  from public.leah_project_artifacts a where a.workspace_id=_task.workspace_id;
  if not _ent.storage_overage_enabled and (_used_bytes + _new_bytes) > _ent.storage_bytes_limit then
    raise exception 'LEAH_STORAGE_QUOTA_EXCEEDED';
  end if;

  select x.requested_by into _requested_by from public.leah_executions x
  where x.id=_task.execution_id and x.workspace_id=_task.workspace_id and x.status='running';
  if not found then raise exception 'Execution is not running'; end if;

  perform pg_advisory_xact_lock(hashtextextended(_task.workspace_id::text||':'||_task.project_id::text||':'||trim(_path),0));
  select a.id,a.version into _latest_id,_latest_version from public.leah_project_artifacts a
  where a.workspace_id=_task.workspace_id and a.project_id=_task.project_id and a.path=trim(_path)
  order by a.version desc limit 1;

  insert into public.leah_project_artifacts(
    workspace_id,project_id,execution_id,task_id,kind,path,content,content_hash,
    byte_size,version,supersedes_id,created_by
  ) values (
    _task.workspace_id,_task.project_id,_task.execution_id,_task.id,trim(_kind),trim(_path),_content,_content_hash,
    _new_bytes,coalesce(_latest_version,0)+1,_latest_id,_requested_by
  ) returning * into _artifact;
  return to_jsonb(_artifact) || jsonb_build_object('workspace_storage_used_bytes',_used_bytes+_new_bytes,'workspace_storage_limit_bytes',_ent.storage_bytes_limit);
end;
$$;

-- Extend summary with actual retained artifact bytes and deployment quota truth.
create or replace function public.leah_usage_summary(_workspace_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
with bounds as (
  select (date_trunc('month',clock_timestamp() at time zone 'UTC') at time zone 'UTC') as month_start
), usage as (
  select
    coalesce(sum(input_tokens+output_tokens) filter (where funding_source='managed' and usage_type='model_tokens'),0) as managed_tokens,
    coalesce(sum(input_tokens+output_tokens) filter (where funding_source='byok' and usage_type='model_tokens'),0) as byok_tokens,
    coalesce(sum(cost_micros) filter (where funding_source='managed'),0) as managed_cost_micros,
    coalesce(sum(cost_micros) filter (where funding_source='byok'),0) as byok_cost_micros,
    coalesce(sum(quantity) filter (where usage_type='generation'),0) as generations,
    coalesce(sum(quantity) filter (where usage_type='deployment'),0) as deployments,
    coalesce(sum(quantity) filter (where usage_type='agent_seconds'),0) as agent_seconds
  from public.leah_usage_events u,bounds b where u.workspace_id=_workspace_id and u.created_at>=b.month_start
), token_res as (
  select coalesce(sum(requested_tokens),0) as active_reserved_tokens from public.leah_usage_reservations
  where workspace_id=_workspace_id and status='reserved' and expires_at>clock_timestamp()
), deploy_res as (
  select count(*)::bigint as active_reserved_deploys from public.leah_deployment_reservations
  where workspace_id=_workspace_id and status='reserved' and expires_at>clock_timestamp()
), running as (
  select count(*)::bigint as running_tasks from public.leah_tasks where workspace_id=_workspace_id and status='running'
), storage as (
  select coalesce(sum(byte_size),0) as used_bytes from public.leah_project_artifacts where workspace_id=_workspace_id
)
select jsonb_build_object(
  'workspace_id',e.workspace_id,'entitlement_key',e.entitlement_key,'status',e.status,
  'ai_funding_mode',e.ai_funding_mode,'included_monthly_tokens',e.included_monthly_tokens,
  'metered_overage_enabled',e.metered_overage_enabled,'concurrency_limit',e.concurrency_limit,
  'storage_bytes_limit',e.storage_bytes_limit,'storage_overage_enabled',e.storage_overage_enabled,
  'storage_used_bytes',s.used_bytes,'included_monthly_deploys',e.included_monthly_deploys,
  'deploy_overage_enabled',e.deploy_overage_enabled,'managed_tokens',u.managed_tokens,
  'byok_tokens',u.byok_tokens,'active_reserved_tokens',t.active_reserved_tokens,
  'managed_cost_micros',u.managed_cost_micros,'byok_cost_micros',u.byok_cost_micros,
  'generations',u.generations,'deployments',u.deployments,'active_reserved_deploys',d.active_reserved_deploys,
  'agent_seconds',u.agent_seconds,'running_tasks',q.running_tasks
)
from public.leah_workspace_entitlements e cross join usage u cross join token_res t
cross join deploy_res d cross join running q cross join storage s where e.workspace_id=_workspace_id;
$$;

revoke all on public.leah_deployment_reservations from public, anon, authenticated;
revoke all on function public.leah_reap_usage_reservations(integer) from public, anon, authenticated;
revoke all on function public.leah_reserve_deployment_for_task(uuid,uuid,text,text,integer) from public, anon, authenticated;
revoke all on function public.leah_finalize_deployment_usage(uuid,uuid,uuid,text,bigint,jsonb) from public, anon, authenticated;
revoke all on function public.leah_release_deployment_reservation(uuid,uuid,uuid) from public, anon, authenticated;

grant execute on function public.leah_reap_usage_reservations(integer) to service_role;
grant execute on function public.leah_reserve_deployment_for_task(uuid,uuid,text,text,integer) to service_role;
grant execute on function public.leah_finalize_deployment_usage(uuid,uuid,uuid,text,bigint,jsonb) to service_role;
grant execute on function public.leah_release_deployment_reservation(uuid,uuid,uuid) to service_role;
;
