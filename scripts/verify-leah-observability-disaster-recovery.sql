\set ON_ERROR_STOP on
begin;

-- MR8E runtime verifier. Requires canonical LEAH stack through MR8E.
-- All fixtures roll back; no physical restore or Production side effect occurs.
create temp table mr8e_state(key text primary key,payload jsonb) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('e8e00000-0000-4000-8000-000000000001','authenticated','authenticated','mr8e-owner@example.invalid','',now(),now(),now()),
 ('e8e00000-0000-4000-8000-000000000002','authenticated','authenticated','mr8e-foreign@example.invalid','',now(),now(),now());
insert into public.workspaces(id,name,slug,owner_id)
values
 ('e8e10000-0000-4000-8000-000000000001','MR8E Workspace','mr8e-workspace','e8e00000-0000-4000-8000-000000000001'),
 ('e8e10000-0000-4000-8000-000000000002','MR8E Foreign','mr8e-foreign','e8e00000-0000-4000-8000-000000000002');
insert into public.workspace_members(workspace_id,user_id,role)
values
 ('e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000001','owner'),
 ('e8e10000-0000-4000-8000-000000000002','e8e00000-0000-4000-8000-000000000002','owner');
insert into public.leah_workspace_entitlements(
 workspace_id,status,source,concurrency_limit,included_monthly_tokens,storage_bytes_limit,
 ai_funding_mode,metered_overage_enabled,included_monthly_deploys,deploy_overage_enabled,storage_overage_enabled
) values
 ('e8e10000-0000-4000-8000-000000000001','active','mr8e-test',2,100000,1000000,'hybrid',false,10,false,false),
 ('e8e10000-0000-4000-8000-000000000002','active','mr8e-test',1,100000,1000000,'hybrid',false,10,false,false);
insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values
 ('e8e20000-0000-4000-8000-000000000001','e8e10000-0000-4000-8000-000000000001','MR8E Project','mr8e-project','e8e00000-0000-4000-8000-000000000001'),
 ('e8e20000-0000-4000-8000-000000000002','e8e10000-0000-4000-8000-000000000002','MR8E Foreign Project','mr8e-foreign-project','e8e00000-0000-4000-8000-000000000002');

-- Internal telemetry/recovery evidence is not browser-writable/readable.
do $$ begin
 if has_table_privilege('authenticated','public.leah_observability_events','SELECT') then raise exception 'authenticated can read internal trace ledger'; end if;
 if has_table_privilege('authenticated','public.leah_observability_events','INSERT') then raise exception 'authenticated can forge trace evidence'; end if;
 if has_table_privilege('authenticated','public.leah_recovery_checkpoints','INSERT') then raise exception 'authenticated can forge recovery checkpoints'; end if;
 if has_function_privilege('authenticated','public.leah_emit_observability_for_task(uuid,uuid,text,uuid,uuid,uuid,text,text,text,jsonb)','EXECUTE') then raise exception 'authenticated can call worker telemetry RPC'; end if;
end $$;

insert into mr8e_state(key,payload)
values('start',public.leah_start_execution(
 'e8e10000-0000-4000-8000-000000000001','e8e20000-0000-4000-8000-000000000001',
 'e8e00000-0000-4000-8000-000000000001','mr8e-run','{}'::jsonb,'manual'
));
insert into mr8e_state(key,payload)
values('claim',public.leah_claim_next_task('mr8e-worker',600));

do $$ declare c jsonb; begin
 select payload into c from mr8e_state where key='claim';
 if c is null or c->>'lease_token' is null then raise exception 'MR8E task was not leased'; end if;
end $$;

