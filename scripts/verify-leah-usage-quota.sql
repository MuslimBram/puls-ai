\set ON_ERROR_STOP on
begin;

create temp table mr5_usage_state(key text primary key,payload jsonb) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('fe200000-0000-4000-8000-000000000001','authenticated','authenticated','leah-mr5-usage@example.invalid','',now(),now(),now());
insert into public.workspaces(id,name,slug,owner_id)
values ('fe100000-0000-4000-8000-000000000001','LEAH MR5 Usage','leah-mr5-usage','fe200000-0000-4000-8000-000000000001');
insert into public.workspace_members(workspace_id,user_id,role)
values ('fe100000-0000-4000-8000-000000000001','fe200000-0000-4000-8000-000000000001','owner');

insert into public.leah_workspace_entitlements(
  workspace_id,status,source,concurrency_limit,
  included_monthly_tokens,storage_bytes_limit,
  ai_funding_mode,metered_overage_enabled,
  included_monthly_deploys,deploy_overage_enabled,storage_overage_enabled
) values (
  'fe100000-0000-4000-8000-000000000001','active','mr5-usage-test',2,
  100,10,'hybrid',false,1,false,false
);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values ('fe300000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','Usage Project','usage-project','fe200000-0000-4000-8000-000000000001');

insert into mr5_usage_state(key,payload)
values ('start',public.leah_start_execution(
  'fe100000-0000-4000-8000-000000000001','fe300000-0000-4000-8000-000000000001',
  'fe200000-0000-4000-8000-000000000001','mr5-usage-run','{}'::jsonb,'manual'
));
insert into mr5_usage_state(key,payload)
values ('claim',public.leah_claim_next_task('mr5-usage-worker',300));

do $$
declare c jsonb;
begin
  select payload into c from mr5_usage_state where key='claim';
  if c is null or c->>'lease_token' is null then raise exception 'MR5 usage task was not leased'; end if;
end $$;

-- Metering internals are service-only.
do $$
begin
  if has_function_privilege('authenticated','public.leah_reserve_managed_tokens(uuid,uuid,text,bigint,integer)','EXECUTE') then
    raise exception 'authenticated can reserve managed LEAH tokens';
  end if;
  if has_function_privilege('authenticated','public.leah_reserve_deployment_for_task(uuid,uuid,text,text,integer)','EXECUTE') then
    raise exception 'authenticated can reserve LEAH deployments';
  end if;
  if has_function_privilege('authenticated','public.leah_usage_summary(uuid)','EXECUTE') then
    raise exception 'authenticated can bypass LEAH account API for usage summary';
  end if;
end $$;

-- Reserve 80/100 managed tokens.
insert into mr5_usage_state(key,payload)
select 'token80',public.leah_reserve_managed_tokens(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,'mr5-token-80',80,300
) from mr5_usage_state where key='claim';

do $$
declare c jsonb;
begin
  select payload into c from mr5_usage_state where key='claim';
  begin
    perform public.leah_reserve_managed_tokens((c->>'id')::uuid,(c->>'lease_token')::uuid,'mr5-token-over',21,300);
    raise exception 'Managed token quota oversubscription was accepted';
  exception when others then
    if sqlerrm='Managed token quota oversubscription was accepted' then raise; end if;
    if sqlerrm not like '%LEAH_TOKEN_QUOTA_EXCEEDED%' then raise; end if;
  end;
end $$;

-- Same reservation key is idempotent only with the same task/lease/amount.
do $$
declare c jsonb; r jsonb;
begin
  select payload into c from mr5_usage_state where key='claim';
  r := public.leah_reserve_managed_tokens((c->>'id')::uuid,(c->>'lease_token')::uuid,'mr5-token-80',80,300);
  if r->>'idempotent_replay' <> 'true' then raise exception 'Managed reservation replay not idempotent'; end if;
  begin
    perform public.leah_reserve_managed_tokens((c->>'id')::uuid,(c->>'lease_token')::uuid,'mr5-token-80',79,300);
    raise exception 'Managed reservation conflict was accepted';
  exception when others then
    if sqlerrm='Managed reservation conflict was accepted' then raise; end if;
    if sqlerrm not like '%LEAH_USAGE_RESERVATION_CONFLICT%' then raise; end if;
  end;
end $$;

-- BYOK usage is metered separately and does not consume the managed-token allowance.
do $$
declare c jsonb; r jsonb;
begin
  select payload into c from mr5_usage_state where key='claim';
  r := public.leah_record_byok_usage_for_task(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,'mr5-byok-1','anthropic','claude-test',500,100,0,'{}'::jsonb
  );
  if r->>'funding_source' <> 'byok' then raise exception 'BYOK usage funding source mismatch'; end if;
end $$;

