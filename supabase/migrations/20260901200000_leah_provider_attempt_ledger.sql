-- MR7-A: durable provider attempt evidence and exactly-once materialization claims.
-- Stacked on MR5. No provider price is defined here and no Production mutation is implied.

create table public.leah_provider_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  execution_id uuid not null,
  task_id uuid not null,
  logical_request_id uuid not null,
  attempt_id uuid not null,
  authority_lease_token uuid not null,
  reservation_id uuid null,
  billing_mode text not null check (billing_mode in ('byok','managed')),
  provider text not null check (length(trim(provider)) between 1 and 100),
  model text not null check (length(trim(model)) between 1 and 200),
  status text not null default 'in_flight'
    check (status in ('in_flight','succeeded','failed','unknown')),
  provider_request_id text null check (provider_request_id is null or length(provider_request_id) <= 500),
  usage_source text not null default 'unavailable'
    check (usage_source in ('provider','estimated','unavailable')),
  input_tokens bigint null check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint null check (output_tokens is null or output_tokens >= 0),
  total_tokens bigint null check (total_tokens is null or total_tokens >= 0),
  cost_micros bigint null check (cost_micros is null or cost_micros >= 0),
  error_code text null check (error_code is null or length(error_code) <= 120),
  latency_ms integer null check (latency_ms is null or latency_ms >= 0),
  canonical_result boolean not null default false,
  materialization_status text null
    check (materialization_status is null or materialization_status in ('claimed','materialized')),
  materialization_key text null check (materialization_key is null or length(materialization_key) between 1 and 200),
  materialized_ref text null check (materialized_ref is null or length(materialized_ref) <= 1000),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz null,
  materialized_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  unique (id, workspace_id),
  unique (workspace_id, attempt_id),
  unique (workspace_id, logical_request_id, provider),
  constraint leah_provider_attempt_execution_fk
    foreign key (execution_id, workspace_id)
    references public.leah_executions(id, workspace_id) on delete cascade,
  constraint leah_provider_attempt_task_fk
    foreign key (task_id, execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id) on delete cascade,
  constraint leah_provider_attempt_reservation_fk
    foreign key (reservation_id, workspace_id)
    references public.leah_usage_reservations(id, workspace_id) on delete set null (reservation_id),
  constraint leah_provider_attempt_terminal_ck check (
    (status='in_flight' and finished_at is null)
    or (status in ('succeeded','failed','unknown') and finished_at is not null)
  ),
  constraint leah_provider_attempt_canonical_ck check (
    not canonical_result or status='succeeded'
  ),
  constraint leah_provider_attempt_materialization_ck check (
    (materialization_status is null and materialization_key is null and materialized_ref is null and materialized_at is null)
    or (materialization_status='claimed' and materialization_key is not null and materialized_ref is null and materialized_at is null and canonical_result and status='succeeded')
    or (materialization_status='materialized' and materialization_key is not null and materialized_ref is not null and materialized_at is not null and canonical_result and status='succeeded')
  )
);

create index leah_provider_attempts_request_idx
  on public.leah_provider_attempts(workspace_id, logical_request_id, started_at);
create index leah_provider_attempts_task_idx
  on public.leah_provider_attempts(task_id, started_at desc);
create unique index leah_provider_attempts_one_materialization_idx
  on public.leah_provider_attempts(workspace_id, logical_request_id)
  where materialization_status is not null;

alter table public.leah_provider_attempts enable row level security;
alter table public.leah_provider_attempts force row level security;
revoke all on public.leah_provider_attempts from public, anon, authenticated;
grant all on public.leah_provider_attempts to service_role;

