-- MR8E — LEAH Observability + Disaster Recovery control plane.
--
-- This migration deliberately does NOT implement a physical database restore.
-- Recovery checkpoints are safe control-plane manifests of canonical LEAH truth;
-- recovery drills verify integrity/recoverability and Production recovery plans
-- require explicit human approval before any later external restore executor could exist.

create or replace function public.leah_jsonb_contains_secret_key(_value jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path=public,pg_temp
as $$
declare
  _key text;
  _child jsonb;
begin
  if _value is null then return false; end if;
  if jsonb_typeof(_value)='object' then
    for _key,_child in select key,value from jsonb_each(_value) loop
      if _key ~* '(api[_-]?key|token|secret|authorization|password|cookie|credential|private[_-]?key)' then
        return true;
      end if;
      if jsonb_typeof(_child) in ('object','array') and public.leah_jsonb_contains_secret_key(_child) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(_value)='array' then
    for _child in select value from jsonb_array_elements(_value) loop
      if jsonb_typeof(_child) in ('object','array') and public.leah_jsonb_contains_secret_key(_child) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$$;

create table public.leah_observability_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  execution_id uuid null,
  task_id uuid null,
  trace_id uuid not null,
  span_id uuid not null,
  parent_span_id uuid null,
  category text not null check (category in ('execution','task','provider','memory','bus','build','deploy','recovery','system')),
  severity text not null check (severity in ('debug','info','warn','error','critical')),
  event_name text not null check (length(trim(event_name)) between 1 and 160),
  event_key text not null check (length(trim(event_key)) between 1 and 240),
  source text not null default 'worker' check (source in ('worker','system')),
  attributes jsonb not null default '{}'::jsonb,
  event_time timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, workspace_id),
  unique (workspace_id, event_key),
  constraint leah_observability_project_fk
    foreign key (project_id, workspace_id)
    references public.leah_projects(id, workspace_id) on delete cascade,
  constraint leah_observability_execution_fk
    foreign key (execution_id, project_id, workspace_id)
    references public.leah_executions(id, project_id, workspace_id) on delete cascade,
  constraint leah_observability_task_fk
    foreign key (task_id, execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id) on delete cascade,
  constraint leah_observability_context_shape_ck
    check (task_id is null or execution_id is not null),
  constraint leah_observability_attribute_size_ck
    check (octet_length(attributes::text) <= 65536),
  constraint leah_observability_secret_key_ck
    check (not public.leah_jsonb_contains_secret_key(attributes))
);
create index leah_observability_project_time_idx
  on public.leah_observability_events(workspace_id,project_id,event_time desc);
create index leah_observability_trace_idx
  on public.leah_observability_events(workspace_id,trace_id,event_time);
create index leah_observability_errors_idx
  on public.leah_observability_events(workspace_id,project_id,severity,event_time desc)
  where severity in ('error','critical');

alter table public.leah_observability_events enable row level security;
alter table public.leah_observability_events force row level security;
revoke all on public.leah_observability_events from public,anon,authenticated;
grant all on public.leah_observability_events to service_role;

create or replace function public.leah_observability_immutable()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  raise exception 'LEAH observability evidence is append-only';
end;
$$;
drop trigger if exists leah_observability_immutable_trigger on public.leah_observability_events;
create trigger leah_observability_immutable_trigger
before update or delete on public.leah_observability_events
for each row execute function public.leah_observability_immutable();

