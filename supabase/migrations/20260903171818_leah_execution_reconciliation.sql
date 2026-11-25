-- MR3 execution reconciliation.
-- Recovers terminal execution truth if a worker disappears between task completion
-- and execution completion, or if lease/dependency reapers create a failed task.

create or replace function public.leah_reconcile_executions(_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _execution record;
  _failed integer := 0;
  _succeeded integer := 0;
begin
  if _limit < 1 or _limit > 1000 then raise exception 'Invalid execution reconcile limit'; end if;

  for _execution in
    select e.id, e.workspace_id, e.status
    from public.leah_executions e
    where e.status in ('queued','running')
      and exists (
        select 1 from public.leah_tasks t
        where t.execution_id=e.id and t.workspace_id=e.workspace_id
      )
      and (
        exists (
          select 1 from public.leah_tasks t
          where t.execution_id=e.id
            and t.workspace_id=e.workspace_id
            and t.status in ('failed','cancelled')
        )
        or exists (
          select 1 from public.leah_swarms s
          where s.execution_id=e.id
            and s.workspace_id=e.workspace_id
            and s.status in ('failed','cancelled')
        )
        or (
          e.status='running'
          and not exists (
            select 1 from public.leah_tasks t
            where t.execution_id=e.id
              and t.workspace_id=e.workspace_id
              and t.status <> 'succeeded'
          )
          and not exists (
            select 1 from public.leah_swarms s
            where s.execution_id=e.id
              and s.workspace_id=e.workspace_id
              and s.status <> 'succeeded'
          )
        )
      )
    order by e.updated_at, e.id
    for update of e skip locked
    limit _limit
  loop
    if exists (
      select 1 from public.leah_tasks t
      where t.execution_id=_execution.id
        and t.workspace_id=_execution.workspace_id
        and t.status in ('failed','cancelled')
    ) or exists (
      select 1 from public.leah_swarms s
      where s.execution_id=_execution.id
        and s.workspace_id=_execution.workspace_id
        and s.status in ('failed','cancelled')
    ) then
      perform public.leah_finish_execution(
        _execution.id,
        _execution.status,
        'failed',
        'orchestration_terminal_failure',
        jsonb_build_object(
          'message','Execution reconciled from failed/cancelled orchestration state'
        )
      );
      _failed := _failed + 1;
    elsif _execution.status='running' then
      perform public.leah_finish_execution(
        _execution.id,
        'running',
        'succeeded',
        null,
        null
      );
      _succeeded := _succeeded + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'failed', _failed,
    'succeeded', _succeeded,
    'processed', _failed + _succeeded
  );
end;
$$;

revoke all on function public.leah_reconcile_executions(integer) from public, anon, authenticated;
grant execute on function public.leah_reconcile_executions(integer) to service_role;

-- Replace the cron tick so recovery and scheduling are one durable DB-native cycle.
create or replace function public.leah_orchestration_tick()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _expired integer;
  _blocked integer;
  _reconciled jsonb;
  _scheduled jsonb;
begin
  _expired := public.leah_reap_expired_task_leases(200);
  _blocked := public.leah_fail_blocked_tasks(200);
  _reconciled := public.leah_reconcile_executions(200);
  _scheduled := public.leah_scheduler_tick(50);

  return jsonb_build_object(
    'expired_reaped', _expired,
    'dependency_failed', _blocked,
    'execution_reconciliation', _reconciled,
    'scheduler', _scheduled,
    'ran_at', clock_timestamp()
  );
end;
$$;

revoke all on function public.leah_orchestration_tick() from public, anon, authenticated;
grant execute on function public.leah_orchestration_tick() to service_role;
;
