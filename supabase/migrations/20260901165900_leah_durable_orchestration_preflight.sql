-- MR3 orchestration upgrade preflight.
-- Do not silently mutate in-flight MR2 tasks while introducing lease ownership.
do $$
begin
  if exists (
    select 1
    from public.leah_tasks
    where status = 'running'
  ) then
    raise exception 'LEAH MR3 orchestration upgrade requires a quiescent queue: running tasks exist';
  end if;
end;
$$;