create or replace function public.leah_emit_observability_for_task(
  _task_id uuid,
  _lease_token uuid,
  _event_key text,
  _trace_id uuid,
  _span_id uuid,
  _parent_span_id uuid,
  _category text,
  _severity text,
  _event_name text,
  _attributes jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _existing public.leah_observability_events%rowtype;
  _row public.leah_observability_events%rowtype;
  _attrs jsonb := coalesce(_attributes,'{}'::jsonb);
begin
  if _event_key is null or length(trim(_event_key)) not between 1 and 240 then raise exception 'Invalid observability event key'; end if;
  if _trace_id is null or _span_id is null then raise exception 'Trace and span identifiers are required'; end if;
  if _category not in ('execution','task','provider','memory','bus','build','deploy','recovery','system') then raise exception 'Invalid observability category'; end if;
  if _severity not in ('debug','info','warn','error','critical') then raise exception 'Invalid observability severity'; end if;
  if _event_name is null or length(trim(_event_name)) not between 1 and 160 then raise exception 'Invalid observability event name'; end if;
  if octet_length(_attrs::text) > 65536 then raise exception 'Observability attributes exceed 64 KB'; end if;
  if public.leah_jsonb_contains_secret_key(_attrs) then raise exception 'Secret-like observability attributes are forbidden'; end if;

  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions e on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id and t.status='running' and t.lease_token=_lease_token
    and t.lease_expires_at > clock_timestamp() and e.status='running'
  for share of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select e.* into _existing
  from public.leah_observability_events e
  where e.workspace_id=_task.workspace_id and e.event_key=trim(_event_key);
  if found then
    if _existing.project_id<>_task.project_id or _existing.execution_id is distinct from _task.execution_id
       or _existing.task_id is distinct from _task.id or _existing.trace_id<>_trace_id
       or _existing.span_id<>_span_id or _existing.parent_span_id is distinct from _parent_span_id
       or _existing.category<>_category or _existing.severity<>_severity
       or _existing.event_name<>trim(_event_name) or _existing.attributes<>_attrs then
      raise exception 'LEAH_OBSERVABILITY_IDEMPOTENCY_CONFLICT';
    end if;
    return to_jsonb(_existing) || jsonb_build_object('idempotent_replay',true);
  end if;

  insert into public.leah_observability_events(
    workspace_id,project_id,execution_id,task_id,trace_id,span_id,parent_span_id,
    category,severity,event_name,event_key,source,attributes
  ) values (
    _task.workspace_id,_task.project_id,_task.execution_id,_task.id,_trace_id,_span_id,_parent_span_id,
    _category,_severity,trim(_event_name),trim(_event_key),'worker',_attrs
  ) returning * into _row;
  return to_jsonb(_row) || jsonb_build_object('idempotent_replay',false);
end;
$$;

create or replace function public.leah_list_observability_for_actor(
  _workspace_id uuid,
  _actor_id uuid,
  _project_id uuid,
  _limit integer default 100
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
  if _limit < 1 or _limit > 500 then raise exception 'Invalid observability limit'; end if;
  if not exists(select 1 from public.leah_projects p where p.id=_project_id and p.workspace_id=_workspace_id and p.archived_at is null) then
    raise exception 'Project not found';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.event_time desc),'[]'::jsonb) into _result
  from (
    select e.id,e.trace_id,e.span_id,e.parent_span_id,e.execution_id,e.task_id,e.category,e.severity,
           e.event_name,e.event_key,e.source,e.attributes,e.event_time
    from public.leah_observability_events e
    where e.workspace_id=_workspace_id and e.project_id=_project_id
    order by e.event_time desc limit _limit
  ) x;
  return _result;
end;
$$;

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
      'in_flight',(select count(*) from public.leah_provider_attempts a where a.workspace_id=_workspace_id and a.project_id=_project_id and a.status='in_flight'),
      'unknown',(select count(*) from public.leah_provider_attempts a where a.workspace_id=_workspace_id and a.project_id=_project_id and a.status='unknown')
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

create table public.leah_recovery_checkpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  manifest jsonb not null,
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  requested_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(id,workspace_id),
  constraint leah_recovery_checkpoint_project_fk
    foreign key(project_id,workspace_id) references public.leah_projects(id,workspace_id) on delete cascade,
  constraint leah_recovery_manifest_size_ck check (octet_length(manifest::text) <= 1048576),
  constraint leah_recovery_manifest_secret_ck check (not public.leah_jsonb_contains_secret_key(manifest))
);
create index leah_recovery_checkpoints_project_idx
  on public.leah_recovery_checkpoints(workspace_id,project_id,created_at desc);
alter table public.leah_recovery_checkpoints enable row level security;
alter table public.leah_recovery_checkpoints force row level security;
revoke all on public.leah_recovery_checkpoints from public,anon,authenticated;
grant all on public.leah_recovery_checkpoints to service_role;

