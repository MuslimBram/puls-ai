\set ON_ERROR_STOP on
begin;

create temp table mr7a_state(key text primary key, payload jsonb) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('fa200000-0000-4000-8000-000000000001','authenticated','authenticated','leah-mr7a@example.invalid','',now(),now(),now());
insert into public.workspaces(id,name,slug,owner_id)
values ('fa100000-0000-4000-8000-000000000001','LEAH MR7A','leah-mr7a','fa200000-0000-4000-8000-000000000001');
insert into public.workspace_members(workspace_id,user_id,role)
values ('fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','owner');

insert into public.leah_workspace_entitlements(
  workspace_id,status,source,concurrency_limit,
  included_monthly_tokens,storage_bytes_limit,
  ai_funding_mode,metered_overage_enabled,
  included_monthly_deploys,deploy_overage_enabled,storage_overage_enabled
) values (
  'fa100000-0000-4000-8000-000000000001','active','mr7a-test',2,
  100000,1000000,'hybrid',false,10,false,false
);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values ('fa300000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','MR7A Project','mr7a-project','fa200000-0000-4000-8000-000000000001');

insert into mr7a_state(key,payload)
values ('start',public.leah_start_execution(
  'fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',
  'fa200000-0000-4000-8000-000000000001','mr7a-run','{}'::jsonb,'manual'
));
insert into mr7a_state(key,payload)
values ('claim',public.leah_claim_next_task('mr7a-worker',300));

do $$
declare c jsonb;
begin
  select payload into c from mr7a_state where key='claim';
  if c is null or c->>'lease_token' is null then raise exception 'MR7A task was not leased'; end if;
end $$;

-- Ledger and mutation primitives are service-only.
do $$
begin
  if has_table_privilege('authenticated','public.leah_provider_attempts','SELECT') then raise exception 'authenticated can read provider attempts'; end if;
  if has_table_privilege('authenticated','public.leah_provider_requests','SELECT') then raise exception 'authenticated can read provider logical requests'; end if;
  if has_function_privilege('authenticated','public.leah_begin_provider_attempt(uuid,uuid,uuid,uuid,text,text,text,uuid,jsonb)','EXECUTE') then raise exception 'authenticated can begin provider attempts'; end if;
  if has_function_privilege('authenticated','public.leah_finish_provider_attempt(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,bigint,text,integer,boolean,jsonb)','EXECUTE') then raise exception 'authenticated can finish provider attempts'; end if;
  if has_function_privilege('authenticated','public.leah_claim_provider_materialization(uuid,uuid,uuid,text)','EXECUTE') then raise exception 'authenticated can claim provider materialization'; end if;
  if has_function_privilege('authenticated','public.leah_finalize_provider_materialization(uuid,uuid,uuid,text,text)','EXECUTE') then raise exception 'authenticated can finalize provider materialization'; end if;
end $$;

-- Reserve managed quota before any managed provider attempt.
insert into mr7a_state(key,payload)
select 'res1',public.leah_reserve_managed_tokens(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,'mr7a-res-1',1000,300
) from mr7a_state where key='claim';

-- Managed attempts require a bound active reservation.
do $$
declare c jsonb;
begin
  select payload into c from mr7a_state where key='claim';
  begin
    perform public.leah_begin_provider_attempt(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,
      'fa400000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000001',
      'managed','openai','gpt-test',null,'{}'::jsonb
    );
    raise exception 'Managed attempt without reservation was accepted';
  exception when others then
    if sqlerrm='Managed attempt without reservation was accepted' then raise; end if;
    if sqlerrm not like '%requires token reservation%' then raise; end if;
  end;
end $$;

-- First managed attempt is durable before provider dispatch and idempotent on exact replay.
insert into mr7a_state(key,payload)
select 'attempt1',public.leah_begin_provider_attempt(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,
  'fa400000-0000-4000-8000-000000000010','fa500000-0000-4000-8000-000000000010',
  'managed','openai','gpt-test',(r.payload->>'id')::uuid,'{"phase":"before_call"}'::jsonb
)
from mr7a_state c cross join mr7a_state r
where c.key='claim' and r.key='res1';

