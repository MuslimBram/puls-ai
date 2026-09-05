-- MR3 durable orchestration cron.
-- Follows the existing Pulse DB-native cron pattern for database-only maintenance.

create or replace function public.leah_orchestration_tick()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _expired integer;
  _blocked integer;
  _scheduled jsonb;
begin
  _expired := public.leah_reap_expired_task_leases(200);
  _blocked := public.leah_fail_blocked_tasks(200);
  _scheduled := public.leah_scheduler_tick(50);

  return jsonb_build_object(
    'expired_reaped', _expired,
    'dependency_failed', _blocked,
    'scheduler', _scheduled,
    'ran_at', clock_timestamp()
  );
end;
$$;

revoke all on function public.leah_orchestration_tick() from public, anon, authenticated;
grant execute on function public.leah_orchestration_tick() to service_role;

do $register$
declare
  _job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron extension is required for LEAH durable orchestration';
  end if;

  -- Keep registration idempotent across reset/replay operations.
  for _job_id in
    select jobid from cron.job where jobname = 'leah-orchestration-1min'
  loop
    perform cron.unschedule(_job_id);
  end loop;

  perform cron.schedule(
    'leah-orchestration-1min',
    '* * * * *',
    'SELECT public.leah_orchestration_tick()'
  );
end;
$register$;
