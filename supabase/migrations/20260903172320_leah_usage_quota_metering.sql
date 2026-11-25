-- MR5-B: workspace-scoped LEAH usage, funding policy and quota reservations.
-- No price is defined here. This migration only establishes entitlement/metering truth.

alter table public.leah_workspace_entitlements
  add column entitlement_key text not null default 'leahAiOs'
    check (entitlement_key = 'leahAiOs'),
  add column ai_funding_mode text not null default 'byok'
    check (ai_funding_mode in ('byok','managed','hybrid')),
  add column metered_overage_enabled boolean not null default false;

alter table public.leah_usage_events
  add column usage_type text not null default 'model_tokens'
    check (usage_type in ('model_tokens','generation','deployment','agent_seconds')),
  add column quantity bigint not null default 0 check (quantity >= 0),
  add column funding_source text not null default 'managed'
    check (funding_source in ('managed','byok','platform'));

create table public.leah_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  execution_id uuid not null,
  task_id uuid not null,
  event_key text not null check (length(event_key) between 1 and 200),
  requested_tokens bigint not null check (requested_tokens between 1 and 10000000),
  status text not null default 'reserved' check (status in ('reserved','consumed','released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  finalized_at timestamptz null,
  unique (id, workspace_id),
  unique (workspace_id, event_key),
  constraint leah_usage_reservation_execution_fk
    foreign key (execution_id, workspace_id)
    references public.leah_executions(id, workspace_id) on delete cascade,
  constraint leah_usage_reservation_task_fk
    foreign key (task_id, execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id) on delete cascade,
  constraint leah_usage_reservation_expiry_ck check (expires_at > created_at)
);
create index leah_usage_reservations_active_idx
  on public.leah_usage_reservations(workspace_id, expires_at)
  where status = 'reserved';

alter table public.leah_usage_reservations enable row level security;
alter table public.leah_usage_reservations force row level security;
revoke all on public.leah_usage_reservations from public, anon, authenticated;
grant all on public.leah_usage_reservations to service_role;

alter table public.leah_usage_events
  add column reservation_id uuid null,
  add constraint leah_usage_event_reservation_fk
    foreign key (reservation_id, workspace_id)
    references public.leah_usage_reservations(id, workspace_id)
    on delete set null (reservation_id);

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

  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions e
    on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id
    and t.status='running'
    and t.lease_token=_lease_token
    and t.lease_expires_at > _now
    and e.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select e.* into _ent
  from public.leah_workspace_entitlements e
  where e.workspace_id=_task.workspace_id
  for update;
  if not found
     or _ent.status not in ('trial','active','grace')
     or (_ent.valid_until is not null and _ent.valid_until <= _now) then
    raise exception 'LEAH entitlement inactive';
  end if;
  if _ent.ai_funding_mode not in ('managed','hybrid') then
    raise exception 'LEAH_MANAGED_AI_DISABLED';
  end if;

  select r.* into _existing
  from public.leah_usage_reservations r
  where r.workspace_id=_task.workspace_id and r.event_key=_event_key;
  if found then
    if _existing.execution_id <> _task.execution_id
       or _existing.task_id <> _task.id
       or _existing.requested_tokens <> _requested_tokens then
      raise exception 'LEAH_USAGE_RESERVATION_CONFLICT';
    end if;
    return jsonb_build_object(
      'id', _existing.id,
      'workspace_id', _existing.workspace_id,
      'execution_id', _existing.execution_id,
      'task_id', _existing.task_id,
      'event_key', _existing.event_key,
      'requested_tokens', _existing.requested_tokens,
      'status', _existing.status,
      'expires_at', _existing.expires_at,
      'idempotent_replay', true
    );
  end if;

  _month_start := date_trunc('month', _now at time zone 'UTC') at time zone 'UTC';

  select coalesce(sum(u.input_tokens + u.output_tokens),0) into _used
  from public.leah_usage_events u
  where u.workspace_id=_task.workspace_id
    and u.funding_source='managed'
    and u.usage_type='model_tokens'
    and u.created_at >= _month_start;

  select coalesce(sum(r.requested_tokens),0) into _reserved
  from public.leah_usage_reservations r
  where r.workspace_id=_task.workspace_id
    and r.status='reserved'
    and r.expires_at > _now
    and r.created_at >= _month_start;

  if not _ent.metered_overage_enabled
     and (_used + _reserved + _requested_tokens) > _ent.included_monthly_tokens then
    raise exception 'LEAH_TOKEN_QUOTA_EXCEEDED';
  end if;

  insert into public.leah_usage_reservations(
    workspace_id, execution_id, task_id, event_key, requested_tokens, expires_at
  ) values (
    _task.workspace_id, _task.execution_id, _task.id, _event_key, _requested_tokens,
    _now + make_interval(secs => _ttl_seconds)
  ) returning * into _reservation;

  return jsonb_build_object(
    'id', _reservation.id,
    'workspace_id', _reservation.workspace_id,
    'execution_id', _reservation.execution_id,
    'task_id', _reservation.task_id,
    'event_key', _reservation.event_key,
    'requested_tokens', _reservation.requested_tokens,
    'status', _reservation.status,
    'expires_at', _reservation.expires_at,
    'used_monthly_tokens', _used,
    'reserved_monthly_tokens', _reserved,
    'included_monthly_tokens', _ent.included_monthly_tokens,
    'metered_overage_enabled', _ent.metered_overage_enabled,
    'idempotent_replay', false
  );
end;
$$;

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
  _task public.leah_tasks%rowtype;
  _reservation public.leah_usage_reservations%rowtype;
  _existing public.leah_usage_events%rowtype;
  _usage public.leah_usage_events%rowtype;
  _actual_tokens bigint;
  _now timestamptz := clock_timestamp();
begin
  if _provider is null or length(trim(_provider)) < 1 or length(trim(_provider)) > 100 then raise exception 'Invalid provider'; end if;
  if _model is null or length(trim(_model)) < 1 or length(trim(_model)) > 200 then raise exception 'Invalid model'; end if;
  if _input_tokens < 0 or _output_tokens < 0 or _cost_micros < 0 then raise exception 'Invalid usage values'; end if;
  _actual_tokens := _input_tokens + _output_tokens;

  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions e on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id
    and t.status='running'
    and t.lease_token=_lease_token
    and t.lease_expires_at > _now
    and e.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select r.* into _reservation
  from public.leah_usage_reservations r
  where r.id=_reservation_id
    and r.workspace_id=_task.workspace_id
    and r.execution_id=_task.execution_id
    and r.task_id=_task.id
  for update;
  if not found then raise exception 'Usage reservation not found'; end if;

  if _reservation.status='consumed' then
    select u.* into _existing
    from public.leah_usage_events u
    where u.workspace_id=_task.workspace_id and u.event_key=_reservation.event_key;
    if not found then raise exception 'Consumed reservation missing usage event'; end if;
    if _existing.provider <> trim(_provider)
       or _existing.model <> trim(_model)
       or _existing.input_tokens <> _input_tokens
       or _existing.output_tokens <> _output_tokens
       or _existing.cost_micros <> _cost_micros then
      raise exception 'LEAH_USAGE_FINALIZE_CONFLICT';
    end if;
    return to_jsonb(_existing) || jsonb_build_object('idempotent_replay', true);
  end if;
  if _reservation.status <> 'reserved' then raise exception 'Usage reservation is not active'; end if;

  insert into public.leah_usage_events(
    workspace_id, execution_id, event_key,
    provider, model, input_tokens, output_tokens, cost_micros,
    usage_type, quantity, funding_source, reservation_id, metadata
  ) values (
    _task.workspace_id, _task.execution_id, _reservation.event_key,
    trim(_provider), trim(_model), _input_tokens, _output_tokens, _cost_micros,
    'model_tokens', _actual_tokens, 'managed', _reservation.id,
    coalesce(_metadata,'{}'::jsonb) || jsonb_build_object(
      'reserved_tokens', _reservation.requested_tokens,
      'reservation_overrun', _actual_tokens > _reservation.requested_tokens
    )
  ) returning * into _usage;

  update public.leah_usage_reservations
  set status='consumed', finalized_at=_now
  where id=_reservation.id and workspace_id=_reservation.workspace_id;

  return to_jsonb(_usage) || jsonb_build_object('idempotent_replay', false);
end;
$$;

create or replace function public.leah_release_managed_token_reservation(
  _task_id uuid,
  _lease_token uuid,
  _reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _now timestamptz := clock_timestamp();
begin
  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions e on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id
    and t.status='running'
    and t.lease_token=_lease_token
    and t.lease_expires_at > _now
    and e.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  update public.leah_usage_reservations r
  set status='released', finalized_at=_now
  where r.id=_reservation_id
    and r.workspace_id=_task.workspace_id
    and r.execution_id=_task.execution_id
    and r.task_id=_task.id
    and r.status='reserved';
  return found;
end;
$$;

create or replace function public.leah_record_byok_usage_for_task(
  _task_id uuid,
  _lease_token uuid,
  _event_key text,
  _provider text,
  _model text,
  _input_tokens bigint,
  _output_tokens bigint,
  _cost_micros bigint default 0,
  _metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _ent public.leah_workspace_entitlements%rowtype;
  _existing public.leah_usage_events%rowtype;
  _usage public.leah_usage_events%rowtype;
  _now timestamptz := clock_timestamp();
begin
  if _event_key is null or length(_event_key) < 1 or length(_event_key) > 200 then raise exception 'Invalid usage event key'; end if;
  if _provider is null or length(trim(_provider)) < 1 or length(trim(_provider)) > 100 then raise exception 'Invalid provider'; end if;
  if _model is null or length(trim(_model)) < 1 or length(trim(_model)) > 200 then raise exception 'Invalid model'; end if;
  if _input_tokens < 0 or _output_tokens < 0 or _cost_micros < 0 then raise exception 'Invalid usage values'; end if;

  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions e on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id
    and t.status='running'
    and t.lease_token=_lease_token
    and t.lease_expires_at > _now
    and e.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select e.* into _ent from public.leah_workspace_entitlements e where e.workspace_id=_task.workspace_id;
  if not found or _ent.ai_funding_mode not in ('byok','hybrid') then raise exception 'LEAH_BYOK_DISABLED'; end if;
  if _ent.status not in ('trial','active','grace') or (_ent.valid_until is not null and _ent.valid_until <= _now) then
    raise exception 'LEAH entitlement inactive';
  end if;

  select u.* into _existing from public.leah_usage_events u
  where u.workspace_id=_task.workspace_id and u.event_key=_event_key;
  if found then
    if _existing.execution_id <> _task.execution_id
       or _existing.provider <> trim(_provider)
       or _existing.model <> trim(_model)
       or _existing.input_tokens <> _input_tokens
       or _existing.output_tokens <> _output_tokens
       or _existing.cost_micros <> _cost_micros
       or _existing.funding_source <> 'byok' then
      raise exception 'LEAH_USAGE_EVENT_CONFLICT';
    end if;
    return to_jsonb(_existing) || jsonb_build_object('idempotent_replay', true);
  end if;

  insert into public.leah_usage_events(
    workspace_id, execution_id, event_key,
    provider, model, input_tokens, output_tokens, cost_micros,
    usage_type, quantity, funding_source, metadata
  ) values (
    _task.workspace_id, _task.execution_id, _event_key,
    trim(_provider), trim(_model), _input_tokens, _output_tokens, _cost_micros,
    'model_tokens', _input_tokens + _output_tokens, 'byok', coalesce(_metadata,'{}'::jsonb)
  ) returning * into _usage;

  return to_jsonb(_usage) || jsonb_build_object('idempotent_replay', false);
end;
$$;

create or replace function public.leah_record_operational_usage_for_task(
  _task_id uuid,
  _lease_token uuid,
  _event_key text,
  _usage_type text,
  _quantity bigint default 1,
  _metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _existing public.leah_usage_events%rowtype;
  _usage public.leah_usage_events%rowtype;
  _now timestamptz := clock_timestamp();
begin
  if _usage_type not in ('generation','deployment','agent_seconds') then raise exception 'Invalid operational usage type'; end if;
  if _quantity < 0 then raise exception 'Invalid usage quantity'; end if;
  if _event_key is null or length(_event_key) < 1 or length(_event_key) > 200 then raise exception 'Invalid usage event key'; end if;

  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions e on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id
    and t.status='running'
    and t.lease_token=_lease_token
    and t.lease_expires_at > _now
    and e.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select u.* into _existing from public.leah_usage_events u
  where u.workspace_id=_task.workspace_id and u.event_key=_event_key;
  if found then
    if _existing.execution_id <> _task.execution_id
       or _existing.usage_type <> _usage_type
       or _existing.quantity <> _quantity then
      raise exception 'LEAH_USAGE_EVENT_CONFLICT';
    end if;
    return to_jsonb(_existing) || jsonb_build_object('idempotent_replay', true);
  end if;

  insert into public.leah_usage_events(
    workspace_id, execution_id, event_key,
    provider, model, input_tokens, output_tokens, cost_micros,
    usage_type, quantity, funding_source, metadata
  ) values (
    _task.workspace_id, _task.execution_id, _event_key,
    'pulse', 'n/a', 0, 0, 0,
    _usage_type, _quantity, 'platform', coalesce(_metadata,'{}'::jsonb)
  ) returning * into _usage;

  return to_jsonb(_usage) || jsonb_build_object('idempotent_replay', false);
end;
$$;

create or replace function public.leah_usage_summary(_workspace_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
with bounds as (
  select (date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC') as month_start
), usage as (
  select
    coalesce(sum(input_tokens + output_tokens) filter (where funding_source='managed' and usage_type='model_tokens'),0) as managed_tokens,
    coalesce(sum(input_tokens + output_tokens) filter (where funding_source='byok' and usage_type='model_tokens'),0) as byok_tokens,
    coalesce(sum(cost_micros) filter (where funding_source='managed'),0) as managed_cost_micros,
    coalesce(sum(cost_micros) filter (where funding_source='byok'),0) as byok_cost_micros,
    coalesce(sum(quantity) filter (where usage_type='generation'),0) as generations,
    coalesce(sum(quantity) filter (where usage_type='deployment'),0) as deployments,
    coalesce(sum(quantity) filter (where usage_type='agent_seconds'),0) as agent_seconds
  from public.leah_usage_events u, bounds b
  where u.workspace_id=_workspace_id and u.created_at >= b.month_start
), reservations as (
  select coalesce(sum(requested_tokens),0) as active_reserved_tokens
  from public.leah_usage_reservations r
  where r.workspace_id=_workspace_id and r.status='reserved' and r.expires_at > clock_timestamp()
), running as (
  select count(*)::bigint as running_tasks
  from public.leah_tasks t
  where t.workspace_id=_workspace_id and t.status='running'
)
select jsonb_build_object(
  'workspace_id', e.workspace_id,
  'entitlement_key', e.entitlement_key,
  'status', e.status,
  'ai_funding_mode', e.ai_funding_mode,
  'included_monthly_tokens', e.included_monthly_tokens,
  'metered_overage_enabled', e.metered_overage_enabled,
  'concurrency_limit', e.concurrency_limit,
  'storage_bytes_limit', e.storage_bytes_limit,
  'managed_tokens', u.managed_tokens,
  'byok_tokens', u.byok_tokens,
  'active_reserved_tokens', r.active_reserved_tokens,
  'managed_cost_micros', u.managed_cost_micros,
  'byok_cost_micros', u.byok_cost_micros,
  'generations', u.generations,
  'deployments', u.deployments,
  'agent_seconds', u.agent_seconds,
  'running_tasks', q.running_tasks
)
from public.leah_workspace_entitlements e
cross join usage u
cross join reservations r
cross join running q
where e.workspace_id=_workspace_id;
$$;

revoke all on function public.leah_reserve_managed_tokens(uuid, uuid, text, bigint, integer) from public, anon, authenticated;
revoke all on function public.leah_finalize_managed_usage(uuid, uuid, uuid, text, text, bigint, bigint, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.leah_release_managed_token_reservation(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.leah_record_byok_usage_for_task(uuid, uuid, text, text, text, bigint, bigint, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.leah_record_operational_usage_for_task(uuid, uuid, text, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.leah_usage_summary(uuid) from public, anon, authenticated;

grant execute on function public.leah_reserve_managed_tokens(uuid, uuid, text, bigint, integer) to service_role;
grant execute on function public.leah_finalize_managed_usage(uuid, uuid, uuid, text, text, bigint, bigint, bigint, jsonb) to service_role;
grant execute on function public.leah_release_managed_token_reservation(uuid, uuid, uuid) to service_role;
grant execute on function public.leah_record_byok_usage_for_task(uuid, uuid, text, text, text, bigint, bigint, bigint, jsonb) to service_role;
grant execute on function public.leah_record_operational_usage_for_task(uuid, uuid, text, text, bigint, jsonb) to service_role;
grant execute on function public.leah_usage_summary(uuid) to service_role;
;
