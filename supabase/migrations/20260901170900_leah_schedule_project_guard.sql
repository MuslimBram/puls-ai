-- MR3 schedule/project lifecycle guard.
-- Active schedules are invalid for archived projects regardless of which server path
-- attempts the write.

create or replace function public.leah_schedule_project_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.enabled then
    if not exists (
      select 1
      from public.leah_projects p
      where p.id = new.project_id
        and p.workspace_id = new.workspace_id
        and p.archived_at is null
        and p.status <> 'archived'
    ) then
      raise exception 'Active LEAH schedule requires a non-archived project';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.leah_schedule_project_guard() from public, anon, authenticated;

drop trigger if exists trg_leah_schedule_project_guard on public.leah_schedules;
create trigger trg_leah_schedule_project_guard
before insert or update of enabled, project_id, workspace_id on public.leah_schedules
for each row
execute function public.leah_schedule_project_guard();
