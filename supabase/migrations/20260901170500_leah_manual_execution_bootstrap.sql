-- MR3 execution bootstrap.
-- User/API and scheduler starts must either persist runnable planner work atomically or fail.

create or replace function public.leah_start_execution(
  _workspace_id uuid,
  _project_id uuid,
  _requested_by uuid,
  _idempotency_key text default null,
  _input jsonb default '{}'::jsonb,
  _source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _project public.leah_projects%rowtype;
  _execution public.leah_executions%rowtype;
  _task jsonb;
  _replay boolean := false;
  _key text := nullif(trim(_idempotency_key),'');
  _normalized_source text := lower(trim(coalesce(_source,'')));
  _bootstrap_input jsonb;
begin
  if _workspace_id is null or _project_id is null or _requested_by is null then
    raise exception 'workspace, project and requester are required';
  end if;
  if _key is not null and length(_key) > 200 then
    raise exception 'Idempotency key exceeds 200 characters';
  end if;
  if _normalized_source not in ('manual','schedule') then
    raise exception 'Invalid execution source';
  end if;
  if _input is null then _input := '{}'::jsonb; end if;

  select p.* into _project
  from public.leah_projects p
  where p.id=_project_id
    and p.workspace_id=_workspace_id
    and p.archived_at is null
  for update;
  if not found then raise exception 'Project not found'; end if;

  if _key is not null then
    select e.* into _execution
    from public.leah_executions e
    where e.workspace_id=_workspace_id
      and e.project_id=_project_id
      and e.idempotency_key=_key
    limit 1;
    if found then _replay := true; end if;
  end if;

  if _execution.id is null then
    begin
      insert into public.leah_executions(
        workspace_id,project_id,requested_by,status,idempotency_key,input
      ) values (
        _workspace_id,_project_id,_requested_by,'queued',_key,_input
      ) returning * into _execution;
    exception when unique_violation then
      if _key is null then raise; end if;
      select e.* into _execution
      from public.leah_executions e
      where e.workspace_id=_workspace_id
        and e.project_id=_project_id
        and e.idempotency_key=_key
      limit 1;
      if not found then raise; end if;
      _replay := true;
    end;
  end if;

  -- System markers are authoritative and override any caller-supplied keys with the
  -- same names. The same marker is used for manual and scheduled bootstrap work.
  _bootstrap_input := _input || jsonb_build_object(
    'orchestration_bootstrap', true,
    'source', _normalized_source
  );

  -- A terminal idempotent replay is returned as truth; it is never restarted.
  if _execution.status in ('queued','running') then
    select to_jsonb(t) into _task
    from public.leah_tasks t
    where t.workspace_id=_workspace_id
      and t.execution_id=_execution.id
      and t.agent_role='planner'
      and t.input->>'orchestration_bootstrap'='true'
    order by t.seq
    limit 1;

    if _task is null then
      _task := public.leah_enqueue_task(
        _execution.id,
        1000,
        _bootstrap_input,
        'planner',
        null,
        null,
        '{}'::uuid[],
        3
      );
    end if;
  end if;

  return jsonb_build_object(
    'execution', jsonb_build_object(
      'id', _execution.id,
      'project_id', _execution.project_id,
      'status', _execution.status,
      'idempotency_key', _execution.idempotency_key,
      'attempt', _execution.attempt,
      'created_at', _execution.created_at
    ),
    'bootstrap_task', _task,
    'idempotent_replay', _replay,
    'source', _normalized_source
  );
end;
$$;

revoke all on function public.leah_start_execution(uuid,uuid,uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.leah_start_execution(uuid,uuid,uuid,text,jsonb,text) to service_role;
