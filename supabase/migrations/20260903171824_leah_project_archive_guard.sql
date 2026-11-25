-- MR3 project archive structural guard.
-- Any server-side path that archives a project must atomically stop its orchestration.
-- This is defense in depth beneath leah_archive_project and the session API.

create or replace function public.leah_project_archive_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _execution record;
  _now timestamptz := clock_timestamp();
begin
  -- Archived state has one canonical shape and cannot be silently reversed.
  if (new.status = 'archived') <> (new.archived_at is not null) then
    raise exception 'Archived project state requires status=archived and archived_at together';
  end if;

  if old.archived_at is not null and new.archived_at is null then
    raise exception 'Project unarchive is not supported';
  end if;

  if old.archived_at is null and new.archived_at is not null then
    -- The project row is already locked by the UPDATE that fired this trigger, so
    -- scheduler/manual-start paths that use the same lifecycle mutex cannot race in.
    for _execution in
      select e.id, e.status
      from public.leah_executions e
      where e.workspace_id = old.workspace_id
        and e.project_id = old.id
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
    end loop;

    update public.leah_schedules s
    set enabled = false,
        updated_at = _now
    where s.workspace_id = old.workspace_id
      and s.project_id = old.id
      and s.enabled = true;
  end if;

  return new;
end;
$$;

revoke all on function public.leah_project_archive_guard() from public, anon, authenticated;

drop trigger if exists trg_leah_project_archive_guard on public.leah_projects;
create trigger trg_leah_project_archive_guard
before update of status, archived_at on public.leah_projects
for each row
execute function public.leah_project_archive_guard();
;
