\set ON_ERROR_STOP on
begin;

-- MR3 runtime verifier. Requires MR2 + MR3 migrations and rolls everything back.
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('f2000000-0000-0000-0000-000000000001','authenticated','authenticated','leah-mr3-owner-a@example.invalid','',now(),now(),now()),
  ('f2000000-0000-0000-0000-000000000002','authenticated','authenticated','leah-mr3-member-a@example.invalid','',now(),now(),now()),
  ('f2000000-0000-0000-0000-000000000003','authenticated','authenticated','leah-mr3-owner-b@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values
  ('f1000000-0000-0000-0000-000000000001','LEAH MR3 Workspace A','leah-mr3-a','f2000000-0000-0000-0000-000000000001'),
  ('f1000000-0000-0000-0000-000000000002','LEAH MR3 Workspace B','leah-mr3-b','f2000000-0000-0000-0000-000000000003');

insert into public.workspace_members(workspace_id,user_id,role)
values
  ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','owner'),
  ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000002','member'),
  ('f1000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000003','owner');

insert into public.leah_workspace_entitlements(workspace_id,status,source,concurrency_limit)
values
  ('f1000000-0000-0000-0000-000000000001','active','mr3-test',1),
  ('f1000000-0000-0000-0000-000000000002','active','mr3-test',1);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values
  ('f3000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','MR3 Project A','mr3-project-a','f2000000-0000-0000-0000-000000000001'),
  ('f3000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000002','MR3 Project B','mr3-project-b','f2000000-0000-0000-0000-000000000003');

insert into public.leah_executions(id,workspace_id,project_id,requested_by,status,idempotency_key,input)
values
  ('f4000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','queued','mr3-main','{}'),
  ('f4000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000003','queued','mr3-other','{}');

-- Browser boundary: new orchestration tables are read-only and tenant-scoped.
set local role authenticated;
select set_config('request.jwt.claim.sub','f2000000-0000-0000-0000-000000000002',true);
do $$
begin
  if has_table_privilege('authenticated','public.leah_swarms','INSERT') then
    raise exception 'authenticated can insert LEAH swarms';
  end if;
  if has_table_privilege('authenticated','public.leah_schedules','UPDATE') then
    raise exception 'authenticated can update LEAH schedules';
  end if;
  if has_function_privilege('authenticated','public.leah_claim_next_task(text,integer)','EXECUTE') then
    raise exception 'authenticated can claim internal LEAH tasks';
  end if;
end $$;
reset role;

-- Priority queue: higher priority must claim first; workspace limit=1 blocks a second claim.
select public.leah_enqueue_task(
  'f4000000-0000-0000-0000-000000000001', 10, '{"name":"low"}'::jsonb,
  'builder', null, null, '{}'::uuid[], 3
) as low_task \gset
select public.leah_enqueue_task(
  'f4000000-0000-0000-0000-000000000001', 900, '{"name":"high"}'::jsonb,
  'reviewer', null, null, '{}'::uuid[], 3
) as high_task \gset

select public.leah_claim_next_task('mr3-worker-a',60) as first_claim \gset

do $$
declare c jsonb := :'first_claim'::jsonb;
begin
  if c is null then raise exception 'Priority claim returned null'; end if;
  if c->'input'->>'name' <> 'high' then raise exception 'Priority order not enforced'; end if;
  if c->>'status' <> 'running' then raise exception 'Claim did not mark task running'; end if;
  if c->>'lease_owner' <> 'mr3-worker-a' then raise exception 'Claim lease owner missing'; end if;
  if c->>'lease_token' is null then raise exception 'Claim lease token missing'; end if;
end $$;

select public.leah_claim_next_task('mr3-worker-b',60) as blocked_by_limit \gset

do $$
begin
  if nullif(:'blocked_by_limit','') is not null and :'blocked_by_limit' <> '' and :'blocked_by_limit' <> 'null' then
    raise exception 'Workspace concurrency_limit=1 allowed a second running task';
  end if;
end $$;

-- Lease ownership: wrong heartbeat/finish must fail, correct token must work.
do $$
declare
  c jsonb := :'first_claim'::jsonb;
  tid uuid := (c->>'id')::uuid;
  tok uuid := (c->>'lease_token')::uuid;
begin
  if public.leah_heartbeat_task(tid,gen_random_uuid(),60) then
    raise exception 'Wrong lease token heartbeat succeeded';
  end if;
  if not public.leah_heartbeat_task(tid,tok,60) then
    raise exception 'Correct lease token heartbeat failed';
  end if;
  begin
    perform public.leah_finish_task(tid,gen_random_uuid(),'succeeded','{}'::jsonb,null,1000);
    raise exception 'Wrong lease token finish succeeded';
  exception when others then
    if sqlerrm = 'Wrong lease token finish succeeded' then raise; end if;
  end;
  perform public.leah_finish_task(tid,tok,'succeeded','{"ok":true}'::jsonb,null,1000);
end $$;

-- The remaining lower priority task can now claim.
select public.leah_claim_next_task('mr3-worker-b',60) as low_claim \gset

do $$
declare c jsonb := :'low_claim'::jsonb;
begin
  if c->'input'->>'name' <> 'low' then raise exception 'Lower task did not become claimable'; end if;
  perform public.leah_finish_task((c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{}'::jsonb,null,1000);
end $$;

-- Dependency DAG: a higher-priority dependant must remain blocked until upstream succeeds.
select public.leah_enqueue_task(
  'f4000000-0000-0000-0000-000000000001', 100, '{"name":"upstream"}'::jsonb,
  'planner', null, null, '{}'::uuid[], 3
) as upstream_task \gset

select public.leah_enqueue_task(
  'f4000000-0000-0000-0000-000000000001', 1000, '{"name":"dependent"}'::jsonb,
  'builder', null, null,
  array[((:'upstream_task'::jsonb)->>'id')::uuid], 3
) as dependent_task \gset

select public.leah_claim_next_task('mr3-worker-dep',60) as upstream_claim \gset

do $$
declare c jsonb := :'upstream_claim'::jsonb;
begin
  if c->'input'->>'name' <> 'upstream' then raise exception 'Dependency gating failed'; end if;
  perform public.leah_finish_task((c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{}'::jsonb,null,1000);
end $$;

select public.leah_claim_next_task('mr3-worker-dep',60) as dependent_claim \gset

do $$
declare c jsonb := :'dependent_claim'::jsonb;
begin
  if c->'input'->>'name' <> 'dependent' then raise exception 'Succeeded dependency did not release dependant'; end if;
  perform public.leah_finish_task((c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{}'::jsonb,null,1000);
end $$;

-- Failed dependency propagation must not leave queued work stuck forever.
select public.leah_enqueue_task(
  'f4000000-0000-0000-0000-000000000001', 100, '{"name":"fail-upstream"}'::jsonb,
  'planner', null, null, '{}'::uuid[], 3
) as fail_upstream \gset
select public.leah_enqueue_task(
  'f4000000-0000-0000-0000-000000000001', 900, '{"name":"blocked-child"}'::jsonb,
  'builder', null, null,
  array[((:'fail_upstream'::jsonb)->>'id')::uuid], 3
) as blocked_child \gset
select public.leah_claim_next_task('mr3-worker-fail',60) as fail_claim \gset

do $$
declare c jsonb := :'fail_claim'::jsonb;
  child uuid := ((:'blocked_child'::jsonb)->>'id')::uuid;
  child_status text;
begin
  perform public.leah_finish_task((c->>'id')::uuid,(c->>'lease_token')::uuid,'failed',null,'{"reason":"test"}'::jsonb,1000);
  if public.leah_fail_blocked_tasks(100) < 1 then raise exception 'Blocked dependency resolver changed no rows'; end if;
  select status into child_status from public.leah_tasks where id=child;
  if child_status <> 'failed' then raise exception 'Failed dependency did not fail dependant'; end if;
end $$;

-- Swarm concurrency: workspace limit=2, swarm limit=1. A second task in that swarm must wait.
update public.leah_workspace_entitlements
set concurrency_limit=2
where workspace_id='f1000000-0000-0000-0000-000000000001';

insert into public.leah_executions(id,workspace_id,project_id,requested_by,status,idempotency_key,input)
values ('f4000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','queued','mr3-swarm','{}');

select public.leah_create_swarm('f4000000-0000-0000-0000-000000000003','parallel',1) as swarm \gset
select public.leah_enqueue_task(
  'f4000000-0000-0000-0000-000000000003',700,'{"name":"swarm-one"}'::jsonb,
  'researcher',((:'swarm'::jsonb)->>'id')::uuid,null,'{}'::uuid[],3
) as swarm_one \gset
select public.leah_enqueue_task(
  'f4000000-0000-0000-0000-000000000003',600,'{"name":"swarm-two"}'::jsonb,
  'reviewer',((:'swarm'::jsonb)->>'id')::uuid,null,'{}'::uuid[],3
) as swarm_two \gset

select public.leah_claim_next_task('mr3-swarm-worker-1',60) as swarm_claim_one \gset
select public.leah_claim_next_task('mr3-swarm-worker-2',60) as swarm_claim_two_while_busy \gset

do $$
declare c jsonb := :'swarm_claim_one'::jsonb;
begin
  if c is null or c->'input'->>'name' <> 'swarm-one' then raise exception 'First swarm task claim failed'; end if;
  if nullif(:'swarm_claim_two_while_busy','') is not null and :'swarm_claim_two_while_busy' <> '' and :'swarm_claim_two_while_busy' <> 'null' then
    raise exception 'Swarm max_concurrency=1 allowed second concurrent claim';
  end if;
  perform public.leah_finish_task((c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{}'::jsonb,null,1000);
end $$;

select public.leah_claim_next_task('mr3-swarm-worker-2',60) as swarm_claim_two \gset

do $$
declare c jsonb := :'swarm_claim_two'::jsonb;
  sid uuid := ((:'swarm'::jsonb)->>'id')::uuid;
  sstatus text;
begin
  if c is null or c->'input'->>'name' <> 'swarm-two' then raise exception 'Second swarm task did not release'; end if;
  perform public.leah_finish_task((c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{}'::jsonb,null,1000);
  select status into sstatus from public.leah_swarms where id=sid;
  if sstatus <> 'succeeded' then raise exception 'Swarm did not close as succeeded'; end if;
end $$;

-- Lease expiry: expired running work returns to retry_wait while attempts remain.
insert into public.leah_executions(id,workspace_id,project_id,requested_by,status,idempotency_key,input)
values ('f4000000-0000-0000-0000-000000000004','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','queued','mr3-reap','{}');
select public.leah_enqueue_task('f4000000-0000-0000-0000-000000000004',500,'{"name":"expire-me"}'::jsonb,'worker',null,null,'{}'::uuid[],3) as expire_task \gset
select public.leah_claim_next_task('mr3-expiring-worker',15) as expire_claim \gset
update public.leah_tasks
set lease_expires_at=clock_timestamp()-interval '1 second'
where id=((:'expire_claim'::jsonb)->>'id')::uuid;

do $$
declare
  tid uuid := ((:'expire_claim'::jsonb)->>'id')::uuid;
  st text;
begin
  if public.leah_reap_expired_task_leases(100) < 1 then raise exception 'Expired lease was not reaped'; end if;
  select status into st from public.leah_tasks where id=tid;
  if st <> 'retry_wait' then raise exception 'Expired lease did not return to retry_wait'; end if;
end $$;

-- Scheduler: one due interval produces one idempotent execution, then advances to future.
insert into public.leah_schedules(
  id,workspace_id,project_id,name,cadence_seconds,enabled,input,next_run_at,created_by
) values (
  'f6000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000001','MR3 interval',60,true,'{"source":"schedule"}',
  clock_timestamp()-interval '1 second','f2000000-0000-0000-0000-000000000001'
);

select public.leah_scheduler_tick(20) as scheduler_first \gset
select public.leah_scheduler_tick(20) as scheduler_second \gset

do $$
declare
  a jsonb := :'scheduler_first'::jsonb;
  b jsonb := :'scheduler_second'::jsonb;
  n integer;
  next_at timestamptz;
begin
  if (a->>'processed')::integer <> 1 then raise exception 'Due scheduler did not process exactly one schedule'; end if;
  if (b->>'processed')::integer <> 0 then raise exception 'Scheduler replayed schedule before next_run_at'; end if;
  select count(*) into n from public.leah_executions where idempotency_key like 'schedule:f6000000-0000-0000-0000-000000000001:%';
  if n <> 1 then raise exception 'Scheduler execution idempotency failed'; end if;
  select next_run_at into next_at from public.leah_schedules where id='f6000000-0000-0000-0000-000000000001';
  if next_at <= clock_timestamp() then raise exception 'Scheduler did not advance next_run_at'; end if;
end $$;

-- Cross-tenant RLS on the new tables.
insert into public.leah_executions(id,workspace_id,project_id,requested_by,status,idempotency_key,input)
values ('f4000000-0000-0000-0000-000000000005','f1000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000003','queued','mr3-b-swarm','{}');
select public.leah_create_swarm('f4000000-0000-0000-0000-000000000005','parallel',1) as other_swarm \gset

set local role authenticated;
select set_config('request.jwt.claim.sub','f2000000-0000-0000-0000-000000000002',true);
do $$
declare n integer;
begin
  select count(*) into n from public.leah_swarms where workspace_id='f1000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'Cross-workspace swarm leak'; end if;
  select count(*) into n from public.leah_schedules where workspace_id='f1000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'Cross-workspace schedule leak'; end if;
end $$;
reset role;

rollback;
\echo 'LEAH DURABLE ORCHESTRATION CONTRACT: PASS'
