create or replace function public.leah_list_byok_providers_for_task(
  _task_id uuid,
  _lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _task public.leah_tasks%rowtype; _ent public.leah_workspace_entitlements%rowtype; _result jsonb; _now timestamptz:=clock_timestamp();
begin
  select t.* into _task from public.leah_tasks t
  join public.leah_executions x on x.id=t.execution_id and x.workspace_id=t.workspace_id
  where t.id=_task_id and t.status='running' and t.lease_token=_lease_token and t.lease_expires_at>_now and x.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;
  select e.* into _ent from public.leah_workspace_entitlements e where e.workspace_id=_task.workspace_id for share;
  if not found or _ent.status not in ('trial','active','grace') or (_ent.valid_until is not null and _ent.valid_until<=_now) then raise exception 'LEAH entitlement inactive'; end if;
  if _ent.ai_funding_mode not in ('byok','hybrid') then raise exception 'LEAH_BYOK_DISABLED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('provider',b.provider,'model',b.model) order by b.provider),'[]'::jsonb) into _result
  from public.leah_workspace_provider_bindings b
  join public.leah_secret_registry s on s.id=b.secret_id and s.workspace_id=b.workspace_id
  where b.workspace_id=_task.workspace_id and b.status='active' and b.validation_status='valid' and s.status='active';
  return _result;
end;
$$;
revoke all on function public.leah_list_byok_providers_for_task(uuid,uuid) from public,anon,authenticated;
grant execute on function public.leah_list_byok_providers_for_task(uuid,uuid) to service_role;;
