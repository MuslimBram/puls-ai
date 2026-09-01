-- MR3 orchestration state guards.
-- Even service-side bugs must not be able to invent unsupported lifecycle transitions.

create or replace function public.leah_task_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then return new; end if;

  if not (
    (old.status='queued' and new.status in ('running','failed','cancelled')) or
    (old.status='running' and new.status in ('succeeded','failed','retry_wait','cancelled')) or
    (old.status='retry_wait' and new.status in ('running','failed','cancelled'))
  ) then
    raise exception 'Invalid LEAH task state transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke all on function public.leah_task_status_guard() from public, anon, authenticated;

drop trigger if exists trg_leah_task_status_guard on public.leah_tasks;
create trigger trg_leah_task_status_guard
before update of status on public.leah_tasks
for each row
execute function public.leah_task_status_guard();

create or replace function public.leah_execution_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then return new; end if;

  if not (
    (old.status='queued' and new.status in ('running','failed','cancelled')) or
    (old.status='running' and new.status in ('succeeded','failed','cancelled'))
  ) then
    raise exception 'Invalid LEAH execution state transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke all on function public.leah_execution_status_guard() from public, anon, authenticated;

drop trigger if exists trg_leah_execution_status_guard on public.leah_executions;
create trigger trg_leah_execution_status_guard
before update of status on public.leah_executions
for each row
execute function public.leah_execution_status_guard();
