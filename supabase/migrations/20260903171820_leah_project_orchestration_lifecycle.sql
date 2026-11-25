-- MR3 project/orchestration lifecycle hardening.
-- Archiving a project is an atomic stop signal for schedules and active executions.

create or replace function public.leah_archive_project(
  _workspace_id uuid,
  _project_id uuid,
  _expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _project public.leah_projects%rowtype;
  _execution record;
  _now timestamptz := clock_timestamp();
  _cancelled integer := 0;
  _disabled_schedules integer := 0;
begin
  if _workspace_id is null or _project_id is null or _expected_version is null or _expected_version < 1 then
    raise exception 'workspace, project and expected version are required';
  end if;

  -- Project row is the lifecycle mutex shared with manual/scheduled starts.
  select p.* into _project
  from public.leah_projects p
  where p.id=_project_id
    and p.workspace_id=_workspace_id
    and p.version=_expected_version
    and p.archived_at is null
  for update;
  if not found then raise exception 'Version conflict or project not found'; end if;

  for _execution in
    select e.id, e.status
    from public.leah_executions e
    where e.workspace_id=_workspace_id
      and e.project_id=_project_id
      and e.status in ('queued','running')
    order by e.created_at, e.id
    for update of e
  loop
    perform public.leah_finish_execution(
      _execution.id,
      _execution.status,
      'cancelled',
      null,
      null
    );
    _cancelled := _cancelled + 1;
  end loop;

  update public.leah_schedules s
  set enabled=false,
      updated_at=_now
  where s.workspace_id=_workspace_id
    and s.project_id=_project_id
    and s.enabled=true;
  get diagnostics _disabled_schedules = row_count;

  update public.leah_projects p
  set status='archived',
      archived_at=_now,
      updated_at=_now,
      version=p.version+1
  where p.id=_project.id and p.workspace_id=_project.workspace_id
  returning * into _project;

  return jsonb_build_object(
    'project', jsonb_build_object(
      'id', _project.id,
      'status', _project.status,
      'version', _project.version,
      'archived_at', _project.archived_at
    ),
    'cancelled_executions', _cancelled,
    'disabled_schedules', _disabled_schedules
  );
end;
$$;

revoke all on function public.leah_archive_project(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.leah_archive_project(uuid,uuid,integer) to service_role;

-- Scheduler uses the same atomic execution-start primitive and consistent lock order:
-- project first, schedule second. Archived projects are never turned into new work.
create or replace function public.leah_scheduler_tick(_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _candidate record;
  _schedule public.leah_schedules%rowtype;
  _start jsonb;
  _execution_id uuid;
  _task_id uuid;
  _idempotency_key text;
  _now timestamptz := clock_timestamp();
  _created jsonb := '[]'::jsonb;
  _processed integer := 0;
begin
  if _limit < 1 or _limit > 200 then raise exception 'Invalid scheduler limit'; end if;

  for _candidate in
    select s.id, s.workspace_id, s.project_id
    from public.leah_schedules s
    join public.leah_projects p
      on p.id=s.project_id and p.workspace_id=s.workspace_id
    join public.leah_workspace_entitlements e on e.workspace_id=s.workspace_id
    where s.enabled=true
      and s.next_run_at <= _now
      and p.archived_at is null
      and e.status in ('trial','active','grace')
      and (e.valid_until is null or e.valid_until > _now)
    order by s.next_run_at, s.id
    limit _limit
  loop
    -- Lock project first. This serializes against leah_archive_project and
    -- leah_start_execution without the schedule/project lock inversion.
    perform 1
    from public.leah_projects p
    where p.id=_candidate.project_id
      and p.workspace_id=_candidate.workspace_id
      and p.archived_at is null
    for update;
    if not found then continue; end if;

    select s.* into _schedule
    from public.leah_schedules s
    where s.id=_candidate.id
      and s.workspace_id=_candidate.workspace_id
      and s.project_id=_candidate.project_id
      and s.enabled=true
      and s.next_run_at <= _now
    for update;
    if not found then continue; end if;

    -- Revalidate entitlement after acquiring lifecycle locks.
    if not exists (
      select 1 from public.leah_workspace_entitlements e
      where e.workspace_id=_schedule.workspace_id
        and e.status in ('trial','active','grace')
        and (e.valid_until is null or e.valid_until > _now)
    ) then
      continue;
    end if;

    _idempotency_key := 'schedule:' || _schedule.id::text || ':' || extract(epoch from _schedule.next_run_at)::bigint::text;

    _start := public.leah_start_execution(
      _schedule.workspace_id,
      _schedule.project_id,
      _schedule.created_by,
      _idempotency_key,
      coalesce(_schedule.input,'{}'::jsonb) || jsonb_build_object(
        'schedule_id',_schedule.id,
        'scheduled_for',_schedule.next_run_at
      ),
      'schedule'
    );

    _execution_id := (_start->'execution'->>'id')::uuid;
    _task_id := nullif(_start->'bootstrap_task'->>'id','')::uuid;
    if _execution_id is null then raise exception 'Scheduled execution could not be resolved'; end if;

    update public.leah_schedules s
    set last_run_at=_schedule.next_run_at,
        last_execution_id=_execution_id,
        next_run_at=_now + make_interval(secs => _schedule.cadence_seconds),
        updated_at=_now
    where s.id=_schedule.id and s.workspace_id=_schedule.workspace_id;

    _created := _created || jsonb_build_array(jsonb_build_object(
      'schedule_id',_schedule.id,
      'execution_id',_execution_id,
      'task_id',_task_id,
      'scheduled_for',_schedule.next_run_at
    ));
    _processed := _processed + 1;
  end loop;

  return jsonb_build_object('processed',_processed,'executions',_created);
end;
$$;

revoke all on function public.leah_scheduler_tick(integer) from public, anon, authenticated;
grant execute on function public.leah_scheduler_tick(integer) to service_role;
;
