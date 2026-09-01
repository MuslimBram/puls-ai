\set ON_ERROR_STOP on
begin;

create temp table mr3_scheduler_state(
  key text primary key,
  payload jsonb null
) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('fb200000-0000-0000-0000-000000000001','authenticated','authenticated','leah-mr3-scheduler@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values ('fb100000-0000-0000-0000-000000000001','LEAH MR3 Scheduler','leah-mr3-scheduler','fb200000-0000-0000-0000-000000000001');

insert into public.workspace_members(workspace_id,user_id,role)
values ('fb100000-0000-0000-0000-000000000001','fb200000-0000-0000-0000-000000000001','owner');

insert into public.leah_workspace_entitlements(workspace_id,status,source,concurrency_limit)
values ('fb100000-0000-0000-0000-000000000001','active','mr3-scheduler-test',1);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values ('fb300000-0000-0000-0000-000000000001','fb100000-0000-0000-0000-000000000001','Scheduled Project','scheduled-project','fb200000-0000-0000-0000-000000000001');

insert into public.leah_schedules(
  id,workspace_id,project_id,name,cadence_seconds,enabled,input,next_run_at,created_by
) values (
  'fb600000-0000-0000-0000-000000000001','fb100000-0000-0000-0000-000000000001',
  'fb300000-0000-0000-0000-000000000001','MR3 scheduled planner',60,true,
  '{"goal":"scheduled build","source":"spoofed","orchestration_bootstrap":false}',clock_timestamp()-interval '1 second',
  'fb200000-0000-0000-0000-000000000001'
);

insert into mr3_scheduler_state(key,payload)
values ('tick_one', public.leah_scheduler_tick(20));
insert into mr3_scheduler_state(key,payload)
values ('tick_two', public.leah_scheduler_tick(20));

do $$
declare
  one jsonb;
  two jsonb;
  execution_id uuid;
  task_id uuid;
  execution_count integer;
  task_count integer;
  role_name text;
  bootstrap text;
  source_name text;
  schedule_id text;
begin
  select payload into one from mr3_scheduler_state where key='tick_one';
  select payload into two from mr3_scheduler_state where key='tick_two';

  if (one->>'processed')::integer <> 1 then raise exception 'Due schedule was not processed once'; end if;
  if (two->>'processed')::integer <> 0 then raise exception 'Schedule replayed before next_run_at'; end if;

  execution_id := ((one->'executions'->0)->>'execution_id')::uuid;
  task_id := ((one->'executions'->0)->>'task_id')::uuid;
  if execution_id is null or task_id is null then raise exception 'Scheduler did not return execution/task identity'; end if;

  select count(*) into execution_count
  from public.leah_executions
  where id=execution_id
    and workspace_id='fb100000-0000-0000-0000-000000000001'
    and project_id='fb300000-0000-0000-0000-000000000001'
    and status='queued'
    and idempotency_key like 'schedule:fb600000-0000-0000-0000-000000000001:%';
  if execution_count <> 1 then raise exception 'Scheduled execution truth mismatch'; end if;

  select count(*), min(agent_role), min(input->>'orchestration_bootstrap'), min(input->>'source'), min(input->>'schedule_id')
    into task_count, role_name, bootstrap, source_name, schedule_id
  from public.leah_tasks
  where id=task_id and execution_id=execution_id;
  if task_count <> 1 then raise exception 'Scheduler bootstrap task missing'; end if;
  if role_name <> 'planner' then raise exception 'Scheduler bootstrap task is not planner work'; end if;
  if bootstrap <> 'true' then raise exception 'Canonical orchestration bootstrap marker missing'; end if;
  if source_name <> 'schedule' then raise exception 'Scheduled bootstrap source marker mismatch'; end if;
  if schedule_id <> 'fb600000-0000-0000-0000-000000000001' then raise exception 'Scheduled bootstrap lost schedule identity'; end if;
end $$;

insert into mr3_scheduler_state(key,payload)
values ('claim', public.leah_claim_next_task('mr3-scheduler-worker',60));

do $$
declare c jsonb; expected_task uuid;
begin
  select payload into c from mr3_scheduler_state where key='claim';
  select (((payload->'executions'->0)->>'task_id')::uuid)
    into expected_task
  from mr3_scheduler_state where key='tick_one';

  if c is null then raise exception 'Scheduled planner task was not claimable'; end if;
  if (c->>'id')::uuid <> expected_task then raise exception 'Claim returned different task than scheduler bootstrap'; end if;
  if c->>'agent_role' <> 'planner' then raise exception 'Claimed scheduled task lost planner role'; end if;

  perform public.leah_finish_task(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{"planned":true}'::jsonb,null,1000
  );
end $$;

-- With the real bootstrap work finished, truthful terminal success is now allowed.
do $$
declare
  eid uuid;
  result jsonb;
begin
  select (((payload->'executions'->0)->>'execution_id')::uuid)
    into eid
  from mr3_scheduler_state where key='tick_one';
  result := public.leah_finish_execution(eid,'running','succeeded',null,null);
  if result->>'status' <> 'succeeded' then raise exception 'Scheduled execution could not close truthfully'; end if;
end $$;

rollback;
\echo 'LEAH SCHEDULER BOOTSTRAP CONTRACT: PASS'