create or replace function public.leah_begin_provider_attempt(
  _task_id uuid,
  _lease_token uuid,
  _logical_request_id uuid,
  _attempt_id uuid,
  _billing_mode text,
  _provider text,
  _model text,
  _reservation_id uuid default null,
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
  _reservation public.leah_usage_reservations%rowtype;
  _existing public.leah_provider_attempts%rowtype;
  _row public.leah_provider_attempts%rowtype;
  _now timestamptz := clock_timestamp();
begin
  if _task_id is null or _lease_token is null or _logical_request_id is null or _attempt_id is null then
    raise exception 'Provider attempt identifiers are required';
  end if;
  if _billing_mode not in ('byok','managed') then raise exception 'Invalid provider billing mode'; end if;
  if _provider is null or length(trim(_provider)) not between 1 and 100 then raise exception 'Invalid provider'; end if;
  if _model is null or length(trim(_model)) not between 1 and 200 then raise exception 'Invalid model'; end if;
  if _metadata is null or jsonb_typeof(_metadata) <> 'object' then raise exception 'Invalid provider attempt metadata'; end if;

  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions x on x.id=t.execution_id and x.workspace_id=t.workspace_id
  where t.id=_task_id
    and t.status='running'
    and t.lease_token=_lease_token
    and t.lease_expires_at > _now
    and x.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select e.* into _ent
  from public.leah_workspace_entitlements e
  where e.workspace_id=_task.workspace_id
  for update;
  if not found or _ent.status not in ('trial','active','grace')
     or (_ent.valid_until is not null and _ent.valid_until <= _now) then
    raise exception 'LEAH entitlement inactive';
  end if;
  if _billing_mode='managed' and _ent.ai_funding_mode not in ('managed','hybrid') then
    raise exception 'LEAH_MANAGED_AI_DISABLED';
  end if;
  if _billing_mode='byok' and _ent.ai_funding_mode not in ('byok','hybrid') then
    raise exception 'LEAH_BYOK_DISABLED';
  end if;

  if _billing_mode='managed' then
    if _reservation_id is null then raise exception 'Managed provider attempt requires token reservation'; end if;
    select r.* into _reservation
    from public.leah_usage_reservations r
    where r.id=_reservation_id
      and r.workspace_id=_task.workspace_id
      and r.execution_id=_task.execution_id
      and r.task_id=_task.id
      and r.authority_lease_token=_lease_token
      and r.status='reserved'
    for update;
    if not found then raise exception 'Managed provider reservation not active'; end if;
  elsif _reservation_id is not null then
    raise exception 'BYOK provider attempt cannot use managed reservation';
  end if;

  select a.* into _existing
  from public.leah_provider_attempts a
  where a.workspace_id=_task.workspace_id and a.attempt_id=_attempt_id;
  if found then
    if _existing.execution_id<>_task.execution_id
       or _existing.task_id<>_task.id
       or _existing.logical_request_id<>_logical_request_id
       or _existing.authority_lease_token<>_lease_token
       or _existing.billing_mode<>_billing_mode
       or _existing.provider<>trim(_provider)
       or _existing.model<>trim(_model)
       or _existing.reservation_id is distinct from _reservation_id then
      raise exception 'LEAH_PROVIDER_ATTEMPT_CONFLICT';
    end if;
    return jsonb_build_object(
      'id',_existing.id,
      'workspace_id',_existing.workspace_id,
      'execution_id',_existing.execution_id,
      'task_id',_existing.task_id,
      'logical_request_id',_existing.logical_request_id,
      'attempt_id',_existing.attempt_id,
      'billing_mode',_existing.billing_mode,
      'provider',_existing.provider,
      'model',_existing.model,
      'status',_existing.status,
      'reservation_id',_existing.reservation_id,
      'started_at',_existing.started_at,
      'idempotent_replay',true
    );
  end if;

  insert into public.leah_provider_attempts(
    workspace_id,execution_id,task_id,logical_request_id,attempt_id,authority_lease_token,
    reservation_id,billing_mode,provider,model,metadata
  ) values (
    _task.workspace_id,_task.execution_id,_task.id,_logical_request_id,_attempt_id,_lease_token,
    _reservation_id,_billing_mode,trim(_provider),trim(_model),_metadata
  ) returning * into _row;

  return jsonb_build_object(
    'id',_row.id,
    'workspace_id',_row.workspace_id,
    'execution_id',_row.execution_id,
    'task_id',_row.task_id,
    'logical_request_id',_row.logical_request_id,
    'attempt_id',_row.attempt_id,
    'billing_mode',_row.billing_mode,
    'provider',_row.provider,
    'model',_row.model,
    'status',_row.status,
    'reservation_id',_row.reservation_id,
    'started_at',_row.started_at,
    'idempotent_replay',false
  );
end;
$$;

create or replace function public.leah_finish_provider_attempt(
  _task_id uuid,
  _lease_token uuid,
  _attempt_id uuid,
  _outcome text,
  _provider_request_id text default null,
  _usage_source text default 'unavailable',
  _input_tokens bigint default null,
  _output_tokens bigint default null,
  _total_tokens bigint default null,
  _cost_micros bigint default null,
  _error_code text default null,
  _latency_ms integer default null,
  _canonical_result boolean default false,
  _metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _row public.leah_provider_attempts%rowtype;
  _now timestamptz := clock_timestamp();
begin
  if _task_id is null or _lease_token is null or _attempt_id is null then raise exception 'Provider attempt settlement identifiers are required'; end if;
  if _outcome not in ('succeeded','failed','unknown') then raise exception 'Invalid provider attempt outcome'; end if;
  if _usage_source not in ('provider','estimated','unavailable') then raise exception 'Invalid usage_source'; end if;
  if _provider_request_id is not null and length(_provider_request_id)>500 then raise exception 'Invalid provider request id'; end if;
  if _error_code is not null and length(_error_code)>120 then raise exception 'Invalid provider error code'; end if;
  if _input_tokens is not null and _input_tokens<0 then raise exception 'Invalid input token usage'; end if;
  if _output_tokens is not null and _output_tokens<0 then raise exception 'Invalid output token usage'; end if;
  if _total_tokens is not null and _total_tokens<0 then raise exception 'Invalid total token usage'; end if;
  if _cost_micros is not null and _cost_micros<0 then raise exception 'Invalid provider cost'; end if;
  if _latency_ms is not null and _latency_ms<0 then raise exception 'Invalid provider latency'; end if;
  if _metadata is null or jsonb_typeof(_metadata) <> 'object' then raise exception 'Invalid provider attempt metadata'; end if;
  if _usage_source='unavailable' and (_input_tokens is not null or _output_tokens is not null or _total_tokens is not null) then
    raise exception 'Unavailable usage cannot carry token counts';
  end if;
  if _canonical_result and _outcome<>'succeeded' then raise exception 'Only succeeded attempts may be canonical'; end if;

  select a.* into _row
  from public.leah_provider_attempts a
  where a.attempt_id=_attempt_id
    and a.task_id=_task_id
    and a.authority_lease_token=_lease_token
  for update;
  if not found then raise exception 'Provider attempt not found'; end if;

  if _row.status<>'in_flight' then
    if _row.status<>_outcome
       or _row.provider_request_id is distinct from nullif(trim(coalesce(_provider_request_id,'')),'')
       or _row.usage_source<>_usage_source
       or _row.input_tokens is distinct from _input_tokens
       or _row.output_tokens is distinct from _output_tokens
       or _row.total_tokens is distinct from _total_tokens
       or _row.cost_micros is distinct from _cost_micros
       or _row.error_code is distinct from nullif(trim(coalesce(_error_code,'')),'')
       or _row.latency_ms is distinct from _latency_ms
       or _row.canonical_result<>_canonical_result then
      raise exception 'LEAH_PROVIDER_ATTEMPT_FINALIZE_CONFLICT';
    end if;
    return to_jsonb(_row) - 'authority_lease_token' || jsonb_build_object('idempotent_replay',true);
  end if;

  update public.leah_provider_attempts
  set status=_outcome,
      provider_request_id=nullif(trim(coalesce(_provider_request_id,'')),''),
      usage_source=_usage_source,
      input_tokens=_input_tokens,
      output_tokens=_output_tokens,
      total_tokens=_total_tokens,
      cost_micros=_cost_micros,
      error_code=nullif(trim(coalesce(_error_code,'')),''),
      latency_ms=_latency_ms,
      canonical_result=_canonical_result,
      finished_at=_now,
      metadata=metadata || _metadata
  where id=_row.id and workspace_id=_row.workspace_id
  returning * into _row;

  return to_jsonb(_row) - 'authority_lease_token' || jsonb_build_object('idempotent_replay',false);
end;
$$;

create or replace function public.leah_claim_provider_materialization(
  _task_id uuid,
  _lease_token uuid,
  _attempt_id uuid,
  _materialization_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _row public.leah_provider_attempts%rowtype;
begin
  if _materialization_key is null or length(trim(_materialization_key)) not between 1 and 200 then
    raise exception 'Invalid materialization key';
  end if;

  select a.* into _row
  from public.leah_provider_attempts a
  where a.attempt_id=_attempt_id and a.task_id=_task_id and a.authority_lease_token=_lease_token
  for update;
  if not found then raise exception 'Provider attempt not found'; end if;
  if _row.status<>'succeeded' or not _row.canonical_result then raise exception 'Provider attempt is not canonical'; end if;

  if _row.materialization_status is not null then
    if _row.materialization_key<>trim(_materialization_key) then raise exception 'LEAH_PROVIDER_MATERIALIZATION_CONFLICT'; end if;
    return jsonb_build_object(
      'attempt_id',_row.attempt_id,
      'logical_request_id',_row.logical_request_id,
      'status',_row.materialization_status,
      'materialization_key',_row.materialization_key,
      'materialized_ref',_row.materialized_ref,
      'idempotent_replay',true
    );
  end if;

  update public.leah_provider_attempts
  set materialization_status='claimed', materialization_key=trim(_materialization_key)
  where id=_row.id and workspace_id=_row.workspace_id
  returning * into _row;

  return jsonb_build_object(
    'attempt_id',_row.attempt_id,
    'logical_request_id',_row.logical_request_id,
    'status',_row.materialization_status,
    'materialization_key',_row.materialization_key,
    'idempotent_replay',false
  );
exception
  when unique_violation then
    raise exception 'LEAH_PROVIDER_MATERIALIZATION_ALREADY_CLAIMED';
end;
$$;

create or replace function public.leah_finalize_provider_materialization(
  _task_id uuid,
  _lease_token uuid,
  _attempt_id uuid,
  _materialization_key text,
  _materialized_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _row public.leah_provider_attempts%rowtype;
  _now timestamptz := clock_timestamp();
begin
  if _materialization_key is null or length(trim(_materialization_key)) not between 1 and 200 then raise exception 'Invalid materialization key'; end if;
  if _materialized_ref is null or length(trim(_materialized_ref)) not between 1 and 1000 then raise exception 'Invalid materialized ref'; end if;

  select a.* into _row
  from public.leah_provider_attempts a
  where a.attempt_id=_attempt_id and a.task_id=_task_id and a.authority_lease_token=_lease_token
  for update;
  if not found then raise exception 'Provider attempt not found'; end if;
  if _row.status<>'succeeded' or not _row.canonical_result then raise exception 'Provider attempt is not canonical'; end if;
  if _row.materialization_status is null or _row.materialization_key<>trim(_materialization_key) then
    raise exception 'Provider materialization was not claimed';
  end if;

  if _row.materialization_status='materialized' then
    if _row.materialized_ref<>trim(_materialized_ref) then raise exception 'LEAH_PROVIDER_MATERIALIZATION_FINALIZE_CONFLICT'; end if;
    return jsonb_build_object(
      'attempt_id',_row.attempt_id,
      'logical_request_id',_row.logical_request_id,
      'status',_row.materialization_status,
      'materialization_key',_row.materialization_key,
      'materialized_ref',_row.materialized_ref,
      'materialized_at',_row.materialized_at,
      'idempotent_replay',true
    );
  end if;

  update public.leah_provider_attempts
  set materialization_status='materialized', materialized_ref=trim(_materialized_ref), materialized_at=_now
  where id=_row.id and workspace_id=_row.workspace_id
  returning * into _row;

  return jsonb_build_object(
    'attempt_id',_row.attempt_id,
    'logical_request_id',_row.logical_request_id,
    'status',_row.materialization_status,
    'materialization_key',_row.materialization_key,
    'materialized_ref',_row.materialized_ref,
    'materialized_at',_row.materialized_at,
    'idempotent_replay',false
  );
end;
$$;

revoke all on function public.leah_begin_provider_attempt(uuid,uuid,uuid,uuid,text,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.leah_finish_provider_attempt(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,bigint,text,integer,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.leah_claim_provider_materialization(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.leah_finalize_provider_materialization(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.leah_begin_provider_attempt(uuid,uuid,uuid,uuid,text,text,text,uuid,jsonb) to service_role;
grant execute on function public.leah_finish_provider_attempt(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,bigint,text,integer,boolean,jsonb) to service_role;
grant execute on function public.leah_claim_provider_materialization(uuid,uuid,uuid,text) to service_role;
grant execute on function public.leah_finalize_provider_materialization(uuid,uuid,uuid,text,text) to service_role;