-- Storage quota is checked before artifact persistence. 4 bytes succeeds; another 7
-- bytes would make retained storage 11 > limit 10 and must fail with no second row.
do $$
declare c jsonb; a jsonb;
begin
  select payload into c from mr5_usage_state where key='claim';
  a := public.leah_put_artifact_for_task(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,'code','a.txt','1234',repeat('a',64)
  );
  if (a->>'byte_size')::bigint <> 4 then raise exception 'Artifact byte_size truth mismatch'; end if;
  begin
    perform public.leah_put_artifact_for_task(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,'code','b.txt','1234567',repeat('b',64)
    );
    raise exception 'Storage quota overflow artifact was persisted';
  exception when others then
    if sqlerrm='Storage quota overflow artifact was persisted' then raise; end if;
    if sqlerrm not like '%LEAH_STORAGE_QUOTA_EXCEEDED%' then raise; end if;
  end;
  if exists(select 1 from public.leah_project_artifacts where workspace_id='fe100000-0000-4000-8000-000000000001' and path='b.txt') then
    raise exception 'Rejected storage artifact exists';
  end if;
end $$;

-- Deployment quota is reserved before cloud side effects.
insert into mr5_usage_state(key,payload)
select 'deploy1',public.leah_reserve_deployment_for_task(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,'mr5-deploy-1','vercel',600
) from mr5_usage_state where key='claim';

do $$
declare c jsonb;
begin
  select payload into c from mr5_usage_state where key='claim';
  begin
    perform public.leah_reserve_deployment_for_task((c->>'id')::uuid,(c->>'lease_token')::uuid,'mr5-deploy-2','vercel',600);
    raise exception 'Deployment quota oversubscription was accepted';
  exception when others then
    if sqlerrm='Deployment quota oversubscription was accepted' then raise; end if;
    if sqlerrm not like '%LEAH_DEPLOY_QUOTA_EXCEEDED%' then raise; end if;
  end;
end $$;

-- Finalize deployment once and ensure replay cannot double meter.
do $$
declare c jsonb; d jsonb; r jsonb; r2 jsonb;
begin
  select payload into c from mr5_usage_state where key='claim';
  select payload into d from mr5_usage_state where key='deploy1';
  r := public.leah_finalize_deployment_usage(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,(d->>'id')::uuid,'dpl_mr5_once',123,'{}'::jsonb
  );
  if r->>'idempotent_replay' <> 'false' then raise exception 'First deployment settlement marked replay'; end if;
  r2 := public.leah_finalize_deployment_usage(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,(d->>'id')::uuid,'dpl_mr5_once',123,'{}'::jsonb
  );
  if r2->>'idempotent_replay' <> 'true' then raise exception 'Deployment settlement replay not idempotent'; end if;
  if (select count(*) from public.leah_usage_events where workspace_id='fe100000-0000-4000-8000-000000000001' and event_key='mr5-deploy-1') <> 1 then
    raise exception 'Deployment was double-metered';
  end if;
end $$;

-- Managed provider settlement must remain durable even if the worker lease expires
-- after the provider side effect, while new side effects remain forbidden.
do $$
declare c jsonb; r jsonb; rid uuid; tid uuid; tok uuid;
begin
  select payload into c from mr5_usage_state where key='claim';
  tid := (c->>'id')::uuid; tok := (c->>'lease_token')::uuid;
  select (payload->>'id')::uuid into rid from mr5_usage_state where key='token80';

  update public.leah_tasks set lease_expires_at=clock_timestamp()-interval '1 second'
  where id=tid and lease_token=tok and status='running';

  r := public.leah_finalize_managed_usage(tid,tok,rid,'openai','gpt-test',40,30,777,'{}'::jsonb);
  if r->>'idempotent_replay' <> 'false' then raise exception 'Managed settlement after lease expiry did not persist truth'; end if;

  begin
    perform public.leah_put_artifact_for_task(tid,tok,'code','stale.txt','x',repeat('c',64));
    raise exception 'Expired lease retained artifact authority';
  exception when others then
    if sqlerrm='Expired lease retained artifact authority' then raise; end if;
    if sqlerrm not like '%Task lease invalid or expired%' then raise; end if;
  end;
end $$;

-- Final truth: 70 managed tokens, 600 BYOK tokens, one deployment, 4 storage bytes.
do $$
declare s jsonb;
begin
  s := public.leah_usage_summary('fe100000-0000-4000-8000-000000000001');
  if (s->>'managed_tokens')::bigint <> 70 then raise exception 'Managed token summary mismatch'; end if;
  if (s->>'byok_tokens')::bigint <> 600 then raise exception 'BYOK token summary mismatch'; end if;
  if (s->>'deployments')::bigint <> 1 then raise exception 'Deployment summary mismatch'; end if;
  if (s->>'storage_used_bytes')::bigint <> 4 then raise exception 'Storage summary mismatch'; end if;
end $$;

rollback;
\echo 'LEAH USAGE / QUOTA CONTRACT: PASS'