create or replace function public.leah_build_recovery_manifest(_workspace_id uuid,_project_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'version',1,
    'workspace_id',_workspace_id,
    'project_id',_project_id,
    'artifacts',coalesce((
      select jsonb_agg(jsonb_build_object('id',a.id,'version',a.version,'path',a.path,'content_hash',a.content_hash,'byte_size',a.byte_size) order by a.id,a.version)
      from public.leah_project_artifacts a where a.workspace_id=_workspace_id and a.project_id=_project_id
    ),'[]'::jsonb),
    'semantic_memory',coalesce((
      select jsonb_agg(jsonb_build_object('id',m.id,'status',m.status,'memory_kind',m.memory_kind,'embedding_content_hash',m.embedding_content_hash) order by m.id)
      from public.leah_semantic_memory m where m.workspace_id=_workspace_id and m.project_id=_project_id and m.status not in ('forgotten','expired')
    ),'[]'::jsonb),
    'builds',coalesce((
      select jsonb_agg(jsonb_build_object('id',b.id,'status',b.status,'source_manifest_hash',b.source_manifest_hash,'output_digest',b.output_digest) order by b.id)
      from public.leah_builds b where b.workspace_id=_workspace_id and b.project_id=_project_id
    ),'[]'::jsonb),
    'deployments',coalesce((
      select jsonb_agg(jsonb_build_object('id',d.id,'build_id',d.build_id,'target_id',d.target_id,'environment',d.environment,'provider',d.provider,'status',d.status,'provider_ref',d.provider_ref) order by d.id)
      from public.leah_deployments d where d.workspace_id=_workspace_id and d.project_id=_project_id
    ),'[]'::jsonb),
    'agent_bus',coalesce((
      select jsonb_agg(jsonb_build_object('id',m.id,'execution_id',m.execution_id,'kind',m.kind,'status',m.status,'correlation_id',m.correlation_id) order by m.id)
      from public.leah_agent_messages m where m.workspace_id=_workspace_id and m.project_id=_project_id
    ),'[]'::jsonb)
  );
$$;

