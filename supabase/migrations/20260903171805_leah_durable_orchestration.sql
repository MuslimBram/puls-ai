-- LEAH AI OS durable orchestration.
-- Stacked on MR2 server foundation. No provider execution or billing side effects here.
-- The database is authoritative for queue ownership, leases, dependencies, concurrency and schedules.

create table public.leah_swarms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  execution_id uuid not null,
  project_id uuid not null,
  mode text not null default 'parallel'
    check (mode in ('parallel','sequential','consensus')),
  status text not null default 'planning'
    check (status in ('planning','running','succeeded','failed','cancelled')),
  max_concurrency integer not null default 1 check (max_concurrency between 1 and 128),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz null,
  unique (id, workspace_id),
  unique (id, execution_id, workspace_id),
  constraint leah_swarm_execution_fk foreign key (execution_id, project_id, workspace_id)
    references public.leah_executions(id, project_id, workspace_id) on delete cascade
);
create index leah_swarms_execution_idx
  on public.leah_swarms(workspace_id, execution_id, status, created_at);

alter table public.leah_tasks
  add column agent_role text not null default 'worker'
    check (length(trim(agent_role)) between 1 and 80),
  add column parent_task_id uuid null,
  add column swarm_id uuid null,
  add column lease_owner text null,
  add column lease_token uuid null,
  add column lease_expires_at timestamptz null,
  add column heartbeat_at timestamptz null,
  add column max_attempts integer not null default 3 check (max_attempts between 1 and 20);

alter table public.leah_tasks
  add constraint leah_task_parent_fk
    foreign key (parent_task_id, workspace_id)
    references public.leah_tasks(id, workspace_id)
    on delete set null (parent_task_id),
  add constraint leah_task_swarm_fk
    foreign key (swarm_id, workspace_id)
    references public.leah_swarms(id, workspace_id)
    on delete set null (swarm_id),
  add constraint leah_task_lease_shape_ck check (
    (status = 'running' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
    or
    (status <> 'running' and lease_owner is null and lease_token is null and lease_expires_at is null)
  );

create index leah_tasks_claim_idx
  on public.leah_tasks(status, available_at, priority desc, created_at, seq)
  where status in ('queued','retry_wait');
create index leah_tasks_active_lease_idx
  on public.leah_tasks(workspace_id, status, lease_expires_at)
  where status = 'running';
create index leah_tasks_swarm_active_idx
  on public.leah_tasks(workspace_id, swarm_id, status)
  where swarm_id is not null;

create table public.leah_task_dependencies (
  workspace_id uuid not null,
  task_id uuid not null,
  depends_on_task_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, task_id, depends_on_task_id),
  constraint leah_task_dependency_not_self_ck check (task_id <> depends_on_task_id),
  constraint leah_task_dependency_task_fk foreign key (task_id, workspace_id)
    references public.leah_tasks(id, workspace_id) on delete cascade,
  constraint leah_task_dependency_parent_fk foreign key (depends_on_task_id, workspace_id)
    references public.leah_tasks(id, workspace_id) on delete cascade
);
create index leah_task_dependencies_parent_idx
  on public.leah_task_dependencies(workspace_id, depends_on_task_id, task_id);

create table public.leah_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  cadence_seconds integer not null check (cadence_seconds between 60 and 31536000),
  enabled boolean not null default true,
  input jsonb not null default '{}'::jsonb,
  next_run_at timestamptz not null,
  last_run_at timestamptz null,
  last_execution_id uuid null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  constraint leah_schedule_project_fk foreign key (project_id, workspace_id)
    references public.leah_projects(id, workspace_id) on delete cascade,
  constraint leah_schedule_last_execution_fk foreign key (last_execution_id, workspace_id)
    references public.leah_executions(id, workspace_id)
    on delete set null (last_execution_id)
);
create index leah_schedules_due_idx
  on public.leah_schedules(enabled, next_run_at)
  where enabled = true;

