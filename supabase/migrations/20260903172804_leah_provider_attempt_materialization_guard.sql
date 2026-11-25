-- MR7-A hardening: claiming a materialization authorizes a NEW external side effect.
-- It therefore requires the task's current active lease. Finalization may still run
-- after lease expiry because it only records truth for an already-claimed side effect.

create or replace function public.leah_claim_provider_materialization(
  _task_id uuid,
  _lease_token uuid,
  _attempt_id uuid,
  _materialization_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _row public.leah_provider_attempts%rowtype;
  _task public.leah_tasks%rowtype;
  _now timestamptz := clock_timestamp();
begin
  if _materialization_key is null or length(trim(_materialization_key)) not between 1 and 200 then
    raise exception 'Invalid materialization key';
  end if;

  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions x on x.id=t.execution_id and x.workspace_id=t.workspace_id
  where t.id=_task_id
    and t.status='running'
    and t.lease_token=_lease_token
    and t.lease_expires_at > _now
    and x.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select a.* into _row
  from public.leah_provider_attempts a
  where a.attempt_id=_attempt_id
    and a.task_id=_task.id
    and a.execution_id=_task.execution_id
    and a.workspace_id=_task.workspace_id
    and a.authority_lease_token=_lease_token
  for update;
  if not found then raise exception 'Provider attempt not found'; end if;
  if _row.status<>'succeeded' or not _row.canonical_result then raise exception 'Provider attempt is not canonical'; end if;

  if _row.materialization_status is not null then
    if _row.materialization_key<>trim(_materialization_key) then raise exception 'LEAH_PROVIDER_MATERIALIZATION_CONFLICT'; end if;
    return jsonb_build_object(
      'attempt_id',_row.attempt_id,
      'logical_request_id',_row.logical_request_id,
      'status',_row.materialization_status,
      'materialization_key',_row.materialization_key,
      'materialized_ref',_row.materialized_ref,
      'idempotent_replay',true
    );
  end if;

  update public.leah_provider_attempts
  set materialization_status='claimed', materialization_key=trim(_materialization_key)
  where id=_row.id and workspace_id=_row.workspace_id
  returning * into _row;

  return jsonb_build_object(
    'attempt_id',_row.attempt_id,
    'logical_request_id',_row.logical_request_id,
    'status',_row.materialization_status,
    'materialization_key',_row.materialization_key,
    'idempotent_replay',false
  );
exception
  when unique_violation then
    raise exception 'LEAH_PROVIDER_MATERIALIZATION_ALREADY_CLAIMED';
end;
$$;

revoke all on function public.leah_claim_provider_materialization(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.leah_claim_provider_materialization(uuid,uuid,uuid,text) to service_role;
;