do $$
declare c jsonb; r jsonb; replay jsonb;
begin
  select payload into c from mr7a_state where key='claim';
  select payload into r from mr7a_state where key='res1';
  replay := public.leah_begin_provider_attempt(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,
    'fa400000-0000-4000-8000-000000000010','fa500000-0000-4000-8000-000000000010',
    'managed','openai','gpt-test',(r->>'id')::uuid,'{"phase":"before_call"}'::jsonb
  );
  if replay->>'idempotent_replay' <> 'true' then raise exception 'Provider attempt replay not idempotent'; end if;
  begin
    perform public.leah_begin_provider_attempt(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,
      'fa400000-0000-4000-8000-000000000010','fa500000-0000-4000-8000-000000000010',
      'managed','openai','different-model',(r->>'id')::uuid,'{}'::jsonb
    );
    raise exception 'Conflicting provider attempt replay was accepted';
  exception when others then
    if sqlerrm='Conflicting provider attempt replay was accepted' then raise; end if;
    if sqlerrm not like '%LEAH_PROVIDER_ATTEMPT_CONFLICT%' then raise; end if;
  end;
end $$;

-- A BYOK attempt can exist in hybrid mode, but it cannot borrow a managed reservation.
do $$
declare c jsonb; r jsonb;
begin
  select payload into c from mr7a_state where key='claim';
  select payload into r from mr7a_state where key='res1';
  begin
    perform public.leah_begin_provider_attempt(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,
      'fa400000-0000-4000-8000-000000000020','fa500000-0000-4000-8000-000000000020',
      'byok','anthropic','claude-test',(r->>'id')::uuid,'{}'::jsonb
    );
    raise exception 'BYOK attempt accepted managed reservation';
  exception when others then
    if sqlerrm='BYOK attempt accepted managed reservation' then raise; end if;
    if sqlerrm not like '%cannot use managed reservation%' then raise; end if;
  end;
end $$;

-- billing_mode is immutable for a logical request, including direct table inserts.
insert into mr7a_state(key,payload)
select 'byok-cross',public.leah_begin_provider_attempt(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,
  'fa400000-0000-4000-8000-000000000030','fa500000-0000-4000-8000-000000000030',
  'byok','kimi','kimi-test',null,'{}'::jsonb
) from mr7a_state where key='claim';

insert into mr7a_state(key,payload)
select 'res-cross',public.leah_reserve_managed_tokens(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,'mr7a-res-cross',1000,300
) from mr7a_state where key='claim';

do $$
declare c jsonb; r jsonb; ex uuid;
begin
  select payload into c from mr7a_state where key='claim';
  select payload into r from mr7a_state where key='res-cross';
  begin
    perform public.leah_begin_provider_attempt(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,
      'fa400000-0000-4000-8000-000000000030','fa500000-0000-4000-8000-000000000031',
      'managed','gemini','gemini-test',(r->>'id')::uuid,'{}'::jsonb
    );
    raise exception 'BYOK logical request crossed into managed mode';
  exception when others then
    if sqlerrm='BYOK logical request crossed into managed mode' then raise; end if;
    if sqlerrm not like '%LEAH_PROVIDER_REQUEST_CONFLICT%' then raise; end if;
  end;

  select execution_id into ex from public.leah_tasks where id=(c->>'id')::uuid;
  begin
    insert into public.leah_provider_attempts(
      workspace_id,execution_id,task_id,logical_request_id,attempt_id,authority_lease_token,
      reservation_id,billing_mode,provider,model
    ) values (
      'fa100000-0000-4000-8000-000000000001',ex,(c->>'id')::uuid,
      'fa400000-0000-4000-8000-000000000030','fa500000-0000-4000-8000-000000000032',(c->>'lease_token')::uuid,
      (r->>'id')::uuid,'managed','deepseek','deepseek-test'
    );
    raise exception 'Direct insert crossed logical request billing mode';
  exception when others then
    if sqlerrm='Direct insert crossed logical request billing mode' then raise; end if;
    if sqlerrm not like '%LEAH_PROVIDER_REQUEST_CONFLICT%' then raise; end if;
  end;
