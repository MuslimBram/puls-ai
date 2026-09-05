-- MR3 scheduler bootstrap hardening.
-- A scheduled execution is not real runnable work until it has a durable queue task.
-- This intermediate definition is later replaced by the lifecycle-safe scheduler in
-- 20260901170700, but it uses the same canonical bootstrap marker.

create or replace function public.leah_scheduler_tick(_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _schedule public.leah_schedules%rowtype;
  _execution_id uuid;
  _task jsonb;
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
    _task := null;

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

    if _execution_id is null then
      raise exception 'Scheduled execution could not be resolved';
    end if;

    if not exists (
      select 1
      from public.leah_tasks t
      where t.workspace_id = _schedule.workspace_id
        and t.execution_id = _execution_id
        and t.agent_role = 'planner'
        and t.input->>'orchestration_bootstrap' = 'true'
    ) then
      _task := public.leah_enqueue_task(
        _execution_id,
        1000,
        coalesce(_schedule.input, '{}'::jsonb) || jsonb_build_object(
          'orchestration_bootstrap', true,
          'source', 'schedule',
          'schedule_id', _schedule.id,
          'scheduled_for', _schedule.next_run_at
        ),
        'planner',
        null,
        null,
        '{}'::uuid[],
        3
      );
    else
      select to_jsonb(t) into _task
      from public.leah_tasks t
      where t.workspace_id = _schedule.workspace_id
        and t.execution_id = _execution_id
        and t.agent_role = 'planner'
        and t.input->>'orchestration_bootstrap' = 'true'
      order by t.seq
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
      'task_id', _task->>'id',
      'scheduled_for', _schedule.next_run_at
    ));
    _processed := _processed + 1;
  end loop;

  return jsonb_build_object('processed', _processed, 'executions', _created);
end;
$$;

revoke all on function public.leah_scheduler_tick(integer) from public, anon, authenticated;
grant execute on function public.leah_scheduler_tick(integer) to service_role;
