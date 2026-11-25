-- MR8E hardening: canonical MR7 project join + immutable recovery evidence/snapshots.

create or replace function public.leah_runtime_health_for_actor(
  _workspace_id uuid,
  _actor_id uuid,
  _project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _result jsonb;
begin
  if not public.has_workspace_role_for_user(_actor_id,_workspace_id,array['owner','admin','member']::text[]) then
    raise exception 'Forbidden: LEAH workspace access required';
  end if;
  if not exists(select 1 from public.leah_projects p where p.id=_project_id and p.workspace_id=_workspace_id and p.archived_at is null) then
    raise exception 'Project not found';
  end if;
  select jsonb_build_object(
    'project_id',_project_id,
    'executions',jsonb_build_object(
      'running',(select count(*) from public.leah_executions e where e.workspace_id=_workspace_id and e.project_id=_project_id and e.status='running'),
      'failed',(select count(*) from public.leah_executions e where e.workspace_id=_workspace_id and e.project_id=_project_id and e.status='failed')
    ),
    'tasks',jsonb_build_object(
      'running',(select count(*) from public.leah_tasks t where t.workspace_id=_workspace_id and t.project_id=_project_id and t.status='running'),
      'retry_wait',(select count(*) from public.leah_tasks t where t.workspace_id=_workspace_id and t.project_id=_project_id and t.status='retry_wait'),
      'failed',(select count(*) from public.leah_tasks t where t.workspace_id=_workspace_id and t.project_id=_project_id and t.status='failed')
    ),
    'provider_attempts',jsonb_build_object(
      'in_flight',(select count(*) from public.leah_provider_attempts a join public.leah_executions x on x.id=a.execution_id and x.workspace_id=a.workspace_id where a.workspace_id=_workspace_id and x.project_id=_project_id and a.status='in_flight'),
      'unknown',(select count(*) from public.leah_provider_attempts a join public.leah_executions x on x.id=a.execution_id and x.workspace_id=a.workspace_id where a.workspace_id=_workspace_id and x.project_id=_project_id and a.status='unknown')
    ),
    'memory',jsonb_build_object(
      'embedded',(select count(*) from public.leah_semantic_memory m where m.workspace_id=_workspace_id and m.project_id=_project_id and m.status='embedded'),
      'failed',(select count(*) from public.leah_semantic_memory m where m.workspace_id=_workspace_id and m.project_id=_project_id and m.status='failed')
    ),
    'agent_bus',jsonb_build_object(
      'queued',(select count(*) from public.leah_agent_messages m where m.workspace_id=_workspace_id and m.project_id=_project_id and m.status='queued'),
      'dead_letter',(select count(*) from public.leah_agent_messages m where m.workspace_id=_workspace_id and m.project_id=_project_id and m.status='dead_letter')
    ),
    'builds',jsonb_build_object(
      'building',(select count(*) from public.leah_builds b where b.workspace_id=_workspace_id and b.project_id=_project_id and b.status='building'),
      'unknown',(select count(*) from public.leah_builds b where b.workspace_id=_workspace_id and b.project_id=_project_id and b.status='unknown'),
      'failed',(select count(*) from public.leah_builds b where b.workspace_id=_workspace_id and b.project_id=_project_id and b.status='failed')
    ),
    'deployments',jsonb_build_object(
      'awaiting_approval',(select count(*) from public.leah_deployments d where d.workspace_id=_workspace_id and d.project_id=_project_id and d.status='awaiting_approval'),
      'deploying',(select count(*) from public.leah_deployments d where d.workspace_id=_workspace_id and d.project_id=_project_id and d.status='deploying'),
      'unknown',(select count(*) from public.leah_deployments d where d.workspace_id=_workspace_id and d.project_id=_project_id and d.status='unknown'),
      'failed',(select count(*) from public.leah_deployments d where d.workspace_id=_workspace_id and d.project_id=_project_id and d.status='failed')
    ),
    'observability',jsonb_build_object(
      'errors_24h',(select count(*) from public.leah_observability_events o where o.workspace_id=_workspace_id and o.project_id=_project_id and o.severity in ('error','critical') and o.event_time >= clock_timestamp()-interval '24 hours')
    ),
    'generated_at',clock_timestamp()
  ) into _result;
  return _result;
end;
$$;

create or replace function public.leah_recovery_drill_immutable()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$ begin raise exception 'LEAH recovery drill evidence is append-only'; end; $$;
drop trigger if exists leah_recovery_drill_immutable_trigger on public.leah_recovery_drills;
create trigger leah_recovery_drill_immutable_trigger
before update or delete on public.leah_recovery_drills
for each row execute function public.leah_recovery_drill_immutable();

create or replace function public.leah_enforce_recovery_plan_snapshot()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.workspace_id<>old.workspace_id or new.project_id<>old.project_id
     or new.checkpoint_id<>old.checkpoint_id or new.environment<>old.environment
     or new.requested_by<>old.requested_by or new.created_at<>old.created_at then
    raise exception 'LEAH recovery plan admission snapshot is immutable';
  end if;
  if old.status in ('verified','failed','rejected') and new is distinct from old then
    raise exception 'Terminal LEAH recovery plan is immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists leah_recovery_plan_snapshot_trigger on public.leah_recovery_plans;
create trigger leah_recovery_plan_snapshot_trigger
before update on public.leah_recovery_plans
for each row execute function public.leah_enforce_recovery_plan_snapshot();

revoke all on function public.leah_recovery_drill_immutable() from public,anon,authenticated;
revoke all on function public.leah_enforce_recovery_plan_snapshot() from public,anon,authenticated;
revoke all on function public.leah_runtime_health_for_actor(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.leah_runtime_health_for_actor(uuid,uuid,uuid) to service_role;
;