create or replace function public.leah_create_recovery_checkpoint_for_actor(
  _workspace_id uuid,_actor_id uuid,_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _manifest jsonb; _hash text; _row public.leah_recovery_checkpoints%rowtype;
begin
  if not public.has_workspace_role_for_user(_actor_id,_workspace_id,array['owner','admin']::text[]) then
    raise exception 'Forbidden: LEAH workspace admin required';
  end if;
  if not exists(select 1 from public.leah_projects p where p.id=_project_id and p.workspace_id=_workspace_id and p.archived_at is null) then
    raise exception 'Project not found';
  end if;
  _manifest := public.leah_build_recovery_manifest(_workspace_id,_project_id);
  if public.leah_jsonb_contains_secret_key(_manifest) then raise exception 'Recovery manifest contains forbidden secret-like keys'; end if;
  _hash := encode(digest(convert_to(_manifest::text,'UTF8'),'sha256'),'hex');
  insert into public.leah_recovery_checkpoints(workspace_id,project_id,manifest,manifest_hash,requested_by)
  values(_workspace_id,_project_id,_manifest,_hash,_actor_id) returning * into _row;
  return to_jsonb(_row);
end;
$$;

create or replace function public.leah_verify_recovery_checkpoint_core(_checkpoint_id uuid,_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  _c public.leah_recovery_checkpoints%rowtype;
  _hash_ok boolean;
  _artifact_ok boolean;
  _semantic_ok boolean;
  _build_ok boolean;
begin
  select c.* into _c from public.leah_recovery_checkpoints c where c.id=_checkpoint_id and c.workspace_id=_workspace_id;
  if not found then raise exception 'Recovery checkpoint not found'; end if;
  _hash_ok := _c.manifest_hash = encode(digest(convert_to(_c.manifest::text,'UTF8'),'sha256'),'hex');
  _artifact_ok := not exists(
    select 1 from jsonb_array_elements(coalesce(_c.manifest->'artifacts','[]'::jsonb)) x
    where not exists(
      select 1 from public.leah_project_artifacts a
      where a.id=(x->>'id')::uuid and a.workspace_id=_c.workspace_id and a.project_id=_c.project_id
        and a.version=(x->>'version')::integer and a.content_hash=x->>'content_hash'
        and a.path=x->>'path' and a.byte_size=(x->>'byte_size')::bigint
    )
  );
  _semantic_ok := not exists(
    select 1 from jsonb_array_elements(coalesce(_c.manifest->'semantic_memory','[]'::jsonb)) x
    where not exists(
      select 1 from public.leah_semantic_memory m
      where m.id=(x->>'id')::uuid and m.workspace_id=_c.workspace_id and m.project_id=_c.project_id
        and m.status=x->>'status' and m.memory_kind=x->>'memory_kind'
        and m.embedding_content_hash is not distinct from nullif(x->>'embedding_content_hash','')
    )
  );
  _build_ok := not exists(
    select 1 from jsonb_array_elements(coalesce(_c.manifest->'builds','[]'::jsonb)) x
    where not exists(
      select 1 from public.leah_builds b
      where b.id=(x->>'id')::uuid and b.workspace_id=_c.workspace_id and b.project_id=_c.project_id
        and b.source_manifest_hash=x->>'source_manifest_hash'
        and b.output_digest is not distinct from nullif(x->>'output_digest','')
    )
  );
  return jsonb_build_object(
    'checkpoint_id',_c.id,'manifest_hash_valid',_hash_ok,'artifact_references_valid',_artifact_ok,
    'semantic_references_valid',_semantic_ok,'build_references_valid',_build_ok,
    'valid',(_hash_ok and _artifact_ok and _semantic_ok and _build_ok)
  );
end;
$$;

create or replace function public.leah_verify_recovery_checkpoint_for_actor(
  _workspace_id uuid,_actor_id uuid,_checkpoint_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.has_workspace_role_for_user(_actor_id,_workspace_id,array['owner','admin','member']::text[]) then
    raise exception 'Forbidden: LEAH workspace access required';
  end if;
  return public.leah_verify_recovery_checkpoint_core(_checkpoint_id,_workspace_id);
end;
$$;

create or replace function public.leah_recovery_checkpoint_immutable()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$ begin raise exception 'LEAH recovery checkpoint is immutable'; end; $$;
drop trigger if exists leah_recovery_checkpoint_immutable_trigger on public.leah_recovery_checkpoints;
create trigger leah_recovery_checkpoint_immutable_trigger
before update or delete on public.leah_recovery_checkpoints
for each row execute function public.leah_recovery_checkpoint_immutable();

create table public.leah_recovery_drills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  checkpoint_id uuid not null,
  requested_by uuid not null,
  status text not null check(status in ('succeeded','failed')),
  integrity_verified boolean not null,
  duration_ms integer not null check(duration_ms>=0),
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(id,workspace_id),
  constraint leah_recovery_drill_checkpoint_fk foreign key(checkpoint_id,workspace_id)
    references public.leah_recovery_checkpoints(id,workspace_id) on delete cascade,
  constraint leah_recovery_drill_result_size_ck check(octet_length(result::text)<=65536),
  constraint leah_recovery_drill_secret_ck check(not public.leah_jsonb_contains_secret_key(result))
);
alter table public.leah_recovery_drills enable row level security;
alter table public.leah_recovery_drills force row level security;
revoke all on public.leah_recovery_drills from public,anon,authenticated;
grant all on public.leah_recovery_drills to service_role;

create or replace function public.leah_run_recovery_drill_for_actor(
  _workspace_id uuid,_actor_id uuid,_checkpoint_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _started timestamptz:=clock_timestamp(); _verify jsonb; _c public.leah_recovery_checkpoints%rowtype; _row public.leah_recovery_drills%rowtype;
begin
  if not public.has_workspace_role_for_user(_actor_id,_workspace_id,array['owner','admin']::text[]) then
    raise exception 'Forbidden: LEAH workspace admin required';
  end if;
  select c.* into _c from public.leah_recovery_checkpoints c where c.id=_checkpoint_id and c.workspace_id=_workspace_id;
  if not found then raise exception 'Recovery checkpoint not found'; end if;
  _verify:=public.leah_verify_recovery_checkpoint_core(_checkpoint_id,_workspace_id);
  insert into public.leah_recovery_drills(workspace_id,project_id,checkpoint_id,requested_by,status,integrity_verified,duration_ms,result)
  values(_workspace_id,_c.project_id,_checkpoint_id,_actor_id,
    case when (_verify->>'valid')::boolean then 'succeeded' else 'failed' end,
    (_verify->>'valid')::boolean,greatest(0,(extract(epoch from (clock_timestamp()-_started))*1000)::integer),_verify)
  returning * into _row;
  return to_jsonb(_row);
end;
$$;

create table public.leah_recovery_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  checkpoint_id uuid not null,
  environment text not null check(environment in ('preview','production')),
  status text not null check(status in ('prepared','awaiting_approval','approved','rejected','verified','failed')),
  requested_by uuid not null,
  approved_by uuid null,
  approved_at timestamptz null,
  rejected_by uuid null,
  rejected_at timestamptz null,
  verification_result jsonb null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(id,workspace_id),
  constraint leah_recovery_plan_checkpoint_fk foreign key(checkpoint_id,workspace_id)
    references public.leah_recovery_checkpoints(id,workspace_id) on delete restrict,
  constraint leah_recovery_plan_approval_shape_ck check(
    (environment='preview' and status in ('prepared','verified','failed') and approved_by is null and approved_at is null and rejected_by is null and rejected_at is null)
    or
    (environment='production' and (
      (status='awaiting_approval' and approved_by is null and approved_at is null and rejected_by is null and rejected_at is null)
      or (status in ('approved','verified','failed') and approved_by is not null and approved_at is not null and rejected_by is null and rejected_at is null)
      or (status='rejected' and rejected_by is not null and rejected_at is not null and approved_by is null and approved_at is null)
    ))
  ),
  constraint leah_recovery_plan_verification_size_ck check(verification_result is null or octet_length(verification_result::text)<=65536),
  constraint leah_recovery_plan_secret_ck check(verification_result is null or not public.leah_jsonb_contains_secret_key(verification_result))
);
alter table public.leah_recovery_plans enable row level security;
alter table public.leah_recovery_plans force row level security;
revoke all on public.leah_recovery_plans from public,anon,authenticated;
grant all on public.leah_recovery_plans to service_role;

create or replace function public.leah_prepare_recovery_plan_for_actor(
  _workspace_id uuid,_actor_id uuid,_checkpoint_id uuid,_environment text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _c public.leah_recovery_checkpoints%rowtype; _row public.leah_recovery_plans%rowtype;
begin
  if not public.has_workspace_role_for_user(_actor_id,_workspace_id,array['owner','admin']::text[]) then
    raise exception 'Forbidden: LEAH workspace admin required';
  end if;
  if _environment not in ('preview','production') then raise exception 'Invalid recovery environment'; end if;
  select c.* into _c from public.leah_recovery_checkpoints c where c.id=_checkpoint_id and c.workspace_id=_workspace_id;
  if not found then raise exception 'Recovery checkpoint not found'; end if;
  insert into public.leah_recovery_plans(workspace_id,project_id,checkpoint_id,environment,status,requested_by)
  values(_workspace_id,_c.project_id,_checkpoint_id,_environment,
    case when _environment='production' then 'awaiting_approval' else 'prepared' end,_actor_id)
  returning * into _row;
  return to_jsonb(_row);
end;
$$;

create or replace function public.leah_decide_recovery_plan_for_actor(
  _workspace_id uuid,_actor_id uuid,_plan_id uuid,_decision text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _row public.leah_recovery_plans%rowtype;
begin
  if not public.has_workspace_role_for_user(_actor_id,_workspace_id,array['owner','admin']::text[]) then
    raise exception 'Forbidden: LEAH workspace admin required';
  end if;
  if _decision not in ('approve','reject') then raise exception 'Invalid recovery decision'; end if;
  select p.* into _row from public.leah_recovery_plans p
  where p.id=_plan_id and p.workspace_id=_workspace_id and p.environment='production' and p.status='awaiting_approval'
  for update;
  if not found then raise exception 'Production recovery plan is not awaiting approval'; end if;
  update public.leah_recovery_plans p set
    status=case when _decision='approve' then 'approved' else 'rejected' end,
    approved_by=case when _decision='approve' then _actor_id else null end,
    approved_at=case when _decision='approve' then clock_timestamp() else null end,
    rejected_by=case when _decision='reject' then _actor_id else null end,
    rejected_at=case when _decision='reject' then clock_timestamp() else null end,
    updated_at=clock_timestamp()
  where p.id=_row.id and p.workspace_id=_row.workspace_id returning * into _row;
  return to_jsonb(_row);
end;
$$;

create or replace function public.leah_verify_recovery_plan_for_actor(
  _workspace_id uuid,_actor_id uuid,_plan_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _row public.leah_recovery_plans%rowtype; _verify jsonb;
begin
  if not public.has_workspace_role_for_user(_actor_id,_workspace_id,array['owner','admin']::text[]) then
    raise exception 'Forbidden: LEAH workspace admin required';
  end if;
  select p.* into _row from public.leah_recovery_plans p
  where p.id=_plan_id and p.workspace_id=_workspace_id
    and ((p.environment='preview' and p.status='prepared') or (p.environment='production' and p.status='approved'))
  for update;
  if not found then raise exception 'Recovery plan is not authorized for verification'; end if;
  _verify:=public.leah_verify_recovery_checkpoint_core(_row.checkpoint_id,_workspace_id);
  update public.leah_recovery_plans p set
    status=case when (_verify->>'valid')::boolean then 'verified' else 'failed' end,
    verification_result=_verify,updated_at=clock_timestamp()
  where p.id=_row.id and p.workspace_id=_row.workspace_id returning * into _row;
  return to_jsonb(_row);
end;
$$;

create or replace function public.leah_list_recovery_for_actor(
  _workspace_id uuid,_actor_id uuid,_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.has_workspace_role_for_user(_actor_id,_workspace_id,array['owner','admin','member']::text[]) then
    raise exception 'Forbidden: LEAH workspace access required';
  end if;
  return jsonb_build_object(
    'checkpoints',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'manifest_hash',c.manifest_hash,'requested_by',c.requested_by,'created_at',c.created_at) order by c.created_at desc)
      from public.leah_recovery_checkpoints c where c.workspace_id=_workspace_id and c.project_id=_project_id),'[]'::jsonb),
    'drills',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc)
      from public.leah_recovery_drills d where d.workspace_id=_workspace_id and d.project_id=_project_id),'[]'::jsonb),
    'plans',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc)
      from public.leah_recovery_plans p where p.workspace_id=_workspace_id and p.project_id=_project_id),'[]'::jsonb)
  );
