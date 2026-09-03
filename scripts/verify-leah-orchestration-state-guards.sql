\set ON_ERROR_STOP on
begin;

create temp table mr3_guard_state(key text primary key, payload jsonb) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('ff200000-0000-0000-0000-000000000001','authenticated','authenticated','leah-mr3-state-guard@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values ('ff100000-0000-0000-0000-000000000001','LEAH MR3 State Guard','leah-mr3-state-guard','ff200000-0000-0000-0000-000000000001');

insert into public.workspace_members(workspace_id,user_id,role)
values ('ff100000-0000-0000-0000-000000000001','ff200000-0000-0000-0000-000000000001','owner');

insert into public.leah_workspace_entitlements(workspace_id,status,source,concurrency_limit)
values ('ff100000-0000-0000-0000-000000000001','active','mr3-state-guard-test',1);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values ('ff300000-0000-0000-0000-000000000001','ff100000-0000-0000-0000-000000000001','State Guard Project','state-guard-project','ff200000-0000-0000-0000-000000000001');

insert into mr3_guard_state(key,payload)
values ('start', public.leah_start_execution(
  'ff100000-0000-0000-0000-000000000001',
  'ff300000-0000-0000-0000-000000000001',
  'ff200000-0000-0000-0000-000000000001',
  'state-guard-one','{}'::jsonb,'manual'
));

-- queued execution cannot falsely jump to succeeded.
do $$
declare eid uuid;
begin
  select (payload->'execution'->>'id')::uuid into eid from mr3_guard_state where key='start';
  begin
    update public.leah_executions set status='succeeded' where id=eid;
    raise exception 'Queued execution jumped directly to succeeded';
  exception when others then
    if sqlerrm = 'Queued execution jumped directly to succeeded' then raise; end if;
  end;
end $$;

insert into mr3_guard_state(key,payload)
values ('claim', public.leah_claim_next_task('mr3-state-worker',60));

do $$
declare c jsonb;
begin
  select payload into c from mr3_guard_state where key='claim';
  if c is null then raise exception 'State guard task was not claimable'; end if;
  perform public.leah_finish_task(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,'retry_wait',null,'{"retry":true}'::jsonb,60000
  );
end $$;

-- retry_wait cannot bypass available_at by being pushed back to queued manually.
do $$
declare tid uuid;
begin
  select (payload->>'id')::uuid into tid from mr3_guard_state where key='claim';
  begin
    update public.leah_tasks set status='queued', available_at=clock_timestamp() where id=tid;
    raise exception 'retry_wait task bypassed canonical claim timing';
  exception when others then
    if sqlerrm = 'retry_wait task bypassed canonical claim timing' then raise; end if;
  end;
end $$;

-- Canonical retry_wait -> running remains valid once available_at is due.
update public.leah_tasks
set available_at=clock_timestamp()-interval '1 second'
where id=(select (payload->>'id')::uuid from mr3_guard_state where key='claim');

insert into mr3_guard_state(key,payload)
values ('retry_claim', public.leah_claim_next_task('mr3-state-worker',60));

do $$
declare c jsonb; eid uuid;
begin
  select payload into c from mr3_guard_state where key='retry_claim';
  select (payload->'execution'->>'id')::uuid into eid from mr3_guard_state where key='start';
  if c is null then raise exception 'Due retry_wait task could not return to running via claim'; end if;
  perform public.leah_finish_task((c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{}'::jsonb,null,1000);
  perform public.leah_finish_execution(eid,'running','succeeded',null,null);

  begin
    update public.leah_executions set status='running' where id=eid;
    raise exception 'Terminal execution returned to running';
  exception when others then
    if sqlerrm = 'Terminal execution returned to running' then raise; end if;
  end;
end $$;

rollback;
\echo 'LEAH ORCHESTRATION STATE GUARDS CONTRACT: PASS'