end $$;

-- Second provider attempt in the same managed request can exist, but only one may become canonical.
insert into mr7a_state(key,payload)
select 'res2',public.leah_reserve_managed_tokens(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,'mr7a-res-2',1000,300
) from mr7a_state where key='claim';
insert into mr7a_state(key,payload)
select 'attempt2',public.leah_begin_provider_attempt(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,
  'fa400000-0000-4000-8000-000000000010','fa500000-0000-4000-8000-000000000011',
  'managed','anthropic','claude-test',(r.payload->>'id')::uuid,'{}'::jsonb
)
from mr7a_state c cross join mr7a_state r
where c.key='claim' and r.key='res2';

-- Finish attempt1 as the canonical success with provider-reported usage.
insert into mr7a_state(key,payload)
select 'finish1',public.leah_finish_provider_attempt(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,
  'fa500000-0000-4000-8000-000000000010','succeeded','req-openai-1','provider',100,50,150,null,null,321,true,
  '{"generated_output_valid":true}'::jsonb
)
from mr7a_state c where c.key='claim';

do $$
declare c jsonb; replay jsonb;
begin
  select payload into c from mr7a_state where key='claim';
  replay := public.leah_finish_provider_attempt(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,
    'fa500000-0000-4000-8000-000000000010','succeeded','req-openai-1','provider',100,50,150,null,null,321,true,
    '{"generated_output_valid":true}'::jsonb
  );
  if replay->>'idempotent_replay' <> 'true' then raise exception 'Provider finish replay not idempotent'; end if;

  begin
    perform public.leah_finish_provider_attempt(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,
      'fa500000-0000-4000-8000-000000000011','succeeded','req-anthropic-1','provider',80,40,120,null,null,250,true,'{}'::jsonb
    );
    raise exception 'Second canonical result was accepted';
  exception when unique_violation then
    null;
  when others then
    if sqlerrm='Second canonical result was accepted' then raise; end if;
    raise;
  end;
end $$;

-- Unknown outcomes are durable evidence and never eligible for materialization.
insert into mr7a_state(key,payload)
select 'res-unknown',public.leah_reserve_managed_tokens(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,'mr7a-res-unknown',1000,300
) from mr7a_state where key='claim';
insert into mr7a_state(key,payload)
select 'attempt-unknown',public.leah_begin_provider_attempt(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,
  'fa400000-0000-4000-8000-000000000040','fa500000-0000-4000-8000-000000000040',
  'managed','gemini','gemini-test',(r.payload->>'id')::uuid,'{}'::jsonb
)
from mr7a_state c cross join mr7a_state r
where c.key='claim' and r.key='res-unknown';
select public.leah_finish_provider_attempt(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,
  'fa500000-0000-4000-8000-000000000040','unknown',null,'unavailable',null,null,null,null,'outcome_unknown',20000,false,'{}'::jsonb
) from mr7a_state where key='claim';

do $$
declare c jsonb;
begin
  select payload into c from mr7a_state where key='claim';
  begin
    perform public.leah_claim_provider_materialization(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,'fa500000-0000-4000-8000-000000000040','github:unknown'
    );
    raise exception 'Unknown provider attempt was materializable';
  exception when others then
    if sqlerrm='Unknown provider attempt was materializable' then raise; end if;
    if sqlerrm not like '%not canonical%' then raise; end if;
  end;
end $$;