end;
$$;

-- No physical restore executor is intentionally defined in MR8E.
-- Recovery plans can only be verified. A future destructive executor requires a
-- separate reviewed migration and explicit Production authorization.

revoke all on function public.leah_jsonb_contains_secret_key(jsonb) from public,anon,authenticated;
revoke all on function public.leah_observability_immutable() from public,anon,authenticated;
revoke all on function public.leah_emit_observability_for_task(uuid,uuid,text,uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.leah_list_observability_for_actor(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.leah_runtime_health_for_actor(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.leah_build_recovery_manifest(uuid,uuid) from public,anon,authenticated;
revoke all on function public.leah_create_recovery_checkpoint_for_actor(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.leah_verify_recovery_checkpoint_core(uuid,uuid) from public,anon,authenticated;
revoke all on function public.leah_verify_recovery_checkpoint_for_actor(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.leah_recovery_checkpoint_immutable() from public,anon,authenticated;
revoke all on function public.leah_run_recovery_drill_for_actor(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.leah_prepare_recovery_plan_for_actor(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.leah_decide_recovery_plan_for_actor(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.leah_verify_recovery_plan_for_actor(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.leah_list_recovery_for_actor(uuid,uuid,uuid) from public,anon,authenticated;

grant execute on function public.leah_emit_observability_for_task(uuid,uuid,text,uuid,uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.leah_list_observability_for_actor(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.leah_runtime_health_for_actor(uuid,uuid,uuid) to service_role;
grant execute on function public.leah_create_recovery_checkpoint_for_actor(uuid,uuid,uuid) to service_role;
grant execute on function public.leah_verify_recovery_checkpoint_for_actor(uuid,uuid,uuid) to service_role;
grant execute on function public.leah_run_recovery_drill_for_actor(uuid,uuid,uuid) to service_role;
grant execute on function public.leah_prepare_recovery_plan_for_actor(uuid,uuid,uuid,text) to service_role;
grant execute on function public.leah_decide_recovery_plan_for_actor(uuid,uuid,uuid,text) to service_role;
grant execute on function public.leah_verify_recovery_plan_for_actor(uuid,uuid,uuid) to service_role;
grant execute on function public.leah_list_recovery_for_actor(uuid,uuid,uuid) to service_role;