-- Live task telemetry admission + exact idempotent replay.
insert into mr8e_state(key,payload)
select 'event',public.leah_emit_observability_for_task(
 (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,'mr8e:event:1',
 'e8e30000-0000-4000-8000-000000000001','e8e30000-0000-4000-8000-000000000002',null,
 'task','info','mr8e.task.started','{"attempt":1,"component":"worker"}'::jsonb
) from mr8e_state c where c.key='claim';

do $$ declare c jsonb; e jsonb; r jsonb; begin
 select payload into c from mr8e_state where key='claim';
 select payload into e from mr8e_state where key='event';
 if e->>'idempotent_replay'<>'false' then raise exception 'first telemetry emit was marked replay'; end if;
 r:=public.leah_emit_observability_for_task(
   (c->>'id')::uuid,(c->>'lease_token')::uuid,'mr8e:event:1',
   'e8e30000-0000-4000-8000-000000000001','e8e30000-0000-4000-8000-000000000002',null,
   'task','info','mr8e.task.started','{"attempt":1,"component":"worker"}'::jsonb
 );
 if r->>'idempotent_replay'<>'true' or r->>'id'<>e->>'id' then raise exception 'telemetry replay is not exact'; end if;
 begin
   perform public.leah_emit_observability_for_task(
     (c->>'id')::uuid,(c->>'lease_token')::uuid,'mr8e:event:1',
     'e8e30000-0000-4000-8000-000000000001','e8e30000-0000-4000-8000-000000000003',null,
     'task','info','mr8e.task.started','{"attempt":1}'::jsonb
   );
   raise exception 'telemetry idempotency conflict was accepted';
 exception when others then
   if sqlerrm='telemetry idempotency conflict was accepted' then raise; end if;
   if sqlerrm not like '%LEAH_OBSERVABILITY_IDEMPOTENCY_CONFLICT%' then raise; end if;
 end;
end $$;

-- Nested secret-like telemetry keys are denied before persistence.
do $$ declare c jsonb; begin
 select payload into c from mr8e_state where key='claim';
 begin
   perform public.leah_emit_observability_for_task(
     (c->>'id')::uuid,(c->>'lease_token')::uuid,'mr8e:event:secret',
     gen_random_uuid(),gen_random_uuid(),null,'provider','error','mr8e.secret.test',
     '{"safe":{"authorization":"Bearer should-never-persist"}}'::jsonb
   );
   raise exception 'secret-like telemetry attribute persisted';
 exception when others then
   if sqlerrm='secret-like telemetry attribute persisted' then raise; end if;
   if sqlerrm not like '%Secret-like observability attributes are forbidden%' then raise; end if;
 end;
end $$;

-- Trace evidence is structurally append-only.
do $$ declare e jsonb; begin
 select payload into e from mr8e_state where key='event';
 begin
   update public.leah_observability_events set severity='critical' where id=(e->>'id')::uuid;
   raise exception 'trace update succeeded';
 exception when others then
   if sqlerrm='trace update succeeded' then raise; end if;
   if sqlerrm not like '%append-only%' then raise; end if;
 end;
 begin
   delete from public.leah_observability_events where id=(e->>'id')::uuid;
   raise exception 'trace delete succeeded';
 exception when others then
   if sqlerrm='trace delete succeeded' then raise; end if;
   if sqlerrm not like '%append-only%' then raise; end if;
 end;
end $$;

-- Cross-workspace actor reads are denied.
do $$ begin
 begin
   perform public.leah_list_observability_for_actor(
     'e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000002',
     'e8e20000-0000-4000-8000-000000000001',100
   );
   raise exception 'cross-workspace observability read succeeded';
 exception when others then
   if sqlerrm='cross-workspace observability read succeeded' then raise; end if;
 end;
end $$;

-- Health is computed from canonical ledgers, not copied health state.
do $$ declare h jsonb; begin
 h:=public.leah_runtime_health_for_actor(
   'e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000001',
   'e8e20000-0000-4000-8000-000000000001'
 );
 if h->'tasks'->>'running' is null or h->'provider_attempts'->>'unknown' is null
    or h->'agent_bus'->>'dead_letter' is null or h->'deployments'->>'unknown' is null then
   raise exception 'canonical runtime health dimensions missing';
 end if;
end $$;

-- Add immutable artifact/build evidence so the recovery manifest proves hashes, not only counts.
insert into mr8e_state(key,payload)
select 'artifact',public.leah_put_artifact_for_task(
 (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,'source','src/mr8e.ts','export const recovery = true;',
 encode(digest(convert_to('export const recovery = true;','UTF8'),'sha256'),'hex')
) from mr8e_state c where c.key='claim';
insert into mr8e_state(key,payload)
select 'build',public.leah_begin_build_for_task(
 (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,'mr8e-recovery-build',
 array[(a.payload->>'id')::uuid],'pulse-builder','mr8e-test'
) from mr8e_state c cross join mr8e_state a where c.key='claim' and a.key='artifact';
insert into mr8e_state(key,payload)
select 'build_finish',public.leah_finish_build_for_task(
 (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,(b.payload->>'id')::uuid,
 'succeeded',repeat('c',64),'{}'::jsonb,null
) from mr8e_state c cross join mr8e_state b where c.key='claim' and b.key='build';

-- Recovery checkpoint is safe, hashed and immutable.
insert into mr8e_state(key,payload)
values('checkpoint',public.leah_create_recovery_checkpoint_for_actor(
 'e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000001',
 'e8e20000-0000-4000-8000-000000000001'
));

do $$ declare c jsonb; v jsonb; begin
 select payload into c from mr8e_state where key='checkpoint';
 if c->>'manifest_hash' !~ '^[0-9a-f]{64}$' then raise exception 'recovery manifest hash missing'; end if;
 if public.leah_jsonb_contains_secret_key(c->'manifest') then raise exception 'recovery manifest contains secret-like key'; end if;
 v:=public.leah_verify_recovery_checkpoint_for_actor(
   'e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000001',(c->>'id')::uuid
 );
 if v->>'valid'<>'true' or v->>'artifact_references_valid'<>'true' or v->>'build_references_valid'<>'true' then
   raise exception 'recovery checkpoint integrity failed';
 end if;
 begin
   update public.leah_recovery_checkpoints set manifest_hash=repeat('0',64) where id=(c->>'id')::uuid;
   raise exception 'recovery checkpoint mutation succeeded';
 exception when others then
   if sqlerrm='recovery checkpoint mutation succeeded' then raise; end if;
   if sqlerrm not like '%checkpoint is immutable%' then raise; end if;
 end;
end $$;

-- Cross-workspace checkpoint verification is denied.
do $$ declare c jsonb; begin
 select payload into c from mr8e_state where key='checkpoint';
 begin
   perform public.leah_verify_recovery_checkpoint_for_actor(
     'e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000002',(c->>'id')::uuid
   );
   raise exception 'cross-workspace recovery verification succeeded';
 exception when others then
   if sqlerrm='cross-workspace recovery verification succeeded' then raise; end if;
 end;
end $$;

-- Drill is durable evidence and append-only.
insert into mr8e_state(key,payload)
select 'drill',public.leah_run_recovery_drill_for_actor(
 'e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000001',(c.payload->>'id')::uuid
) from mr8e_state c where c.key='checkpoint';

do $$ declare d jsonb; begin
 select payload into d from mr8e_state where key='drill';
 if d->>'status'<>'succeeded' or d->>'integrity_verified'<>'true' then raise exception 'recovery drill did not pass'; end if;
 begin
   delete from public.leah_recovery_drills where id=(d->>'id')::uuid;
   raise exception 'recovery drill deletion succeeded';
 exception when others then
   if sqlerrm='recovery drill deletion succeeded' then raise; end if;
   if sqlerrm not like '%append-only%' then raise; end if;
 end;
end $$;

-- Preview plan may be integrity-verified directly; this is NOT a restore execution.
insert into mr8e_state(key,payload)
select 'preview_plan',public.leah_prepare_recovery_plan_for_actor(
 'e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000001',(c.payload->>'id')::uuid,'preview'
) from mr8e_state c where c.key='checkpoint';
insert into mr8e_state(key,payload)
select 'preview_verified',public.leah_verify_recovery_plan_for_actor(
 'e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000001',(p.payload->>'id')::uuid
) from mr8e_state p where p.key='preview_plan';

-- Production recovery cannot even reach verification before explicit human approval.
insert into mr8e_state(key,payload)
select 'prod_plan',public.leah_prepare_recovery_plan_for_actor(
 'e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000001',(c.payload->>'id')::uuid,'production'
) from mr8e_state c where c.key='checkpoint';

do $$ declare p jsonb; begin
 select payload into p from mr8e_state where key='prod_plan';
 if p->>'status'<>'awaiting_approval' then raise exception 'production recovery skipped approval gate'; end if;
 begin
   perform public.leah_verify_recovery_plan_for_actor(
     'e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000001',(p->>'id')::uuid
   );
   raise exception 'production recovery verification ran without approval';
 exception when others then
   if sqlerrm='production recovery verification ran without approval' then raise; end if;
   if sqlerrm not like '%not authorized for verification%' then raise; end if;
 end;
end $$;

insert into mr8e_state(key,payload)
select 'prod_approved',public.leah_decide_recovery_plan_for_actor(
 'e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000001',(p.payload->>'id')::uuid,'approve'
) from mr8e_state p where p.key='prod_plan';
insert into mr8e_state(key,payload)
select 'prod_verified',public.leah_verify_recovery_plan_for_actor(
 'e8e10000-0000-4000-8000-000000000001','e8e00000-0000-4000-8000-000000000001',(p.payload->>'id')::uuid
) from mr8e_state p where p.key='prod_plan';

do $$ declare p jsonb; begin
 select payload into p from mr8e_state where key='prod_verified';
 if p->>'status'<>'verified' or p->'verification_result'->>'valid'<>'true' then raise exception 'approved production recovery plan did not verify'; end if;
end $$;

-- MR8E intentionally exposes no physical restore executor RPC.
do $$ begin
 if to_regprocedure('public.leah_execute_recovery_plan(uuid,uuid)') is not null
    or to_regprocedure('public.leah_restore_recovery_checkpoint(uuid,uuid)') is not null then
   raise exception 'MR8E unexpectedly exposes physical restore execution';
 end if;
end $$;

-- Terminal task lease cannot emit new telemetry.
do $$ declare c jsonb; begin
 select payload into c from mr8e_state where key='claim';
 perform public.leah_finish_task((c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{}'::jsonb,null,0);
 begin
   perform public.leah_emit_observability_for_task(
     (c->>'id')::uuid,(c->>'lease_token')::uuid,'mr8e:event:stale',gen_random_uuid(),gen_random_uuid(),null,
     'task','info','mr8e.stale','{}'::jsonb
   );
   raise exception 'stale task lease emitted telemetry';
 exception when others then
   if sqlerrm='stale task lease emitted telemetry' then raise; end if;
   if sqlerrm not like '%Task lease invalid or expired%' then raise; end if;
 end;
end $$;

rollback;
\echo 'MR8E OBSERVABILITY / BROWSER E2E / DISASTER RECOVERY CONTRACT: PASS'