alter table public.leah_swarms enable row level security;
alter table public.leah_swarms force row level security;
alter table public.leah_task_dependencies enable row level security;
alter table public.leah_task_dependencies force row level security;
alter table public.leah_schedules enable row level security;
alter table public.leah_schedules force row level security;

create policy leah_swarms_read on public.leah_swarms
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','member']::text[]));
create policy leah_task_dependencies_read on public.leah_task_dependencies
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','member']::text[]));
create policy leah_schedules_read on public.leah_schedules
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','member']::text[]));

revoke all on public.leah_swarms, public.leah_task_dependencies, public.leah_schedules
  from public, anon, authenticated;
grant select on public.leah_swarms, public.leah_task_dependencies, public.leah_schedules
  to authenticated;
grant all on public.leah_swarms, public.leah_task_dependencies, public.leah_schedules
  to service_role;

-- Expired leases never stay as fake-running work forever. A task with attempts left is
-- returned to retry_wait; an exhausted task becomes failed. This is server-only.
create or replace function public.leah_reap_expired_task_leases(_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _count integer;
begin
  if _limit < 1 or _limit > 1000 then
    raise exception 'Invalid reap limit';
  end if;

  with expired as (
    select t.id, t.workspace_id
    from public.leah_tasks t
    where t.status = 'running'
      and t.lease_expires_at is not null
      and t.lease_expires_at <= clock_timestamp()
    order by t.lease_expires_at, t.created_at
    for update skip locked
    limit _limit
  )
  update public.leah_tasks t
  set status = case when t.attempt >= t.max_attempts then 'failed' else 'retry_wait' end,
      available_at = case when t.attempt >= t.max_attempts then t.available_at else clock_timestamp() end,
      ended_at = case when t.attempt >= t.max_attempts then clock_timestamp() else null end,
      error = jsonb_build_object(
        'code', 'lease_expired',
        'message', 'Worker lease expired before completion',
        'attempt', t.attempt
      ),
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      heartbeat_at = null,
      updated_at = clock_timestamp()
  from expired e
  where t.id = e.id and t.workspace_id = e.workspace_id;

  get diagnostics _count = row_count;
  return _count;
end;
$$;

-- If an upstream dependency reaches a failed/cancelled terminal state, dependants are
-- failed deterministically instead of remaining queued forever.
create or replace function public.leah_fail_blocked_tasks(_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _count integer;
begin
  if _limit < 1 or _limit > 1000 then
    raise exception 'Invalid blocked-task limit';
  end if;

  with blocked as (
    select distinct t.id, t.workspace_id
    from public.leah_tasks t
    join public.leah_task_dependencies d
      on d.task_id = t.id and d.workspace_id = t.workspace_id
    join public.leah_tasks upstream
      on upstream.id = d.depends_on_task_id and upstream.workspace_id = d.workspace_id
    where t.status in ('queued','retry_wait')
      and upstream.status in ('failed','cancelled')
    order by t.id
    for update of t skip locked
    limit _limit
  )
  update public.leah_tasks t
  set status = 'failed',
      ended_at = clock_timestamp(),
      error = jsonb_build_object(
        'code', 'dependency_terminal',
        'message', 'An upstream task failed or was cancelled'
      ),
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      heartbeat_at = null,
      updated_at = clock_timestamp()
  from blocked b
  where t.id = b.id and t.workspace_id = b.workspace_id;

  get diagnostics _count = row_count;
  return _count;
end;
$$;

-- Atomic task creation. Dependencies can only point to tasks that already exist in the
-- same execution, which makes dependency construction acyclic by construction.
create or replace function public.leah_enqueue_task(
  _execution_id uuid,
  _priority integer default 100,
  _input jsonb default '{}'::jsonb,
  _agent_role text default 'worker',
  _swarm_id uuid default null,
  _parent_task_id uuid default null,
  _depends_on uuid[] default '{}'::uuid[],
  _max_attempts integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _execution public.leah_executions%rowtype;
  _task public.leah_tasks%rowtype;
  _seq integer;
  _dep_count integer;
  _distinct_dep_count integer;
begin
  if _execution_id is null then raise exception 'execution_id is required'; end if;
  if _agent_role is null or length(trim(_agent_role)) < 1 or length(trim(_agent_role)) > 80 then
    raise exception 'Invalid agent role';
  end if;
  if _max_attempts < 1 or _max_attempts > 20 then raise exception 'Invalid max attempts'; end if;

  select * into _execution
  from public.leah_executions
  where id = _execution_id
  for update;
  if not found then raise exception 'Execution not found'; end if;
  if _execution.status in ('succeeded','failed','cancelled') then
    raise exception 'Execution is terminal';
  end if;

  if _swarm_id is not null and not exists (
    select 1 from public.leah_swarms s
    where s.id = _swarm_id
      and s.workspace_id = _execution.workspace_id
      and s.execution_id = _execution.id
      and s.status in ('planning','running')
  ) then
    raise exception 'Swarm not found for execution';
  end if;

  if _parent_task_id is not null and not exists (
    select 1 from public.leah_tasks p
    where p.id = _parent_task_id
      and p.workspace_id = _execution.workspace_id
      and p.execution_id = _execution.id
  ) then
    raise exception 'Parent task not found for execution';
  end if;

  select count(*), count(distinct d)
    into _dep_count, _distinct_dep_count
  from unnest(coalesce(_depends_on, '{}'::uuid[])) d;
  if _dep_count <> _distinct_dep_count then raise exception 'Duplicate task dependency'; end if;

  if _dep_count > 0 then
    if (
      select count(*)
      from public.leah_tasks d
      where d.workspace_id = _execution.workspace_id
        and d.execution_id = _execution.id
        and d.id = any(_depends_on)
    ) <> _dep_count then
      raise exception 'Task dependency not found for execution';
    end if;
  end if;

  select coalesce(max(seq), -1) + 1 into _seq
  from public.leah_tasks
  where workspace_id = _execution.workspace_id and execution_id = _execution.id;

  insert into public.leah_tasks(
    workspace_id, execution_id, project_id, seq, priority, input,
    agent_role, swarm_id, parent_task_id, max_attempts
  ) values (
    _execution.workspace_id, _execution.id, _execution.project_id, _seq,
    greatest(-10000, least(10000, _priority)), coalesce(_input, '{}'::jsonb),
    trim(_agent_role), _swarm_id, _parent_task_id, _max_attempts
  ) returning * into _task;

  if _dep_count > 0 then
    insert into public.leah_task_dependencies(workspace_id, task_id, depends_on_task_id)
    select _execution.workspace_id, _task.id, d
    from unnest(_depends_on) d;
  end if;

  return to_jsonb(_task);
end;
$$;

create or replace function public.leah_create_swarm(
  _execution_id uuid,
  _mode text default 'parallel',
  _max_concurrency integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _execution public.leah_executions%rowtype;
  _workspace_limit integer;
  _swarm public.leah_swarms%rowtype;
begin
  if _mode not in ('parallel','sequential','consensus') then raise exception 'Invalid swarm mode'; end if;

  select * into _execution
  from public.leah_executions
  where id = _execution_id
  for update;
  if not found then raise exception 'Execution not found'; end if;
  if _execution.status in ('succeeded','failed','cancelled') then raise exception 'Execution is terminal'; end if;

  select e.concurrency_limit into _workspace_limit
  from public.leah_workspace_entitlements e
  where e.workspace_id = _execution.workspace_id
    and e.status in ('trial','active','grace')
    and (e.valid_until is null or e.valid_until > clock_timestamp());
  if _workspace_limit is null then raise exception 'LEAH entitlement inactive'; end if;
  if _max_concurrency < 1 or _max_concurrency > _workspace_limit then
    raise exception 'Swarm concurrency exceeds workspace entitlement';
  end if;

  insert into public.leah_swarms(
    workspace_id, execution_id, project_id, mode, max_concurrency, created_by
  ) values (
    _execution.workspace_id, _execution.id, _execution.project_id,
    _mode, _max_concurrency, _execution.requested_by
  ) returning * into _swarm;

  return to_jsonb(_swarm);
end;
$$;

-- Claim is serialized per workspace by locking the entitlement row. This makes the
-- workspace concurrency count and per-swarm concurrency count race-safe without a
-- global queue lock. SKIP LOCKED keeps independent workspaces concurrent.
create or replace function public.leah_claim_next_task(
  _worker_id text,
  _lease_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _workspace_id uuid;
  _workspace_limit integer;
  _task public.leah_tasks%rowtype;
  _lease_token uuid := gen_random_uuid();
  _now timestamptz := clock_timestamp();
begin
  if _worker_id is null or length(trim(_worker_id)) < 1 or length(trim(_worker_id)) > 160 then
    raise exception 'Invalid worker id';
  end if;
  if _lease_seconds < 15 or _lease_seconds > 900 then raise exception 'Invalid lease duration'; end if;

  perform public.leah_reap_expired_task_leases(100);
  perform public.leah_fail_blocked_tasks(100);

  select e.workspace_id, e.concurrency_limit
    into _workspace_id, _workspace_limit
  from public.leah_workspace_entitlements e
  join lateral (
    select t.priority, t.available_at, t.seq
    from public.leah_tasks t
    where t.workspace_id = e.workspace_id
      and t.status in ('queued','retry_wait')
      and t.available_at <= _now
      and t.attempt < t.max_attempts
      and not exists (
        select 1
        from public.leah_task_dependencies d
        join public.leah_tasks upstream
          on upstream.id = d.depends_on_task_id and upstream.workspace_id = d.workspace_id
        where d.workspace_id = t.workspace_id
          and d.task_id = t.id
          and upstream.status <> 'succeeded'
      )
      and (
        t.swarm_id is null
        or exists (
          select 1
          from public.leah_swarms s
          where s.id = t.swarm_id
            and s.workspace_id = t.workspace_id
            and s.status in ('planning','running')
            and (
              select count(*) from public.leah_tasks sr
              where sr.workspace_id = s.workspace_id
                and sr.swarm_id = s.id
                and sr.status = 'running'
            ) < s.max_concurrency
        )
      )
    order by t.priority desc, t.available_at, t.seq, t.created_at
    limit 1
  ) next_task on true
  where e.status in ('trial','active','grace')
    and (e.valid_until is null or e.valid_until > _now)
    and (
      select count(*) from public.leah_tasks active
      where active.workspace_id = e.workspace_id and active.status = 'running'
    ) < e.concurrency_limit
  order by next_task.priority desc, next_task.available_at, next_task.seq, e.workspace_id
  for update of e skip locked
  limit 1;

  if _workspace_id is null then return null; end if;

  -- Recheck after taking the workspace entitlement lock.
  if (
    select count(*) from public.leah_tasks active
    where active.workspace_id = _workspace_id and active.status = 'running'
  ) >= _workspace_limit then
    return null;
  end if;

  select t.* into _task
  from public.leah_tasks t
  where t.workspace_id = _workspace_id
    and t.status in ('queued','retry_wait')
    and t.available_at <= _now
    and t.attempt < t.max_attempts
    and not exists (
      select 1
      from public.leah_task_dependencies d
      join public.leah_tasks upstream
        on upstream.id = d.depends_on_task_id and upstream.workspace_id = d.workspace_id
      where d.workspace_id = t.workspace_id
        and d.task_id = t.id
        and upstream.status <> 'succeeded'
    )
    and (
      t.swarm_id is null
      or exists (
        select 1
        from public.leah_swarms s
        where s.id = t.swarm_id
          and s.workspace_id = t.workspace_id
          and s.status in ('planning','running')
          and (
            select count(*) from public.leah_tasks sr
            where sr.workspace_id = s.workspace_id
              and sr.swarm_id = s.id
              and sr.status = 'running'
          ) < s.max_concurrency
      )
    )
  order by t.priority desc, t.available_at, t.seq, t.created_at
  for update skip locked
  limit 1;

  if not found then return null; end if;

  update public.leah_tasks t
  set status = 'running',
      attempt = t.attempt + 1,
      lease_owner = trim(_worker_id),
      lease_token = _lease_token,
      lease_expires_at = _now + make_interval(secs => _lease_seconds),
      heartbeat_at = _now,
      started_at = coalesce(t.started_at, _now),
      ended_at = null,
      updated_at = _now
  where t.id = _task.id and t.workspace_id = _task.workspace_id
  returning * into _task;

  update public.leah_executions e
  set status = 'running',
      started_at = coalesce(e.started_at, _now),
      updated_at = _now
  where e.id = _task.execution_id
    and e.workspace_id = _task.workspace_id
    and e.status = 'queued';

  if _task.swarm_id is not null then
    update public.leah_swarms s
    set status = 'running', updated_at = _now
    where s.id = _task.swarm_id and s.workspace_id = _task.workspace_id and s.status = 'planning';
  end if;

  return to_jsonb(_task);
end;
$$;

create or replace function public.leah_heartbeat_task(
  _task_id uuid,
  _lease_token uuid,
  _extend_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _updated integer;
begin
  if _task_id is null or _lease_token is null then raise exception 'Task and lease token are required'; end if;
  if _extend_seconds < 15 or _extend_seconds > 900 then raise exception 'Invalid lease duration'; end if;

  update public.leah_tasks
  set heartbeat_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + make_interval(secs => _extend_seconds),
      updated_at = clock_timestamp()
  where id = _task_id
    and status = 'running'
    and lease_token = _lease_token
    and lease_expires_at > clock_timestamp();
  get diagnostics _updated = row_count;
  return _updated = 1;
end;
$$;

create or replace function public.leah_finish_task(
  _task_id uuid,
  _lease_token uuid,
  _status text,
  _output jsonb default null,
  _error jsonb default null,
  _retry_delay_ms integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _now timestamptz := clock_timestamp();
  _swarm_status text;
begin
  if _status not in ('succeeded','failed','retry_wait','cancelled') then
    raise exception 'Invalid task finish status';
  end if;
  if _retry_delay_ms < 0 or _retry_delay_ms > 86400000 then raise exception 'Invalid retry delay'; end if;

  select * into _task
  from public.leah_tasks
  where id = _task_id
    and status = 'running'
    and lease_token = _lease_token
    and lease_expires_at > _now
  for update;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  if _status = 'retry_wait' and _task.attempt >= _task.max_attempts then
    _status := 'failed';
  end if;

  update public.leah_tasks t
  set status = _status,
      output = case when _status = 'succeeded' then coalesce(_output, '{}'::jsonb) else t.output end,
      error = case
        when _status = 'succeeded' then null
        when _status = 'failed' then coalesce(_error, jsonb_build_object('message','Task failed'))
        when _status = 'retry_wait' then coalesce(_error, jsonb_build_object('message','Retry scheduled'))
        else t.error
      end,
      available_at = case
        when _status = 'retry_wait' then _now + make_interval(secs => (_retry_delay_ms::numeric / 1000.0))
        else t.available_at
      end,
      ended_at = case when _status in ('succeeded','failed','cancelled') then _now else null end,
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      heartbeat_at = null,
      updated_at = _now
  where t.id = _task.id and t.workspace_id = _task.workspace_id
  returning * into _task;

  if _task.swarm_id is not null and not exists (
    select 1 from public.leah_tasks st
    where st.workspace_id = _task.workspace_id
      and st.swarm_id = _task.swarm_id
      and st.status in ('queued','running','retry_wait')
  ) then
    select case
      when exists (
        select 1 from public.leah_tasks st
        where st.workspace_id = _task.workspace_id and st.swarm_id = _task.swarm_id and st.status = 'failed'
      ) then 'failed'
      when exists (
        select 1 from public.leah_tasks st
        where st.workspace_id = _task.workspace_id and st.swarm_id = _task.swarm_id and st.status = 'cancelled'
      ) then 'cancelled'
      else 'succeeded'
    end into _swarm_status;

    update public.leah_swarms s
    set status = _swarm_status,
        ended_at = _now,
        updated_at = _now
    where s.id = _task.swarm_id and s.workspace_id = _task.workspace_id;
  end if;

  return to_jsonb(_task);
end;
$$;

-- Interval scheduler. It deliberately does not claim cron-expression support. One due
-- occurrence produces one idempotent execution and advances next_run_at from now,
-- preventing catch-up storms after downtime.
create or replace function public.leah_scheduler_tick(_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _schedule public.leah_schedules%rowtype;
  _execution_id uuid;
  _idempotency_key text;
  _now timestamptz := clock_timestamp();
  _created jsonb := '[]'::jsonb;
  _processed integer := 0;
begin
  if _limit < 1 or _limit > 200 then raise exception 'Invalid scheduler limit'; end if;

  for _schedule in
    select s.*
    from public.leah_schedules s
    join public.leah_workspace_entitlements e on e.workspace_id = s.workspace_id
    where s.enabled = true
      and s.next_run_at <= _now
      and e.status in ('trial','active','grace')
      and (e.valid_until is null or e.valid_until > _now)
    order by s.next_run_at, s.id
    for update of s skip locked
    limit _limit
  loop
    _idempotency_key := 'schedule:' || _schedule.id::text || ':' || extract(epoch from _schedule.next_run_at)::bigint::text;
    _execution_id := null;

    insert into public.leah_executions(
      workspace_id, project_id, requested_by, status, idempotency_key, input
    ) values (
      _schedule.workspace_id, _schedule.project_id, _schedule.created_by,
      'queued', _idempotency_key,
      coalesce(_schedule.input, '{}'::jsonb) || jsonb_build_object(
        'schedule_id', _schedule.id,
        'scheduled_for', _schedule.next_run_at
      )
    )
    on conflict do nothing
    returning id into _execution_id;

    if _execution_id is null then
      select e.id into _execution_id
      from public.leah_executions e
      where e.workspace_id = _schedule.workspace_id
        and e.project_id = _schedule.project_id
        and e.idempotency_key = _idempotency_key
      limit 1;
    end if;

    update public.leah_schedules s
    set last_run_at = _schedule.next_run_at,
        last_execution_id = _execution_id,
        next_run_at = _now + make_interval(secs => _schedule.cadence_seconds),
        updated_at = _now
    where s.id = _schedule.id and s.workspace_id = _schedule.workspace_id;

    _created := _created || jsonb_build_array(jsonb_build_object(
      'schedule_id', _schedule.id,
      'execution_id', _execution_id,
      'scheduled_for', _schedule.next_run_at
    ));
    _processed := _processed + 1;
  end loop;

  return jsonb_build_object('processed', _processed, 'executions', _created);
end;
$$;

revoke all on function public.leah_reap_expired_task_leases(integer) from public, anon, authenticated;
revoke all on function public.leah_fail_blocked_tasks(integer) from public, anon, authenticated;
revoke all on function public.leah_enqueue_task(uuid,integer,jsonb,text,uuid,uuid,uuid[],integer) from public, anon, authenticated;
revoke all on function public.leah_create_swarm(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.leah_claim_next_task(text,integer) from public, anon, authenticated;
revoke all on function public.leah_heartbeat_task(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.leah_finish_task(uuid,uuid,text,jsonb,jsonb,integer) from public, anon, authenticated;
revoke all on function public.leah_scheduler_tick(integer) from public, anon, authenticated;

grant execute on function public.leah_reap_expired_task_leases(integer) to service_role;
grant execute on function public.leah_fail_blocked_tasks(integer) to service_role;
grant execute on function public.leah_enqueue_task(uuid,integer,jsonb,text,uuid,uuid,uuid[],integer) to service_role;
grant execute on function public.leah_create_swarm(uuid,text,integer) to service_role;
grant execute on function public.leah_claim_next_task(text,integer) to service_role;
grant execute on function public.leah_heartbeat_task(uuid,uuid,integer) to service_role;
grant execute on function public.leah_finish_task(uuid,uuid,text,jsonb,jsonb,integer) to service_role;
grant execute on function public.leah_scheduler_tick(integer) to service_role;
;
