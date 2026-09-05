-- MR3 orchestration hardening.
-- Structural tenant/execution binding is authoritative even for service-side mistakes.

-- Parallel swarm is the only mode with implemented runtime semantics in MR3.
-- Do not claim sequential/consensus support until their behavior is real and certified.
alter table public.leah_swarms drop constraint if exists leah_swarms_mode_check;
alter table public.leah_swarms
  add constraint leah_swarms_parallel_only_ck check (mode = 'parallel');

-- A task identity is made available as an execution-bound composite parent.
alter table public.leah_tasks
  add constraint leah_tasks_id_execution_workspace_uq
  unique (id, execution_id, workspace_id);

alter table public.leah_tasks drop constraint leah_task_parent_fk;
alter table public.leah_tasks
  add constraint leah_task_parent_fk
  foreign key (parent_task_id, execution_id, workspace_id)
  references public.leah_tasks(id, execution_id, workspace_id)
  on delete set null (parent_task_id);

alter table public.leah_tasks drop constraint leah_task_swarm_fk;
alter table public.leah_tasks
  add constraint leah_task_swarm_fk
  foreign key (swarm_id, execution_id, workspace_id)
  references public.leah_swarms(id, execution_id, workspace_id)
  on delete set null (swarm_id);

-- Dependencies also carry execution_id so a same-workspace cross-execution edge is
-- structurally impossible, not merely rejected by the RPC implementation.
alter table public.leah_task_dependencies add column execution_id uuid null;
update public.leah_task_dependencies d
set execution_id = t.execution_id
from public.leah_tasks t
where t.id = d.task_id and t.workspace_id = d.workspace_id;
alter table public.leah_task_dependencies alter column execution_id set not null;

alter table public.leah_task_dependencies drop constraint leah_task_dependency_task_fk;
alter table public.leah_task_dependencies drop constraint leah_task_dependency_parent_fk;
alter table public.leah_task_dependencies
  add constraint leah_task_dependency_task_fk
  foreign key (task_id, execution_id, workspace_id)
  references public.leah_tasks(id, execution_id, workspace_id)
  on delete cascade,
  add constraint leah_task_dependency_parent_fk
  foreign key (depends_on_task_id, execution_id, workspace_id)
  references public.leah_tasks(id, execution_id, workspace_id)
  on delete cascade;

create index leah_task_dependencies_execution_idx
  on public.leah_task_dependencies(workspace_id, execution_id, task_id);

-- New running states must always have a complete live-lease shape. Preflight ensured
-- there were no legacy running rows before this upgrade started.
alter table public.leah_tasks drop constraint leah_task_lease_shape_ck;
alter table public.leah_tasks
  add constraint leah_task_lease_shape_ck check (
    (
      status = 'running'
      and lease_owner is not null
      and lease_token is not null
      and lease_expires_at is not null
      and heartbeat_at is not null
    )
    or
    (
      status <> 'running'
      and lease_owner is null
      and lease_token is null
      and lease_expires_at is null
      and heartbeat_at is null
    )
  );

-- Replace dependency resolver with an UPDATE-lockable EXISTS plan.
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
    select t.id, t.workspace_id
    from public.leah_tasks t
    where t.status in ('queued','retry_wait')
      and exists (
        select 1
        from public.leah_task_dependencies d
        join public.leah_tasks upstream
          on upstream.id = d.depends_on_task_id
         and upstream.execution_id = d.execution_id
         and upstream.workspace_id = d.workspace_id
        where d.workspace_id = t.workspace_id
          and d.execution_id = t.execution_id
          and d.task_id = t.id
          and upstream.status in ('failed','cancelled')
      )
    order by t.created_at, t.id
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

-- Recreate atomic enqueue so dependency rows receive the authoritative execution_id.
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

  select count(*), count(distinct x.dep_id)
    into _dep_count, _distinct_dep_count
  from unnest(coalesce(_depends_on, '{}'::uuid[])) as x(dep_id);
  if _dep_count <> _distinct_dep_count then raise exception 'Duplicate task dependency'; end if;

  if _dep_count > 0 and (
    select count(*)
    from public.leah_tasks d
    where d.workspace_id = _execution.workspace_id
      and d.execution_id = _execution.id
      and d.id = any(_depends_on)
  ) <> _dep_count then
    raise exception 'Task dependency not found for execution';
  end if;

  -- The execution row lock serializes sequence allocation for this execution.
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
    insert into public.leah_task_dependencies(
      workspace_id, execution_id, task_id, depends_on_task_id
    )
    select _execution.workspace_id, _execution.id, _task.id, x.dep_id
    from unnest(_depends_on) as x(dep_id);
  end if;

  return to_jsonb(_task);
end;
$$;

-- Only parallel swarm semantics exist in MR3. Keep unsupported modes fail-closed.
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
  if _mode <> 'parallel' then
    raise exception 'Invalid swarm mode: only parallel is supported in MR3';
  end if;

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
    'parallel', _max_concurrency, _execution.requested_by
  ) returning * into _swarm;

  return to_jsonb(_swarm);
end;
$$;

revoke all on function public.leah_fail_blocked_tasks(integer) from public, anon, authenticated;
revoke all on function public.leah_enqueue_task(uuid,integer,jsonb,text,uuid,uuid,uuid[],integer) from public, anon, authenticated;
revoke all on function public.leah_create_swarm(uuid,text,integer) from public, anon, authenticated;

grant execute on function public.leah_fail_blocked_tasks(integer) to service_role;
grant execute on function public.leah_enqueue_task(uuid,integer,jsonb,text,uuid,uuid,uuid[],integer) to service_role;
grant execute on function public.leah_create_swarm(uuid,text,integer) to service_role;
