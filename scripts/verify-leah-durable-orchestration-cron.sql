\set ON_ERROR_STOP on
begin;

do $$
declare
  _count integer;
  _schedule text;
  _active boolean;
  _command text;
begin
  select count(*) into _count
  from cron.job
  where jobname = 'leah-orchestration-1min';
  if _count <> 1 then
    raise exception 'Expected exactly one LEAH orchestration cron job, found %', _count;
  end if;

  select schedule, active, command
    into _schedule, _active, _command
  from cron.job
  where jobname = 'leah-orchestration-1min';

  if _schedule <> '* * * * *' then raise exception 'LEAH orchestration cron schedule mismatch'; end if;
  if not _active then raise exception 'LEAH orchestration cron is inactive'; end if;
  if position('public.leah_orchestration_tick()' in _command) = 0 then
    raise exception 'LEAH orchestration cron does not call canonical tick function';
  end if;

  if has_function_privilege('anon','public.leah_orchestration_tick()','EXECUTE') then
    raise exception 'anon can execute LEAH orchestration tick';
  end if;
  if has_function_privilege('authenticated','public.leah_orchestration_tick()','EXECUTE') then
    raise exception 'authenticated can execute LEAH orchestration tick';
  end if;
  if not has_function_privilege('service_role','public.leah_orchestration_tick()','EXECUTE') then
    raise exception 'service_role cannot execute LEAH orchestration tick';
  end if;
end $$;

rollback;
\echo 'LEAH DURABLE ORCHESTRATION CRON CONTRACT: PASS'
