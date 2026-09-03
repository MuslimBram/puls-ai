\set ON_ERROR_STOP on
begin;

-- MR3 side-effect verifier. Pure SQL except removable psql meta-lines.
-- Proves that worker authority is task-lease-scoped and terminal execution truth
-- cannot be forged while work is incomplete.

create temp table mr3_side_state(
  key text primary key,
  payload jsonb null
) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('fa200000-0000-0000-0000-000000000001','authenticated','authenticated','leah-mr3-side-owner@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values ('fa100000-0000-0000-0000-000000000001','LEAH MR3 Side Effects','leah-mr3-side','fa200000-0000-0000-0000-000000000001');

insert into public.workspace_members(workspace_id,user_id,role)
values ('fa100000-0000-0000-0000-000000000001','fa200000-0000-0000-0000-000000000001','owner');

insert into public.leah_workspace_entitlements(workspace_id,status,source,concurrency_limit)
values ('fa100000-0000-0000-0000-000000000001','active','mr3-side-test',1);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values ('fa300000-0000-0000-0000-000000000001','fa100000-0000-0000-0000-000000000001','MR3 Side Project','mr3-side-project','fa200000-0000-0000-0000-000000000001');

insert into public.leah_executions(id,workspace_id,project_id,requested_by,status,idempotency_key,input)
values ('fa400000-0000-0000-0000-000000000001','fa100000-0000-0000-0000-000000000001','fa300000-0000-0000-0000-000000000001','fa200000-0000-0000-0000-000000000001','queued','mr3-side-main','{}');

insert into public.leah_semantic_memory(id,workspace_id,project_id,source_ref,chunk,status,metadata)
values
  ('fa700000-0000-0000-0000-000000000001','fa100000-0000-0000-0000-000000000001','fa300000-0000-0000-0000-000000000001','side:one','first semantic chunk','pending','{}'),
  ('fa700000-0000-0000-0000-000000000002','fa100000-0000-0000-0000-000000000001','fa300000-0000-0000-0000-000000000001','side:two','stale semantic chunk','pending','{}');

-- New side-effect RPCs are backend-only.
do $$
begin
  if has_function_privilege('anon','public.leah_put_artifact_for_task(uuid,uuid,text,text,text,text)','EXECUTE') then
    raise exception 'anon can write LEAH task artifacts';
  end if;
  if has_function_privilege('authenticated','public.leah_vault_read_for_task(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'authenticated can read LEAH runtime secret by task';
  end if;
  if has_function_privilege('authenticated','public.leah_transition_project_for_task(uuid,uuid,text,text)','EXECUTE') then
    raise exception 'authenticated can transition LEAH project by task';
  end if;
  if has_function_privilege('authenticated','public.leah_mark_semantic_for_task(uuid,uuid,uuid,text,text,text,text,jsonb)','EXECUTE') then
    raise exception 'authenticated can mark LEAH semantic state by task';
  end if;
  if has_function_privilege('authenticated','public.leah_finish_execution(uuid,text,text,text,jsonb)','EXECUTE') then
    raise exception 'authenticated can finish LEAH execution';
  end if;
end $$;

insert into mr3_side_state(key,payload)
values ('task', public.leah_enqueue_task(
  'fa400000-0000-0000-0000-000000000001',500,'{"job":"side-effects"}'::jsonb,
  'builder',null,null,'{}'::uuid[],3
));

insert into mr3_side_state(key,payload)
values ('claim', public.leah_claim_next_task('mr3-side-worker',60));

do $$
declare c jsonb;
begin
  select payload into c from mr3_side_state where key='claim';
  if c is null or c->>'status' <> 'running' then raise exception 'Side-effect task was not claimed'; end if;

  -- False success must be rejected while the claimed task is still running.
  begin
    perform public.leah_finish_execution(
      'fa400000-0000-0000-0000-000000000001','running','succeeded',null,null
    );
    raise exception 'Execution succeeded while task was still running';
  exception when others then
    if sqlerrm = 'Execution succeeded while task was still running' then raise; end if;
  end;
end $$;

-- Active lease is allowed to create an artifact with durable task/execution provenance.
insert into mr3_side_state(key,payload)
select 'artifact', public.leah_put_artifact_for_task(
  (payload->>'id')::uuid,
  (payload->>'lease_token')::uuid,
  'source',
  'src/main.ts',
  'hello',
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
)
from mr3_side_state where key='claim';

do $$
declare a jsonb; c jsonb; stored_execution uuid; stored_task uuid;
begin
  select payload into a from mr3_side_state where key='artifact';
  select payload into c from mr3_side_state where key='claim';
  select execution_id, task_id into stored_execution, stored_task
  from public.leah_project_artifacts where id=(a->>'id')::uuid;
  if stored_execution <> 'fa400000-0000-0000-0000-000000000001'::uuid then
    raise exception 'Artifact execution provenance missing';
  end if;
  if stored_task <> (c->>'id')::uuid then raise exception 'Artifact task provenance missing'; end if;
end $$;

-- Active lease is allowed to transition the project and complete semantic work.
insert into mr3_side_state(key,payload)
select 'project_transition', public.leah_transition_project_for_task(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,'planning','building'
)
from mr3_side_state where key='claim';

insert into mr3_side_state(key,payload)
select 'semantic_mark', public.leah_mark_semantic_for_task(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,
  'fa700000-0000-0000-0000-000000000001','failed',null,null,null,
  '{"reason":"expected-test-failure"}'::jsonb
)
from mr3_side_state where key='claim';

do $$
declare st text; project_status text;
begin
  select status into st from public.leah_semantic_memory where id='fa700000-0000-0000-0000-000000000001';
  if st <> 'failed' then raise exception 'Active lease could not mark semantic failure'; end if;
  select status into project_status from public.leah_projects where id='fa300000-0000-0000-0000-000000000001';
  if project_status <> 'building' then raise exception 'Active lease could not transition project'; end if;
end $$;

-- Finish the task. Its old lease token must immediately lose every side-effect capability.
do $$
declare c jsonb;
begin
  select payload into c from mr3_side_state where key='claim';
  perform public.leah_finish_task(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{"done":true}'::jsonb,null,1000
  );
end $$;

do $$
declare
  c jsonb;
  before_artifacts integer;
  after_artifacts integer;
  project_status text;
  semantic_status text;
begin
  select payload into c from mr3_side_state where key='claim';
  select count(*) into before_artifacts from public.leah_project_artifacts
    where project_id='fa300000-0000-0000-0000-000000000001';

  begin
    perform public.leah_put_artifact_for_task(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,'source','src/stale.ts','stale',
      'a03f2386ae06b211e5359a03e14dd3fe5f2c30e939c20a7dc7cfb92f8d1b1c40'
    );
    raise exception 'Stale lease wrote an artifact';
  exception when others then
    if sqlerrm = 'Stale lease wrote an artifact' then raise; end if;
  end;

  begin
    perform public.leah_transition_project_for_task(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,'building','ready'
    );
    raise exception 'Stale lease transitioned the project';
  exception when others then
    if sqlerrm = 'Stale lease transitioned the project' then raise; end if;
  end;

  begin
    perform public.leah_mark_semantic_for_task(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,
      'fa700000-0000-0000-0000-000000000002','failed',null,null,null,'{}'::jsonb
    );
    raise exception 'Stale lease changed semantic state';
  exception when others then
    if sqlerrm = 'Stale lease changed semantic state' then raise; end if;
  end;

  -- The stale lease check happens before any secret lookup, so an arbitrary secret ID
  -- is sufficient to prove the old worker no longer reaches Vault authority.
  begin
    perform public.leah_vault_read_for_task(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,'fa900000-0000-0000-0000-000000000001'
    );
    raise exception 'Stale lease reached runtime secret read';
  exception when others then
    if sqlerrm = 'Stale lease reached runtime secret read' then raise; end if;
  end;

  select count(*) into after_artifacts from public.leah_project_artifacts
    where project_id='fa300000-0000-0000-0000-000000000001';
  if after_artifacts <> before_artifacts then raise exception 'Stale lease changed artifact count'; end if;

  select status into project_status from public.leah_projects where id='fa300000-0000-0000-0000-000000000001';
  if project_status <> 'building' then raise exception 'Stale lease changed project state'; end if;

  select status into semantic_status from public.leah_semantic_memory where id='fa700000-0000-0000-0000-000000000002';
  if semantic_status <> 'pending' then raise exception 'Stale lease changed pending semantic row'; end if;
end $$;

-- Once every task is really succeeded and no swarm is open, execution success is valid.
insert into mr3_side_state(key,payload)
values ('execution_success', public.leah_finish_execution(
  'fa400000-0000-0000-0000-000000000001','running','succeeded',null,null
));

do $$
declare st text;
begin
  select status into st from public.leah_executions where id='fa400000-0000-0000-0000-000000000001';
  if st <> 'succeeded' then raise exception 'Truthful execution success was not persisted'; end if;
end $$;

-- Execution failure must cancel active work and revoke its lease atomically.
insert into public.leah_executions(id,workspace_id,project_id,requested_by,status,idempotency_key,input)
values ('fa400000-0000-0000-0000-000000000002','fa100000-0000-0000-0000-000000000001','fa300000-0000-0000-0000-000000000001','fa200000-0000-0000-0000-000000000001','queued','mr3-side-fail','{}');

insert into mr3_side_state(key,payload)
values ('fail_task', public.leah_enqueue_task(
  'fa400000-0000-0000-0000-000000000002',500,'{"job":"fail"}'::jsonb,
  'worker',null,null,'{}'::uuid[],3
));
insert into mr3_side_state(key,payload)
values ('fail_claim', public.leah_claim_next_task('mr3-side-fail-worker',60));

do $$
declare c jsonb; task_status text; lease uuid; execution_status text;
begin
  select payload into c from mr3_side_state where key='fail_claim';
  if c is null then raise exception 'Failure test task was not claimed'; end if;

  perform public.leah_finish_execution(
    'fa400000-0000-0000-0000-000000000002','running','failed','test_failure','{"reason":"verifier"}'::jsonb
  );

  select status, lease_token into task_status, lease
  from public.leah_tasks where id=(c->>'id')::uuid;
  if task_status <> 'cancelled' then raise exception 'Failed execution did not cancel active task'; end if;
  if lease is not null then raise exception 'Failed execution did not revoke active task lease'; end if;

  select status into execution_status from public.leah_executions where id='fa400000-0000-0000-0000-000000000002';
  if execution_status <> 'failed' then raise exception 'Execution failure was not persisted'; end if;

  begin
    perform public.leah_put_artifact_for_task(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,'source','src/post-fail.ts','bad',
      '2f05d4b689d270cafb02285f35f44866bd11247a21bd0f1631c6c457ebf4f9d0'
    );
    raise exception 'Revoked execution lease still wrote artifact';
  exception when others then
    if sqlerrm = 'Revoked execution lease still wrote artifact' then raise; end if;
  end;
end $$;

rollback;
\echo 'LEAH ORCHESTRATION SIDE-EFFECT CONTRACT: PASS'