-- Canonical materialization is claimed once before the external side effect.
insert into mr7a_state(key,payload)
select 'mat1',public.leah_claim_provider_materialization(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,
  'fa500000-0000-4000-8000-000000000010','github:mr7a-request-1'
) from mr7a_state where key='claim';

do $$
declare c jsonb; replay jsonb;
begin
  select payload into c from mr7a_state where key='claim';
  replay := public.leah_claim_provider_materialization(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,
    'fa500000-0000-4000-8000-000000000010','github:mr7a-request-1'
  );
  if replay->>'idempotent_replay' <> 'true' then raise exception 'Materialization claim replay not idempotent'; end if;
  begin
    perform public.leah_claim_provider_materialization(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,
      'fa500000-0000-4000-8000-000000000010','github:different-key'
    );
    raise exception 'Conflicting materialization key was accepted';
  exception when others then
    if sqlerrm='Conflicting materialization key was accepted' then raise; end if;
    if sqlerrm not like '%LEAH_PROVIDER_MATERIALIZATION_CONFLICT%' then raise; end if;
  end;
end $$;

-- Prepare another canonical request, then expire the lease before its claim.
insert into mr7a_state(key,payload)
select 'res-stale',public.leah_reserve_managed_tokens(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,'mr7a-res-stale',1000,300
) from mr7a_state where key='claim';
insert into mr7a_state(key,payload)
select 'attempt-stale',public.leah_begin_provider_attempt(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,
  'fa400000-0000-4000-8000-000000000050','fa500000-0000-4000-8000-000000000050',
  'managed','deepseek','deepseek-test',(r.payload->>'id')::uuid,'{}'::jsonb
)
from mr7a_state c cross join mr7a_state r
where c.key='claim' and r.key='res-stale';
select public.leah_finish_provider_attempt(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,
  'fa500000-0000-4000-8000-000000000050','succeeded','req-deepseek-1','provider',90,30,120,null,null,280,true,'{}'::jsonb
) from mr7a_state where key='claim';

-- Once a side effect was already claimed, finalization records truth even if the lease expires.
do $$
declare c jsonb;
begin
  select payload into c from mr7a_state where key='claim';
  update public.leah_tasks
  set lease_expires_at=clock_timestamp()-interval '1 second'
  where id=(c->>'id')::uuid and lease_token=(c->>'lease_token')::uuid and status='running';

  perform public.leah_finalize_provider_materialization(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,
    'fa500000-0000-4000-8000-000000000010','github:mr7a-request-1','0123456789012345678901234567890123456789'
  );

  begin
    perform public.leah_claim_provider_materialization(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,
      'fa500000-0000-4000-8000-000000000050','github:stale-claim'
    );
    raise exception 'Expired lease authorized a new materialization';
  exception when others then
    if sqlerrm='Expired lease authorized a new materialization' then raise; end if;
    if sqlerrm not like '%Task lease invalid or expired%' then raise; end if;
  end;
end $$;

-- Final evidence rows are server-authoritative and contain no raw secret material.
do $$
begin
  if (select count(*) from public.leah_provider_requests where workspace_id='fa100000-0000-4000-8000-000000000001') < 4 then
    raise exception 'Provider logical-request evidence missing';
  end if;
  if (select count(*) from public.leah_provider_attempts where workspace_id='fa100000-0000-4000-8000-000000000001' and canonical_result) <> 2 then
    raise exception 'Canonical provider result count mismatch';
  end if;
  if (select count(*) from public.leah_provider_attempts where workspace_id='fa100000-0000-4000-8000-000000000001' and status='unknown') <> 1 then
    raise exception 'Unknown provider outcome evidence missing';
  end if;
  if (select count(*) from public.leah_provider_attempts where workspace_id='fa100000-0000-4000-8000-000000000001' and materialization_status='materialized') <> 1 then
    raise exception 'Materialization evidence mismatch';
  end if;
end $$;

rollback;
\echo 'LEAH PROVIDER ATTEMPT LEDGER CONTRACT: PASS'
