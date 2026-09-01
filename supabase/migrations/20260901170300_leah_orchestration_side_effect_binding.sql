-- MR3 side-effect binding.
-- A worker that lost its task lease must not retain authority to write artifacts,
-- read runtime secrets, transition project state, or mark semantic work complete.

alter table public.leah_project_artifacts
  add column execution_id uuid null,
  add column task_id uuid null;

alter table public.leah_project_artifacts
  add constraint leah_artifact_task_provenance_shape_ck check (
    (execution_id is null and task_id is null)
    or (execution_id is not null and task_id is not null)
  ),
  add constraint leah_artifact_execution_fk foreign key (execution_id, project_id, workspace_id)
    references public.leah_executions(id, project_id, workspace_id) on delete cascade,
  add constraint leah_artifact_task_fk foreign key (task_id, execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id) on delete cascade;

create index leah_project_artifacts_task_idx
  on public.leah_project_artifacts(workspace_id, execution_id, task_id, created_at desc)
  where task_id is not null;

create or replace function public.leah_put_artifact_for_task(
  _task_id uuid,
  _lease_token uuid,
  _kind text,
  _path text,
  _content text,
  _content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _requested_by uuid;
  _latest_id uuid;
  _latest_version integer;
  _artifact public.leah_project_artifacts%rowtype;
begin
  if _task_id is null or _lease_token is null then raise exception 'Task and lease token are required'; end if;
  if _kind is null or length(trim(_kind)) < 1 or length(trim(_kind)) > 80 then raise exception 'Invalid artifact kind'; end if;
  if _path is null or length(trim(_path)) < 1 or length(trim(_path)) > 500 then raise exception 'Invalid artifact path'; end if;
  if _content is null then _content := ''; end if;
  if length(_content) > 1000000 then raise exception 'Artifact content exceeds 1 MB; use object storage'; end if;
  if _content_hash is null or _content_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid artifact content hash'; end if;

  select t.*, e.requested_by
    into _task, _requested_by
  from public.leah_tasks t
  join public.leah_executions e
    on e.id = t.execution_id
   and e.workspace_id = t.workspace_id
  where t.id = _task_id
    and t.status = 'running'
    and t.lease_token = _lease_token
    and t.lease_expires_at > clock_timestamp()
    and e.status = 'running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  -- Serialize version allocation only for this artifact path.
  perform pg_advisory_xact_lock(
    hashtextextended(_task.workspace_id::text || ':' || _task.project_id::text || ':' || trim(_path), 0)
  );

  select a.id, a.version
    into _latest_id, _latest_version
  from public.leah_project_artifacts a
  where a.workspace_id = _task.workspace_id
    and a.project_id = _task.project_id
    and a.path = trim(_path)
  order by a.version desc
  limit 1;

  insert into public.leah_project_artifacts(
    workspace_id, project_id, execution_id, task_id,
    kind, path, content, content_hash, version, supersedes_id, created_by
  ) values (
    _task.workspace_id, _task.project_id, _task.execution_id, _task.id,
    trim(_kind), trim(_path), _content, _content_hash,
    coalesce(_latest_version,0)+1, _latest_id, _requested_by
  ) returning * into _artifact;

  return to_jsonb(_artifact);
end;
$$;

create or replace function public.leah_vault_read_for_task(
  _task_id uuid,
  _lease_token uuid,
  _secret_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _workspace_id uuid;
  _execution_id uuid;
  _requested_by uuid;
begin
  if _task_id is null or _lease_token is null or _secret_id is null then
    raise exception 'Task, lease token and secret are required';
  end if;

  select t.workspace_id, t.execution_id, e.requested_by
    into _workspace_id, _execution_id, _requested_by
  from public.leah_tasks t
  join public.leah_executions e
    on e.id = t.execution_id and e.workspace_id = t.workspace_id
  where t.id = _task_id
    and t.status = 'running'
    and t.lease_token = _lease_token
    and t.lease_expires_at > clock_timestamp()
    and e.status = 'running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  return public.leah_vault_read_for_runtime(
    _workspace_id,
    _requested_by,
    _secret_id,
    _execution_id
  );
end;
$$;

create or replace function public.leah_transition_project_for_task(
  _task_id uuid,
  _lease_token uuid,
  _from_status text,
  _to_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _project public.leah_projects%rowtype;
begin
  if not (
    (_from_status='planning' and _to_status in ('building','failed')) or
    (_from_status='building' and _to_status in ('ready','failed')) or
    (_from_status='ready' and _to_status in ('building','deployed','failed')) or
    (_from_status='deployed' and _to_status in ('building','failed')) or
    (_from_status='failed' and _to_status='building')
  ) then
    raise exception 'Invalid project transition';
  end if;

  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions e
    on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id
    and t.status='running'
    and t.lease_token=_lease_token
    and t.lease_expires_at > clock_timestamp()
    and e.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select p.* into _project
  from public.leah_projects p
  where p.id=_task.project_id
    and p.workspace_id=_task.workspace_id
    and p.status=_from_status
    and p.archived_at is null
  for update;
  if not found then raise exception 'Project state conflict'; end if;

  update public.leah_projects p
  set status=_to_status,
      version=p.version+1,
      updated_at=clock_timestamp()
  where p.id=_project.id and p.workspace_id=_project.workspace_id
  returning * into _project;

  return to_jsonb(_project);
end;
$$;

create or replace function public.leah_mark_semantic_for_task(
  _task_id uuid,
  _lease_token uuid,
  _semantic_id uuid,
  _status text,
  _provider text default null,
  _provider_ref text default null,
  _embedding_ref text default null,
  _error jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _memory public.leah_semantic_memory%rowtype;
begin
  if _status not in ('embedded','failed') then raise exception 'Invalid semantic status'; end if;

  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions e
    on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id
    and t.status='running'
    and t.lease_token=_lease_token
    and t.lease_expires_at > clock_timestamp()
    and e.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select m.* into _memory
  from public.leah_semantic_memory m
  where m.id=_semantic_id
    and m.workspace_id=_task.workspace_id
    and m.project_id=_task.project_id
    and m.status='pending'
  for update;
  if not found then raise exception 'Semantic memory state conflict'; end if;

  if _status='embedded' then
    if _provider is null or length(trim(_provider)) < 1 then raise exception 'provider is required'; end if;
    if _provider_ref is null or length(trim(_provider_ref)) < 1 then raise exception 'provider_ref is required'; end if;
    if _embedding_ref is null or length(trim(_embedding_ref)) < 1 then raise exception 'embedding_ref is required'; end if;
  end if;

  update public.leah_semantic_memory m
  set status=_status,
      provider=case when _status='embedded' then trim(_provider) else m.provider end,
      provider_ref=case when _status='embedded' then trim(_provider_ref) else m.provider_ref end,
      embedding_ref=case when _status='embedded' then trim(_embedding_ref) else m.embedding_ref end,
      error=case when _status='embedded' then null else coalesce(_error,jsonb_build_object('message','Embedding failed')) end,
      updated_at=clock_timestamp()
  where m.id=_memory.id and m.workspace_id=_memory.workspace_id
  returning * into _memory;

  return to_jsonb(_memory);
end;
$$;

-- Terminal execution changes are authoritative in the DB. A success cannot be
-- reported while any task is unfinished/failed/cancelled or while a swarm is open.
create or replace function public.leah_finish_execution(
  _execution_id uuid,
  _from_status text,
  _to_status text,
  _error_code text default null,
  _error_detail jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _execution public.leah_executions%rowtype;
  _task_count integer;
  _now timestamptz := clock_timestamp();
begin
  if _to_status not in ('succeeded','failed','cancelled') then
    raise exception 'Invalid execution terminal status';
  end if;

  select * into _execution
  from public.leah_executions
  where id=_execution_id and status=_from_status
  for update;
  if not found then raise exception 'Execution state conflict'; end if;
  if _from_status not in ('queued','running') then raise exception 'Execution state conflict'; end if;

  if _to_status='succeeded' then
    select count(*) into _task_count
    from public.leah_tasks t
    where t.execution_id=_execution.id and t.workspace_id=_execution.workspace_id;
    if _task_count < 1 then raise exception 'Execution cannot succeed without tasks'; end if;

    if exists (
      select 1 from public.leah_tasks t
      where t.execution_id=_execution.id
        and t.workspace_id=_execution.workspace_id
        and t.status <> 'succeeded'
    ) then
      raise exception 'Execution has unfinished or unsuccessful tasks';
    end if;

    if exists (
      select 1 from public.leah_swarms s
      where s.execution_id=_execution.id
        and s.workspace_id=_execution.workspace_id
        and s.status <> 'succeeded'
    ) then
      raise exception 'Execution has unfinished or unsuccessful swarms';
    end if;
  else
    update public.leah_tasks t
    set status='cancelled',
        ended_at=_now,
        error=coalesce(t.error,jsonb_build_object('code','execution_terminal','message','Execution ended before task completion')),
        lease_owner=null,
        lease_token=null,
        lease_expires_at=null,
        heartbeat_at=null,
        updated_at=_now
    where t.execution_id=_execution.id
      and t.workspace_id=_execution.workspace_id
      and t.status in ('queued','running','retry_wait');

    update public.leah_swarms s
    set status=case when _to_status='failed' then 'failed' else 'cancelled' end,
        ended_at=_now,
        updated_at=_now
    where s.execution_id=_execution.id
      and s.workspace_id=_execution.workspace_id
      and s.status in ('planning','running');
  end if;

  update public.leah_executions e
  set status=_to_status,
      error_code=case when _to_status='failed' then coalesce(nullif(trim(_error_code),''),'execution_failed') else e.error_code end,
      error_detail=case when _to_status='failed' then coalesce(_error_detail,jsonb_build_object('message','Execution failed')) else e.error_detail end,
      ended_at=_now,
      updated_at=_now
  where e.id=_execution.id and e.workspace_id=_execution.workspace_id
  returning * into _execution;

  return to_jsonb(_execution);
end;
$$;

revoke all on function public.leah_put_artifact_for_task(uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.leah_vault_read_for_task(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.leah_transition_project_for_task(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.leah_mark_semantic_for_task(uuid,uuid,uuid,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.leah_finish_execution(uuid,text,text,text,jsonb) from public, anon, authenticated;

grant execute on function public.leah_put_artifact_for_task(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.leah_vault_read_for_task(uuid,uuid,uuid) to service_role;
grant execute on function public.leah_transition_project_for_task(uuid,uuid,text,text) to service_role;
grant execute on function public.leah_mark_semantic_for_task(uuid,uuid,uuid,text,text,text,text,jsonb) to service_role;
grant execute on function public.leah_finish_execution(uuid,text,text,text,jsonb) to service_role;
