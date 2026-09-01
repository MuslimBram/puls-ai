\set ON_ERROR_STOP on
begin;

create temp table mr3_archive_state(
  key text primary key,
  payload jsonb null
) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('fd200000-0000-0000-0000-000000000001','authenticated','authenticated','leah-mr3-archive@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values ('fd100000-0000-0000-0000-000000000001','LEAH MR3 Archive','leah-mr3-archive','fd200000-0000-0000-0000-000000000001');

insert into public.workspace_members(workspace_id,user_id,role)
values ('fd100000-0000-0000-0000-000000000001','fd200000-0000-0000-0000-000000000001','owner');

insert into public.leah_workspace_entitlements(workspace_id,status,source,concurrency_limit)
values ('fd100000-0000-0000-0000-000000000001','active','mr3-archive-test',1);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values ('fd300000-0000-0000-0000-000000000001','fd100000-0000-0000-0000-000000000001','Archive Project','archive-project','fd200000-0000-0000-0000-000000000001');

insert into public.leah_schedules(
  id,workspace_id,project_id,name,cadence_seconds,enabled,input,next_run_at,created_by
) values (
  'fd600000-0000-0000-0000-000000000001','fd100000-0000-0000-0000-000000000001',
  'fd300000-0000-0000-0000-000000000001','Archive schedule',60,true,'{}',clock_timestamp()+interval '5 minutes',
  'fd200000-0000-0000-0000-000000000001'
);

insert into mr3_archive_state(key,payload)
values ('start', public.leah_start_execution(
  'fd100000-0000-0000-0000-000000000001',
  'fd300000-0000-0000-0000-000000000001',
  'fd200000-0000-0000-0000-000000000001',
  'archive-running-one',
  '{"goal":"must stop"}'::jsonb,
  'manual'
));

insert into mr3_archive_state(key,payload)
values ('claim', public.leah_claim_next_task('mr3-archive-worker',60));

do $$
declare
  start_result jsonb;
  claim_result jsonb;
  eid uuid;
  tid uuid;
  execution_status text;
  task_status text;
begin
  select payload into start_result from mr3_archive_state where key='start';
  select payload into claim_result from mr3_archive_state where key='claim';
  eid := (start_result->'execution'->>'id')::uuid;
  tid := (start_result->'bootstrap_task'->>'id')::uuid;

  if claim_result is null or (claim_result->>'id')::uuid <> tid then
    raise exception 'Archive fixture task was not claimed';
  end if;
  select status into execution_status from public.leah_executions where id=eid;
  select status into task_status from public.leah_tasks where id=tid;
  if execution_status <> 'running' or task_status <> 'running' then
    raise exception 'Archive fixture did not enter running state';
  end if;
end $$;

-- Simulate the session API's direct project UPDATE. The DB trigger must enforce the
-- same orchestration cleanup even though this path does not call leah_archive_project.
update public.leah_projects
set status='archived',
    archived_at=clock_timestamp(),
    updated_at=clock_timestamp(),
    version=version+1
where id='fd300000-0000-0000-0000-000000000001'
  and workspace_id='fd100000-0000-0000-0000-000000000001';

do $$
declare
  start_result jsonb;
  eid uuid;
  tid uuid;
  execution_status text;
  task_status text;
  lease_token uuid;
  schedule_enabled boolean;
  project_status text;
  project_archived timestamptz;
begin
  select payload into start_result from mr3_archive_state where key='start';
  eid := (start_result->'execution'->>'id')::uuid;
  tid := (start_result->'bootstrap_task'->>'id')::uuid;

  select status into execution_status from public.leah_executions where id=eid;
  select status, lease_token into task_status, lease_token from public.leah_tasks where id=tid;
  select enabled into schedule_enabled from public.leah_schedules where id='fd600000-0000-0000-0000-000000000001';
  select status, archived_at into project_status, project_archived from public.leah_projects where id='fd300000-0000-0000-0000-000000000001';

  if execution_status <> 'cancelled' then raise exception 'Project archive did not cancel active execution'; end if;
  if task_status <> 'cancelled' then raise exception 'Project archive did not cancel active task'; end if;
  if lease_token is not null then raise exception 'Project archive left active task lease material'; end if;
  if schedule_enabled then raise exception 'Project archive did not disable schedule'; end if;
  if project_status <> 'archived' or project_archived is null then raise exception 'Project archive truth mismatch'; end if;
end $$;

-- Archived projects cannot be silently reopened or represented with half-shaped state.
do $$
begin
  begin
    update public.leah_projects
    set status='planning', archived_at=null
    where id='fd300000-0000-0000-0000-000000000001';
    raise exception 'Project unarchive was accepted';
  exception when others then
    if sqlerrm = 'Project unarchive was accepted' then raise; end if;
  end;

  begin
    update public.leah_projects
    set status='planning'
    where id='fd300000-0000-0000-0000-000000000001';
    raise exception 'Half-shaped archived project state was accepted';
  exception when others then
    if sqlerrm = 'Half-shaped archived project state was accepted' then raise; end if;
  end;
end $$;

-- No schedule work can be generated after archive.
update public.leah_schedules
set next_run_at=clock_timestamp()-interval '1 second'
where id='fd600000-0000-0000-0000-000000000001';

insert into mr3_archive_state(key,payload)
values ('tick_after_archive', public.leah_scheduler_tick(20));

do $$
declare tick_result jsonb;
begin
  select payload into tick_result from mr3_archive_state where key='tick_after_archive';
  if (tick_result->>'processed')::integer <> 0 then
    raise exception 'Archived project schedule produced new work';
  end if;
end $$;

rollback;
\echo 'LEAH PROJECT ARCHIVE LIFECYCLE CONTRACT: PASS'
