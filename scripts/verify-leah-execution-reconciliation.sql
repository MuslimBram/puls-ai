\set ON_ERROR_STOP on
begin;

create temp table mr3_reconcile_state(
  key text primary key,
  payload jsonb null
) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('fd200000-0000-0000-0000-000000000001','authenticated','authenticated','leah-mr3-reconcile@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values ('fd100000-0000-0000-0000-000000000001','LEAH MR3 Reconcile','leah-mr3-reconcile','fd200000-0000-0000-0000-000000000001');

insert into public.workspace_members(workspace_id,user_id,role)
values ('fd100000-0000-0000-0000-000000000001','fd200000-0000-0000-0000-000000000001','owner');

insert into public.leah_workspace_entitlements(workspace_id,status,source,concurrency_limit)
values ('fd100000-0000-0000-0000-000000000001','active','mr3-reconcile-test',1);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values ('fd300000-0000-0000-0000-000000000001','fd100000-0000-0000-0000-000000000001','Reconcile Project','reconcile-project','fd200000-0000-0000-0000-000000000001');

-- Reconcile is backend-only.
do $$
begin
  if has_function_privilege('anon','public.leah_reconcile_executions(integer)','EXECUTE') then
    raise exception 'anon can reconcile LEAH executions';
  end if;
  if has_function_privilege('authenticated','public.leah_reconcile_executions(integer)','EXECUTE') then
    raise exception 'authenticated can reconcile LEAH executions';
  end if;
end $$;

-- SUCCESS CRASH PATH: last task succeeds, but no worker sends execution success.
insert into mr3_reconcile_state(key,payload)
values ('success_start', public.leah_start_execution(
  'fd100000-0000-0000-0000-000000000001',
  'fd300000-0000-0000-0000-000000000001',
  'fd200000-0000-0000-0000-000000000001',
  'reconcile-success',
  '{"case":"success-crash"}'::jsonb
));

insert into mr3_reconcile_state(key,payload)
values ('success_claim', public.leah_claim_next_task('mr3-reconcile-success-worker',60));

do $$
declare c jsonb; st text;
begin
  select payload into c from mr3_reconcile_state where key='success_claim';
  if c is null then raise exception 'Success reconciliation task not claimed'; end if;
  perform public.leah_finish_task(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{"done":true}'::jsonb,null,1000
  );
  select status into st from public.leah_executions
    where id=(select (payload->'execution'->>'id')::uuid from mr3_reconcile_state where key='success_start');
  if st <> 'running' then raise exception 'Verifier expected execution to remain running before reconciliation'; end if;
end $$;

insert into mr3_reconcile_state(key,payload)
values ('success_reconcile', public.leah_reconcile_executions(100));

do $$
declare r jsonb; eid uuid; st text;
begin
  select payload into r from mr3_reconcile_state where key='success_reconcile';
  select (payload->'execution'->>'id')::uuid into eid from mr3_reconcile_state where key='success_start';
  if (r->>'succeeded')::integer < 1 then raise exception 'Reconciliation did not recover truthful success'; end if;
  select status into st from public.leah_executions where id=eid;
  if st <> 'succeeded' then raise exception 'Recovered execution did not persist succeeded'; end if;
end $$;

-- FAILURE CRASH PATH: final allowed lease expires, reaper marks task failed, then
-- reconciliation must fail the execution without a live worker.
insert into mr3_reconcile_state(key,payload)
values ('failure_start', public.leah_start_execution(
  'fd100000-0000-0000-0000-000000000001',
  'fd300000-0000-0000-0000-000000000001',
  'fd200000-0000-0000-0000-000000000001',
  'reconcile-failure',
  '{"case":"failure-crash"}'::jsonb
));

update public.leah_tasks
set max_attempts=1
where id=(select (payload->'bootstrap_task'->>'id')::uuid from mr3_reconcile_state where key='failure_start');

insert into mr3_reconcile_state(key,payload)
values ('failure_claim', public.leah_claim_next_task('mr3-reconcile-failure-worker',15));

update public.leah_tasks
set lease_expires_at=clock_timestamp()-interval '1 second'
where id=(select (payload->>'id')::uuid from mr3_reconcile_state where key='failure_claim');

do $$
declare tid uuid; st text;
begin
  select (payload->>'id')::uuid into tid from mr3_reconcile_state where key='failure_claim';
  if public.leah_reap_expired_task_leases(100) < 1 then raise exception 'Final expired lease was not reaped'; end if;
  select status into st from public.leah_tasks where id=tid;
  if st <> 'failed' then raise exception 'Exhausted expired task did not become failed'; end if;
end $$;

insert into mr3_reconcile_state(key,payload)
values ('failure_reconcile', public.leah_reconcile_executions(100));

do $$
declare r jsonb; eid uuid; st text; code text;
begin
  select payload into r from mr3_reconcile_state where key='failure_reconcile';
  select (payload->'execution'->>'id')::uuid into eid from mr3_reconcile_state where key='failure_start';
  if (r->>'failed')::integer < 1 then raise exception 'Reconciliation did not recover truthful failure'; end if;
  select status,error_code into st,code from public.leah_executions where id=eid;
  if st <> 'failed' then raise exception 'Recovered failed execution did not persist failed'; end if;
  if code <> 'orchestration_terminal_failure' then raise exception 'Recovered failure code mismatch'; end if;
end $$;

-- INCOMPLETE WORK MUST REMAIN OPEN: a succeeded task plus queued task is not success.
insert into public.leah_executions(id,workspace_id,project_id,requested_by,status,idempotency_key,input)
values ('fd400000-0000-0000-0000-000000000003','fd100000-0000-0000-0000-000000000001','fd300000-0000-0000-0000-000000000001','fd200000-0000-0000-0000-000000000001','queued','reconcile-incomplete','{}');

insert into mr3_reconcile_state(key,payload)
values ('incomplete_one', public.leah_enqueue_task(
  'fd400000-0000-0000-0000-000000000003',900,'{"step":1}'::jsonb,'worker',null,null,'{}'::uuid[],3
));
insert into mr3_reconcile_state(key,payload)
values ('incomplete_two', public.leah_enqueue_task(
  'fd400000-0000-0000-0000-000000000003',100,'{"step":2}'::jsonb,'worker',null,null,'{}'::uuid[],3
));
insert into mr3_reconcile_state(key,payload)
values ('incomplete_claim', public.leah_claim_next_task('mr3-reconcile-incomplete-worker',60));

do $$
declare c jsonb; st text;
begin
  select payload into c from mr3_reconcile_state where key='incomplete_claim';
  perform public.leah_finish_task((c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{}'::jsonb,null,1000);
  perform public.leah_reconcile_executions(100);
  select status into st from public.leah_executions where id='fd400000-0000-0000-0000-000000000003';
  if st <> 'running' then raise exception 'Reconciliation falsely closed incomplete execution'; end if;
end $$;

rollback;
\echo 'LEAH EXECUTION RECONCILIATION CONTRACT: PASS'
