-- MR3 orchestration hardening.
-- Replace the dependency resolver with an UPDATE-lockable EXISTS plan.

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
         and upstream.workspace_id = d.workspace_id
        where d.workspace_id = t.workspace_id
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

revoke all on function public.leah_fail_blocked_tasks(integer) from public, anon, authenticated;
grant execute on function public.leah_fail_blocked_tasks(integer) to service_role;
