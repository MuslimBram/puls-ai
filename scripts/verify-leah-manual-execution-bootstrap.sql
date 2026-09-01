\set ON_ERROR_STOP on
begin;

create temp table mr3_manual_state(
  key text primary key,
  payload jsonb null
) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('fc200000-0000-0000-0000-000000000001','authenticated','authenticated','leah-mr3-manual@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values ('fc100000-0000-0000-0000-000000000001','LEAH MR3 Manual','leah-mr3-manual','fc200000-0000-0000-0000-000000000001');

insert into public.workspace_members(workspace_id,user_id,role)
values ('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000001','owner');

insert into public.leah_workspace_entitlements(workspace_id,status,source,concurrency_limit)
values ('fc100000-0000-0000-0000-000000000001','active','mr3-manual-test',1);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values ('fc300000-0000-0000-0000-000000000001','fc100000-0000-0000-0000-000000000001','Manual Project','manual-project','fc200000-0000-0000-0000-000000000001');

-- Internal start RPC must never be directly browser-executable.
do $$
begin
  if has_function_privilege('anon','public.leah_start_execution(uuid,uuid,uuid,text,jsonb,text)','EXECUTE') then
    raise exception 'anon can start internal LEAH execution RPC';
  end if;
  if has_function_privilege('authenticated','public.leah_start_execution(uuid,uuid,uuid,text,jsonb,text)','EXECUTE') then
    raise exception 'authenticated can start internal LEAH execution RPC';
  end if;
end $$;

insert into mr3_manual_state(key,payload)
values ('first', public.leah_start_execution(
  'fc100000-0000-0000-0000-000000000001',
  'fc300000-0000-0000-0000-000000000001',
  'fc200000-0000-0000-0000-000000000001',
  'manual-idempotent-one',
  '{"goal":"build once","source":"spoofed","orchestration_bootstrap":false}'::jsonb,
  'manual'
));

insert into mr3_manual_state(key,payload)
values ('replay', public.leah_start_execution(
  'fc100000-0000-0000-0000-000000000001',
  'fc300000-0000-0000-0000-000000000001',
  'fc200000-0000-0000-0000-000000000001',
  'manual-idempotent-one',
  '{"goal":"build once"}'::jsonb,
  'manual'
));

do $$
declare
  first_result jsonb;
  replay_result jsonb;
  first_execution uuid;
  replay_execution uuid;
  first_task uuid;
  replay_task uuid;
  execution_count integer;
  task_count integer;
  marker text;
  source_name text;
begin
  select payload into first_result from mr3_manual_state where key='first';
  select payload into replay_result from mr3_manual_state where key='replay';

  first_execution := (first_result->'execution'->>'id')::uuid;
  replay_execution := (replay_result->'execution'->>'id')::uuid;
  first_task := (first_result->'bootstrap_task'->>'id')::uuid;
  replay_task := (replay_result->'bootstrap_task'->>'id')::uuid;

  if first_execution is null or first_task is null then raise exception 'Manual start did not return execution + bootstrap task'; end if;
  if first_result->>'idempotent_replay' <> 'false' then raise exception 'First manual start was falsely marked replay'; end if;
  if replay_result->>'idempotent_replay' <> 'true' then raise exception 'Second manual start was not marked replay'; end if;
  if first_result->>'source' <> 'manual' or replay_result->>'source' <> 'manual' then raise exception 'Manual source truth mismatch'; end if;
  if first_execution <> replay_execution then raise exception 'Idempotent manual replay created another execution'; end if;
  if first_task <> replay_task then raise exception 'Idempotent manual replay created another planner task'; end if;

  select count(*) into execution_count
  from public.leah_executions
  where workspace_id='fc100000-0000-0000-0000-000000000001'
    and project_id='fc300000-0000-0000-0000-000000000001'
    and idempotency_key='manual-idempotent-one';
  if execution_count <> 1 then raise exception 'Manual execution idempotency count mismatch'; end if;

  select count(*), min(input->>'orchestration_bootstrap'), min(input->>'source')
    into task_count, marker, source_name
  from public.leah_tasks
  where execution_id=first_execution
    and agent_role='planner';
  if task_count <> 1 then raise exception 'Manual bootstrap planner task count mismatch'; end if;
  if marker <> 'true' then raise exception 'Canonical orchestration bootstrap marker missing'; end if;
  if source_name <> 'manual' then raise exception 'Manual bootstrap source marker mismatch'; end if;
end $$;

-- Bootstrap work must be claimable and claiming it is what starts the execution.
insert into mr3_manual_state(key,payload)
values ('claim', public.leah_claim_next_task('mr3-manual-worker',60));

do $$
declare
  claim_result jsonb;
  first_result jsonb;
  expected_task uuid;
  expected_execution uuid;
  execution_status text;
begin
  select payload into claim_result from mr3_manual_state where key='claim';
  select payload into first_result from mr3_manual_state where key='first';
  expected_task := (first_result->'bootstrap_task'->>'id')::uuid;
  expected_execution := (first_result->'execution'->>'id')::uuid;

  if claim_result is null then raise exception 'Manual bootstrap task was not claimable'; end if;
  if (claim_result->>'id')::uuid <> expected_task then raise exception 'Claim returned wrong manual bootstrap task'; end if;
  if claim_result->>'agent_role' <> 'planner' then raise exception 'Manual bootstrap task is not planner role'; end if;

  select status into execution_status from public.leah_executions where id=expected_execution;
  if execution_status <> 'running' then raise exception 'Claim did not start manual execution'; end if;

  perform public.leah_finish_task(
    expected_task,(claim_result->>'lease_token')::uuid,'succeeded','{"planned":true}'::jsonb,null,1000
  );
  perform public.leah_finish_execution(expected_execution,'running','succeeded',null,null);
end $$;

-- Replaying the same key after terminal success returns truth; it does not restart it.
insert into mr3_manual_state(key,payload)
values ('terminal_replay', public.leah_start_execution(
  'fc100000-0000-0000-0000-000000000001',
  'fc300000-0000-0000-0000-000000000001',
  'fc200000-0000-0000-0000-000000000001',
  'manual-idempotent-one',
  '{"goal":"build once"}'::jsonb,
  'manual'
));

do $$
declare
  first_result jsonb;
  terminal_result jsonb;
  eid uuid;
  task_count integer;
begin
  select payload into first_result from mr3_manual_state where key='first';
  select payload into terminal_result from mr3_manual_state where key='terminal_replay';
  eid := (first_result->'execution'->>'id')::uuid;

  if terminal_result->>'idempotent_replay' <> 'true' then raise exception 'Terminal replay not marked idempotent'; end if;
  if (terminal_result->'execution'->>'id')::uuid <> eid then raise exception 'Terminal replay changed execution identity'; end if;
  if terminal_result->'execution'->>'status' <> 'succeeded' then raise exception 'Terminal replay did not return persisted truth'; end if;
  if terminal_result->'bootstrap_task' is not null then raise exception 'Terminal replay attempted to restart bootstrap work'; end if;

  select count(*) into task_count from public.leah_tasks where execution_id=eid;
  if task_count <> 1 then raise exception 'Terminal replay changed task count'; end if;
end $$;

-- Without an idempotency key, independent user starts remain independent work.
insert into mr3_manual_state(key,payload)
values ('free_one', public.leah_start_execution(
  'fc100000-0000-0000-0000-000000000001','fc300000-0000-0000-0000-000000000001',
  'fc200000-0000-0000-0000-000000000001',null,'{"run":1}'::jsonb,'manual'
));
insert into mr3_manual_state(key,payload)
values ('free_two', public.leah_start_execution(
  'fc100000-0000-0000-0000-000000000001','fc300000-0000-0000-0000-000000000001',
  'fc200000-0000-0000-0000-000000000001',null,'{"run":2}'::jsonb,'manual'
));

do $$
declare a uuid; b uuid;
begin
  select (payload->'execution'->>'id')::uuid into a from mr3_manual_state where key='free_one';
  select (payload->'execution'->>'id')::uuid into b from mr3_manual_state where key='free_two';
  if a is null or b is null or a=b then raise exception 'Non-idempotent starts did not create independent executions'; end if;
end $$;

-- Invalid source and overlength keys are rejected, never normalized into fake truth.
do $$
begin
  begin
    perform public.leah_start_execution(
      'fc100000-0000-0000-0000-000000000001','fc300000-0000-0000-0000-000000000001',
      'fc200000-0000-0000-0000-000000000001','bad-source','{}'::jsonb,'provider'
    );
    raise exception 'Unsupported execution source was accepted';
  exception when others then
    if sqlerrm = 'Unsupported execution source was accepted' then raise; end if;
  end;

  begin
    perform public.leah_start_execution(
      'fc100000-0000-0000-0000-000000000001','fc300000-0000-0000-0000-000000000001',
      'fc200000-0000-0000-0000-000000000001',repeat('x',201),'{}'::jsonb,'manual'
    );
    raise exception 'Overlength idempotency key was accepted';
  exception when others then
    if sqlerrm = 'Overlength idempotency key was accepted' then raise; end if;
  end;
end $$;

rollback;
\echo 'LEAH MANUAL EXECUTION BOOTSTRAP CONTRACT: PASS'
