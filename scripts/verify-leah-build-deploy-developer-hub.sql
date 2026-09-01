\set ON_ERROR_STOP on
begin;

-- MR8D runtime verifier. Requires canonical LEAH MR5/MR7/MR8A/MR8C stack + MR8D.
-- All fixtures, including the temporary Vault secret, are transactional and roll back.
create temp table mr8d_state(key text primary key, payload jsonb) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('f8d00000-0000-4000-8000-000000000001','authenticated','authenticated','mr8d-owner@example.invalid','',now(),now(),now()),
  ('f8d00000-0000-4000-8000-000000000002','authenticated','authenticated','mr8d-outsider@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values
  ('f8d10000-0000-4000-8000-000000000001','MR8D Workspace','mr8d-workspace','f8d00000-0000-4000-8000-000000000001'),
  ('f8d10000-0000-4000-8000-000000000002','MR8D Foreign','mr8d-foreign','f8d00000-0000-4000-8000-000000000002');

insert into public.workspace_members(workspace_id,user_id,role)
values
  ('f8d10000-0000-4000-8000-000000000001','f8d00000-0000-4000-8000-000000000001','owner'),
  ('f8d10000-0000-4000-8000-000000000002','f8d00000-0000-4000-8000-000000000002','owner');

insert into public.leah_workspace_entitlements(
  workspace_id,status,source,concurrency_limit,included_monthly_tokens,storage_bytes_limit,
  ai_funding_mode,metered_overage_enabled,included_monthly_deploys,deploy_overage_enabled,storage_overage_enabled
) values
  ('f8d10000-0000-4000-8000-000000000001','active','mr8d-test',2,100000,1000000,'hybrid',false,10,false,false),
  ('f8d10000-0000-4000-8000-000000000002','active','mr8d-test',1,100000,1000000,'hybrid',false,10,false,false);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values
  ('f8d20000-0000-4000-8000-000000000001','f8d10000-0000-4000-8000-000000000001','MR8D Project','mr8d-project','f8d00000-0000-4000-8000-000000000001'),
  ('f8d20000-0000-4000-8000-000000000002','f8d10000-0000-4000-8000-000000000002','MR8D Foreign Project','mr8d-foreign-project','f8d00000-0000-4000-8000-000000000002');

-- Browser roles cannot mutate or inspect internal build/deploy evidence directly.
do $$
begin
  if has_table_privilege('authenticated','public.leah_builds','INSERT') then raise exception 'authenticated can insert builds'; end if;
  if has_table_privilege('authenticated','public.leah_build_source_artifacts','UPDATE') then raise exception 'authenticated can mutate build evidence'; end if;
  if has_table_privilege('authenticated','public.leah_deployments','INSERT') then raise exception 'authenticated can forge deployments'; end if;
  if has_function_privilege('authenticated','public.leah_begin_deployment_for_task(uuid,uuid,uuid)','EXECUTE') then raise exception 'authenticated can begin provider deployment'; end if;
  if has_function_privilege('authenticated','public.leah_reconcile_unknown_deployment(uuid,uuid,text,text,text,bigint,text)','EXECUTE') then raise exception 'authenticated can reconcile provider outcome'; end if;
  if has_function_privilege('authenticated','public.leah_deployment_secret_is_real(uuid,uuid,text)','EXECUTE') then raise exception 'authenticated can probe deployment secret existence'; end if;
end $$;

-- Start one canonical execution/task and lease it.
insert into mr8d_state(key,payload)
values ('start',public.leah_start_execution(
  'f8d10000-0000-4000-8000-000000000001','f8d20000-0000-4000-8000-000000000001',
  'f8d00000-0000-4000-8000-000000000001','mr8d-run','{}'::jsonb,'manual'
));
insert into mr8d_state(key,payload)
values ('claim',public.leah_claim_next_task('mr8d-worker',600));

do $$ declare c jsonb; begin
  select payload into c from mr8d_state where key='claim';
  if c is null or c->>'lease_token' is null then raise exception 'MR8D task was not leased'; end if;
end $$;

-- Persist a source artifact under the same live lease.
insert into mr8d_state(key,payload)
select 'artifact',public.leah_put_artifact_for_task(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,
  'source','src/mr8d.ts','export const mr8d = true;',
  encode(digest(convert_to('export const mr8d = true;','UTF8'),'sha256'),'hex')
)
from mr8d_state c where c.key='claim';

-- Build admission snapshots artifact version/hash before any builder side effect.
insert into mr8d_state(key,payload)
select 'build',public.leah_begin_build_for_task(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,
  'mr8d-build-1',array[(a.payload->>'id')::uuid],'pulse-builder','mr8d-test'
)
from mr8d_state c cross join mr8d_state a
where c.key='claim' and a.key='artifact';

do $$
declare b jsonb; replay jsonb; c jsonb; a jsonb;
begin
  select payload into b from mr8d_state where key='build';
  select payload into c from mr8d_state where key='claim';
  select payload into a from mr8d_state where key='artifact';
  if b->>'status'<>'building' or b->>'source_manifest_hash' is null then raise exception 'build admission evidence missing'; end if;
  if not exists(select 1 from public.leah_build_source_artifacts where build_id=(b->>'id')::uuid and artifact_id=(a->>'id')::uuid) then
    raise exception 'build source artifact snapshot missing';
  end if;
  replay := public.leah_begin_build_for_task(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,'mr8d-build-1',array[(a->>'id')::uuid],'pulse-builder','mr8d-test'
  );
  if replay->>'idempotent_replay'<>'true' then raise exception 'build admission replay not idempotent'; end if;
end $$;

-- Direct mutation of admitted build/source evidence is structurally denied.
do $$ declare b jsonb; a jsonb; begin
  select payload into b from mr8d_state where key='build';
  select payload into a from mr8d_state where key='artifact';
  begin
    update public.leah_builds set source_manifest='{"forged":true}'::jsonb where id=(b->>'id')::uuid;
    raise exception 'build snapshot mutation succeeded';
  exception when others then
    if sqlerrm='build snapshot mutation succeeded' then raise; end if;
    if sqlerrm not like '%build admission snapshot is immutable%' then raise; end if;
  end;
  begin
    update public.leah_build_source_artifacts set content_hash=repeat('a',64)
    where build_id=(b->>'id')::uuid and artifact_id=(a->>'id')::uuid;
    raise exception 'build source mutation succeeded';
  exception when others then
    if sqlerrm='build source mutation succeeded' then raise; end if;
    if sqlerrm not like '%build source evidence is immutable%' then raise; end if;
  end;
end $$;

-- Complete build with a real immutable output digest.
insert into mr8d_state(key,payload)
select 'build_finish',public.leah_finish_build_for_task(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,(b.payload->>'id')::uuid,
  'succeeded',repeat('b',64),'{"artifact":"bundle"}'::jsonb,null
)
from mr8d_state c cross join mr8d_state b
where c.key='claim' and b.key='build';

-- Metadata-only fake Vault reference must NOT activate a deployment target.
insert into public.vault_secret_refs(id,workspace_id,integration_key,label,vault_secret_name,created_by)
values ('f8d30000-0000-4000-8000-000000000099','f8d10000-0000-4000-8000-000000000001',
  'mr8d-fake','MR8D fake','mr8d_fake_missing_material','f8d00000-0000-4000-8000-000000000001');
insert into public.leah_secret_registry(id,workspace_id,alias,provider,vault_ref_id,hint,status,version,created_by)
values ('f8d40000-0000-4000-8000-000000000099','f8d10000-0000-4000-8000-000000000001',
  'mr8d_fake','vercel','f8d30000-0000-4000-8000-000000000099','fake','active',1,'f8d00000-0000-4000-8000-000000000001');

do $$ begin
  begin
    perform public.leah_save_deployment_target_for_actor(
      'f8d10000-0000-4000-8000-000000000001','f8d00000-0000-4000-8000-000000000001',
      'f8d20000-0000-4000-8000-000000000001',null,null,'Fake target','vercel','preview',
      'prj_fake',null,'f8d40000-0000-4000-8000-000000000099','active'
    );
    raise exception 'metadata-only Vault credential activated target';
  exception when others then
    if sqlerrm='metadata-only Vault credential activated target' then raise; end if;
    if sqlerrm not like '%real Vault-backed provider credential%' then raise; end if;
  end;
end $$;

-- Create test-only real Vault material + matching metadata.
select vault.create_secret('mr8d-test-secret-material','mr8d_real_vercel_secret','MR8D transactional verifier',null);
insert into public.vault_secret_refs(id,workspace_id,integration_key,label,vault_secret_name,created_by)
values ('f8d30000-0000-4000-8000-000000000001','f8d10000-0000-4000-8000-000000000001',
  'mr8d-vercel','MR8D Vercel','mr8d_real_vercel_secret','f8d00000-0000-4000-8000-000000000001');
insert into public.leah_secret_registry(id,workspace_id,alias,provider,vault_ref_id,hint,status,version,created_by)
values ('f8d40000-0000-4000-8000-000000000001','f8d10000-0000-4000-8000-000000000001',
  'mr8d_vercel','vercel','f8d30000-0000-4000-8000-000000000001','test','active',1,'f8d00000-0000-4000-8000-000000000001');

-- Preview + Production targets use the same real provider-bound test credential.
insert into mr8d_state(key,payload)
values ('preview_target',public.leah_save_deployment_target_for_actor(
  'f8d10000-0000-4000-8000-000000000001','f8d00000-0000-4000-8000-000000000001',
  'f8d20000-0000-4000-8000-000000000001',null,null,'Preview','vercel','preview','prj_mr8d',null,
  'f8d40000-0000-4000-8000-000000000001','active'
));
insert into mr8d_state(key,payload)
values ('production_target',public.leah_save_deployment_target_for_actor(
  'f8d10000-0000-4000-8000-000000000001','f8d00000-0000-4000-8000-000000000001',
  'f8d20000-0000-4000-8000-000000000001',null,null,'Production','vercel','production','prj_mr8d',null,
  'f8d40000-0000-4000-8000-000000000001','active'
));

-- Cross-workspace secret/actor use is denied.
do $$ begin
  begin
    perform public.leah_save_deployment_target_for_actor(
      'f8d10000-0000-4000-8000-000000000002','f8d00000-0000-4000-8000-000000000001',
      'f8d20000-0000-4000-8000-000000000002',null,null,'Foreign','vercel','preview','prj_foreign',null,
      'f8d40000-0000-4000-8000-000000000001','active'
    );
    raise exception 'cross-workspace deployment target creation succeeded';
  exception when others then
    if sqlerrm='cross-workspace deployment target creation succeeded' then raise; end if;
  end;
end $$;

-- Preview deploy does not require human approval but is quota-reserved before dispatch.
insert into mr8d_state(key,payload)
select 'preview_request',public.leah_request_deployment_for_task(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,(b.payload->>'id')::uuid,
  (t.payload->>'id')::uuid,'mr8d-preview-1'
)
from mr8d_state c cross join mr8d_state b cross join mr8d_state t
where c.key='claim' and b.key='build' and t.key='preview_target';

do $$ declare r jsonb; begin
  select payload into r from mr8d_state where key='preview_request';
  if r->>'status'<>'queued' or r->>'approved_by' is not null then raise exception 'preview deployment approval shape invalid'; end if;
end $$;

insert into mr8d_state(key,payload)
select 'preview_begin',public.leah_begin_deployment_for_task(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,(r.payload->>'id')::uuid
)
from mr8d_state c cross join mr8d_state r
where c.key='claim' and r.key='preview_request';

do $$ declare o jsonb; begin
  select payload into o from mr8d_state where key='preview_begin';
  if o->>'operation_nonce' is null or o->>'reservation_id' is null then raise exception 'deployment was not durably reserved before dispatch'; end if;
end $$;

insert into mr8d_state(key,payload)
select 'preview_finish',public.leah_settle_deployment_for_task(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,(r.payload->>'id')::uuid,
  (o.payload->>'operation_nonce')::uuid,'succeeded','vercel-preview-ref','https://preview.example.invalid/',0,null
)
from mr8d_state c cross join mr8d_state r cross join mr8d_state o
where c.key='claim' and r.key='preview_request' and o.key='preview_begin';

-- Production stays awaiting_approval and cannot begin provider work before human approval.
insert into mr8d_state(key,payload)
select 'prod_request',public.leah_request_deployment_for_task(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,(b.payload->>'id')::uuid,
  (t.payload->>'id')::uuid,'mr8d-prod-1'
)
from mr8d_state c cross join mr8d_state b cross join mr8d_state t
where c.key='claim' and b.key='build' and t.key='production_target';

do $$ declare c jsonb; r jsonb; begin
  select payload into c from mr8d_state where key='claim';
  select payload into r from mr8d_state where key='prod_request';
  if r->>'status'<>'awaiting_approval' then raise exception 'production did not enter approval gate'; end if;
  begin
    perform public.leah_begin_deployment_for_task((c->>'id')::uuid,(c->>'lease_token')::uuid,(r->>'id')::uuid);
    raise exception 'production provider work began without approval';
  exception when others then
    if sqlerrm='production provider work began without approval' then raise; end if;
  end;
end $$;

insert into mr8d_state(key,payload)
select 'prod_approved',public.leah_decide_deployment_for_actor(
  'f8d10000-0000-4000-8000-000000000001','f8d00000-0000-4000-8000-000000000001',
  (r.payload->>'id')::uuid,'approve'
)
from mr8d_state r where r.key='prod_request';

do $$ declare a jsonb; begin
  select payload into a from mr8d_state where key='prod_approved';
  if a->>'status'<>'queued' or a->>'approved_by' is null or a->>'approval_build_digest'<>repeat('b',64) then
    raise exception 'production approval is not bound to immutable build digest';
  end if;
end $$;

-- Begin Production with reservation + immutable operation nonce; settle unknown, then reconcile.
insert into mr8d_state(key,payload)
select 'prod_begin',public.leah_begin_deployment_for_task(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,(r.payload->>'id')::uuid
)
from mr8d_state c cross join mr8d_state r where c.key='claim' and r.key='prod_request';

insert into mr8d_state(key,payload)
select 'prod_unknown',public.leah_settle_deployment_for_task(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,(r.payload->>'id')::uuid,
  (o.payload->>'operation_nonce')::uuid,'unknown',null,null,0,'provider_timeout_after_dispatch'
)
from mr8d_state c cross join mr8d_state r cross join mr8d_state o
where c.key='claim' and r.key='prod_request' and o.key='prod_begin';

do $$ declare r jsonb; o jsonb; begin
  select payload into r from mr8d_state where key='prod_request';
  select payload into o from mr8d_state where key='prod_begin';
  if not exists(select 1 from public.leah_deployments where id=(r->>'id')::uuid and status='unknown' and unknown_since is not null) then
    raise exception 'unknown provider outcome was not durable';
  end if;
  begin
    update public.leah_deployments set operation_nonce=gen_random_uuid() where id=(r->>'id')::uuid;
    raise exception 'operation nonce mutation succeeded';
  exception when others then
    if sqlerrm='operation nonce mutation succeeded' then raise; end if;
    if sqlerrm not like '%operation nonce is immutable%' then raise; end if;
  end;
end $$;

insert into mr8d_state(key,payload)
select 'prod_reconciled',public.leah_reconcile_unknown_deployment(
  (r.payload->>'id')::uuid,(o.payload->>'operation_nonce')::uuid,'succeeded',
  'vercel-prod-ref','https://prod.example.invalid/',0,null
)
from mr8d_state r cross join mr8d_state o where r.key='prod_request' and o.key='prod_begin';

do $$ declare r jsonb; begin
  select payload into r from mr8d_state where key='prod_request';
  if not exists(select 1 from public.leah_deployments where id=(r->>'id')::uuid and status='succeeded' and provider_ref='vercel-prod-ref' and completed_at is not null) then
    raise exception 'unknown deployment reconciliation failed';
  end if;
  if not exists(select 1 from public.leah_usage_events where workspace_id='f8d10000-0000-4000-8000-000000000001' and usage_type='deployment') then
    raise exception 'deployment usage truth missing';
  end if;
end $$;

-- Once the task is terminal, a fresh deployment begin is not authorized.
do $$ declare c jsonb; begin
  select payload into c from mr8d_state where key='claim';
  perform public.leah_finish_task((c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{}'::jsonb,null,0);
  begin
    perform public.leah_begin_build_for_task(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,'stale-build',array[(select (payload->>'id')::uuid from mr8d_state where key='artifact')],
      'pulse-builder','mr8d-test'
    );
    raise exception 'stale lease admitted new build side effect';
  exception when others then
    if sqlerrm='stale lease admitted new build side effect' then raise; end if;
  end;
end $$;

rollback;
\echo 'MR8D BUILD / DEPLOY / DEVELOPER HUB CONTRACT: PASS'
