\set ON_ERROR_STOP on
begin;

-- MR8A runtime verifier. Requires MR2/MR3/MR5/MR7 stack + MR8A migrations.
-- All fixtures roll back.

create temp table mr8a_state(key text primary key, payload jsonb) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('e8a00000-0000-4000-8000-000000000001','authenticated','authenticated','mr8a-owner-a@example.invalid','',now(),now(),now()),
  ('e8a00000-0000-4000-8000-000000000002','authenticated','authenticated','mr8a-owner-b@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values
  ('e8a10000-0000-4000-8000-000000000001','MR8A Workspace A','mr8a-a','e8a00000-0000-4000-8000-000000000001'),
  ('e8a10000-0000-4000-8000-000000000002','MR8A Workspace B','mr8a-b','e8a00000-0000-4000-8000-000000000002');

insert into public.workspace_members(workspace_id,user_id,role)
values
  ('e8a10000-0000-4000-8000-000000000001','e8a00000-0000-4000-8000-000000000001','owner'),
  ('e8a10000-0000-4000-8000-000000000002','e8a00000-0000-4000-8000-000000000002','owner');

insert into public.leah_workspace_entitlements(workspace_id,status,source,concurrency_limit)
values
  ('e8a10000-0000-4000-8000-000000000001','active','mr8a-test',2),
  ('e8a10000-0000-4000-8000-000000000002','active','mr8a-test',1);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values
  ('e8a20000-0000-4000-8000-000000000001','e8a10000-0000-4000-8000-000000000001','MR8A Project A','mr8a-project-a','e8a00000-0000-4000-8000-000000000001'),
  ('e8a20000-0000-4000-8000-000000000002','e8a10000-0000-4000-8000-000000000002','MR8A Project B','mr8a-project-b','e8a00000-0000-4000-8000-000000000002');

-- ACL and schema truth.
do $$
begin
  if not exists(select 1 from pg_extension where extname='vector') then raise exception 'pgvector is not installed'; end if;
  if has_table_privilege('authenticated','public.leah_memory_embedding_attempts','SELECT') then
    raise exception 'authenticated can read embedding attempt ledger';
  end if;
  if has_table_privilege('authenticated','public.leah_memory_embedding_attempts','INSERT') then
    raise exception 'authenticated can forge embedding attempts';
  end if;
  if has_function_privilege('authenticated','public.leah_begin_semantic_embedding_for_actor(uuid,uuid,uuid,text,text,integer)','EXECUTE') then
    raise exception 'authenticated can call internal embedding admission RPC';
  end if;
  if has_function_privilege('authenticated','public.leah_finalize_semantic_embedding_for_task(uuid,uuid,uuid,text,text,integer)','EXECUTE') then
    raise exception 'authenticated can call task embedding settlement RPC';
  end if;
end $$;

-- Prepare a canonical vector literal without a fake hash/deterministic embedding algorithm.
insert into mr8a_state(key,payload)
select 'vector',jsonb_build_object('literal','[' || string_agg('0.001',',') || ']')
from generate_series(1,1536);

insert into public.leah_semantic_memory(
  id,workspace_id,project_id,source_ref,chunk,status,memory_kind,importance_score,confidence_score
) values
  ('e8a30000-0000-4000-8000-000000000001','e8a10000-0000-4000-8000-000000000001','e8a20000-0000-4000-8000-000000000001','fixture:one','The first durable semantic memory.','pending','semantic',0.8,0.9),
  ('e8a30000-0000-4000-8000-000000000002','e8a10000-0000-4000-8000-000000000001','e8a20000-0000-4000-8000-000000000001','fixture:two','The second durable semantic memory.','pending','fact',0.7,0.8),
  ('e8a30000-0000-4000-8000-000000000003','e8a10000-0000-4000-8000-000000000002','e8a20000-0000-4000-8000-000000000002','fixture:foreign','Foreign workspace memory.','pending','semantic',0.5,0.5);

-- A metadata-only fake embedded claim is structurally impossible.
do $$
begin
  begin
    update public.leah_semantic_memory
    set status='embedded',provider='fake',embedding_model='fake',embedding_dimensions=1536,
        embedding_content_hash=repeat('a',64),embedded_at=clock_timestamp()
    where id='e8a30000-0000-4000-8000-000000000001';
    raise exception 'fake embedded=true succeeded';
  exception when others then
    if sqlerrm='fake embedded=true succeeded' then raise; end if;
  end;
end $$;

-- Begin creates durable in-flight evidence BEFORE any vector is accepted.
insert into mr8a_state(key,payload)
select 'begin_one',public.leah_begin_semantic_embedding_for_actor(
  'e8a10000-0000-4000-8000-000000000001','e8a00000-0000-4000-8000-000000000001',
  'e8a30000-0000-4000-8000-000000000001','openai','text-embedding-3-small',1536
);

do $$
declare b jsonb; _status text; _attempt text; _vector extensions.vector;
begin
  select payload into b from mr8a_state where key='begin_one';
  select status,embedding_attempt_id::text,embedding into _status,_attempt,_vector
  from public.leah_semantic_memory where id='e8a30000-0000-4000-8000-000000000001';
  if _status <> 'embedding' or _attempt <> b->>'attempt_id' or _vector is not null then
    raise exception 'begin did not create durable in-flight/no-vector state';
  end if;
  if not exists(select 1 from public.leah_memory_embedding_attempts
    where id=(b->>'attempt_id')::uuid and status='in_flight' and content_hash ~ '^[0-9a-f]{64}$') then
    raise exception 'durable embedding attempt missing';
  end if;
end $$;

-- Even with a real-shape vector, an in-flight attempt cannot be forged into embedded.
do $$
declare _vec text;
begin
  select payload->>'literal' into _vec from mr8a_state where key='vector';
  begin
    update public.leah_semantic_memory
    set status='embedded',embedding=_vec::extensions.vector(1536),embedded_at=clock_timestamp()
    where id='e8a30000-0000-4000-8000-000000000001';
    raise exception 'in-flight attempt forged embedded truth';
  exception when others then
    if sqlerrm='in-flight attempt forged embedded truth' then raise; end if;
  end;
end $$;

-- Canonical finalizer atomically settles attempt + vector truth.
do $$
declare b jsonb; _vec text; r jsonb;
begin
  select payload into b from mr8a_state where key='begin_one';
  select payload->>'literal' into _vec from mr8a_state where key='vector';
  r := public.leah_finalize_semantic_embedding_for_actor(
    'e8a10000-0000-4000-8000-000000000001','e8a00000-0000-4000-8000-000000000001',
    (b->>'attempt_id')::uuid,_vec,'mr8a-provider-request-1',12
  );
  if r->>'status' <> 'embedded' then raise exception 'canonical actor finalizer did not embed'; end if;
  if not exists(select 1 from public.leah_semantic_memory
    where id='e8a30000-0000-4000-8000-000000000001' and status='embedded'
      and embedding is not null and extensions.vector_dims(embedding)=1536
      and embedding_model='text-embedding-3-small' and embedding_ref is null) then
    raise exception 'real vector materialization truth mismatch';
  end if;
  if not exists(select 1 from public.leah_memory_embedding_attempts
    where id=(b->>'attempt_id')::uuid and status='succeeded' and completed_at is not null) then
    raise exception 'successful attempt settlement missing';
  end if;
end $$;

-- Embed second source for retrieval/dream proof.
insert into mr8a_state(key,payload)
select 'begin_two',public.leah_begin_semantic_embedding_for_actor(
  'e8a10000-0000-4000-8000-000000000001','e8a00000-0000-4000-8000-000000000001',
  'e8a30000-0000-4000-8000-000000000002','openai','text-embedding-3-small',1536
);

do $$
declare b jsonb; _vec text;
begin
  select payload into b from mr8a_state where key='begin_two';
  select payload->>'literal' into _vec from mr8a_state where key='vector';
  perform public.leah_finalize_semantic_embedding_for_actor(
    'e8a10000-0000-4000-8000-000000000001','e8a00000-0000-4000-8000-000000000001',
    (b->>'attempt_id')::uuid,_vec,'mr8a-provider-request-2',14
  );
end $$;

-- Real vector retrieval is tenant/project scoped and increments durable access truth.
do $$
declare _vec text; r jsonb; before_count bigint; after_count bigint;
begin
  select payload->>'literal' into _vec from mr8a_state where key='vector';
  select access_count into before_count from public.leah_semantic_memory where id='e8a30000-0000-4000-8000-000000000001';
  r := public.leah_recall_semantic_for_actor(
    'e8a10000-0000-4000-8000-000000000001','e8a00000-0000-4000-8000-000000000001',
    'e8a20000-0000-4000-8000-000000000001',_vec,10,0.1
  );
  if jsonb_array_length(r) < 2 then raise exception 'semantic vector retrieval returned too few memories'; end if;
  if not exists(select 1 from jsonb_array_elements(r) x where x->>'id'='e8a30000-0000-4000-8000-000000000001') then
    raise exception 'expected semantic memory missing from retrieval';
  end if;
  select access_count into after_count from public.leah_semantic_memory where id='e8a30000-0000-4000-8000-000000000001';
  if after_count <= before_count then raise exception 'retrieval access count was not persisted'; end if;
end $$;

-- Cross-workspace actor spoofing is denied before retrieval.
do $$
declare _vec text;
begin
  select payload->>'literal' into _vec from mr8a_state where key='vector';
  begin
    perform public.leah_recall_semantic_for_actor(
      'e8a10000-0000-4000-8000-000000000002','e8a00000-0000-4000-8000-000000000001',
      'e8a20000-0000-4000-8000-000000000002',_vec,10,0.1
    );
    raise exception 'cross-workspace semantic recall succeeded';
  exception when others then
    if sqlerrm='cross-workspace semantic recall succeeded' then raise; end if;
  end;
end $$;

-- Prepare real task lease for dream materialization and task-bound retrieval.
insert into public.leah_executions(id,workspace_id,project_id,requested_by,status,idempotency_key,input)
values ('e8a40000-0000-4000-8000-000000000001','e8a10000-0000-4000-8000-000000000001',
  'e8a20000-0000-4000-8000-000000000001','e8a00000-0000-4000-8000-000000000001','queued','mr8a-dream','{}');
insert into mr8a_state(key,payload)
values ('task',public.leah_enqueue_task(
  'e8a40000-0000-4000-8000-000000000001',9999,'{"name":"mr8a-dream"}'::jsonb,
  'memory',null,null,'{}'::uuid[],3
));
insert into mr8a_state(key,payload)
values ('claim',public.leah_claim_next_task('mr8a-worker',120));

do $$
declare c jsonb;
begin
  select payload into c from mr8a_state where key='claim';
  if c is null or c->'input'->>'name' <> 'mr8a-dream' or c->>'lease_token' is null then
    raise exception 'MR8A task lease claim failed';
  end if;
end $$;

-- Dream memory requires same-project real embedded source set and starts pending.
insert into mr8a_state(key,payload)
select 'dream',public.leah_create_dream_memory_for_task(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,
  array['e8a30000-0000-4000-8000-000000000001'::uuid,'e8a30000-0000-4000-8000-000000000002'::uuid],
  'dream:mr8a','Consolidated durable dream memory from two proven semantic memories.',null
)
from mr8a_state c where c.key='claim';

do $$
declare d jsonb;
begin
  select payload into d from mr8a_state where key='dream';
  if d->>'status' <> 'pending' or d->>'memory_kind' <> 'dream' then raise exception 'dream memory was not created pending'; end if;
  if (d->'metadata'->>'dream_source_count')::integer <> 2 then raise exception 'dream provenance missing'; end if;
end $$;

-- Dream cannot claim embedded until a real task-bound attempt is settled.
insert into mr8a_state(key,payload)
select 'dream_begin',public.leah_begin_semantic_embedding_for_task(
  (c.payload->>'id')::uuid,(c.payload->>'lease_token')::uuid,(d.payload->>'id')::uuid,
  'openai','text-embedding-3-small',1536
)
from mr8a_state c cross join mr8a_state d
where c.key='claim' and d.key='dream';

do $$
declare c jsonb; b jsonb; _vec text; r jsonb;
begin
  select payload into c from mr8a_state where key='claim';
  select payload into b from mr8a_state where key='dream_begin';
  select payload->>'literal' into _vec from mr8a_state where key='vector';
  r := public.leah_finalize_semantic_embedding_for_task(
    (c->>'id')::uuid,(c->>'lease_token')::uuid,(b->>'attempt_id')::uuid,
    _vec,'mr8a-dream-provider-request',18
  );
  if r->>'status' <> 'embedded' then raise exception 'dream vector finalization failed'; end if;
end $$;

-- Legacy semantic.mark can no longer fabricate embedded=true.
do $$
declare c jsonb; sid uuid;
begin
  select payload into c from mr8a_state where key='claim';
  insert into public.leah_semantic_memory(workspace_id,project_id,source_ref,chunk,status)
  values ('e8a10000-0000-4000-8000-000000000001','e8a20000-0000-4000-8000-000000000001',
    'legacy-mark-test','must stay pending','pending') returning id into sid;
  begin
    perform public.leah_mark_semantic_for_task(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,sid,'embedded','fake','fake','fake',null
    );
    raise exception 'legacy semantic.mark fabricated embedded=true';
  exception when others then
    if sqlerrm='legacy semantic.mark fabricated embedded=true' then raise; end if;
  end;
end $$;

-- Finish lease, then prove stale worker cannot admit a NEW embedding side effect.
do $$
declare c jsonb; sid uuid;
begin
  select payload into c from mr8a_state where key='claim';
  perform public.leah_finish_task((c->>'id')::uuid,(c->>'lease_token')::uuid,'succeeded','{}'::jsonb,null,0);
  insert into public.leah_semantic_memory(workspace_id,project_id,source_ref,chunk,status)
  values ('e8a10000-0000-4000-8000-000000000001','e8a20000-0000-4000-8000-000000000001',
    'stale-lease-test','stale worker must not dispatch embedding','pending') returning id into sid;
  begin
    perform public.leah_begin_semantic_embedding_for_task(
      (c->>'id')::uuid,(c->>'lease_token')::uuid,sid,'openai','text-embedding-3-small',1536
    );
    raise exception 'stale task lease admitted new embedding';
  exception when others then
    if sqlerrm='stale task lease admitted new embedding' then raise; end if;
  end;
end $$;

-- Forgetting tombstones content/vector and immediately removes retrieval eligibility.
do $$
declare _vec text; r jsonb;
begin
  perform public.leah_forget_semantic_for_actor(
    'e8a10000-0000-4000-8000-000000000001','e8a00000-0000-4000-8000-000000000001',
    'e8a30000-0000-4000-8000-000000000001','mr8a-test-forget'
  );
  if not exists(select 1 from public.leah_semantic_memory
    where id='e8a30000-0000-4000-8000-000000000001' and status='forgotten'
      and chunk='' and embedding is null and forgotten_at is not null) then
    raise exception 'forget did not tombstone memory';
  end if;
  select payload->>'literal' into _vec from mr8a_state where key='vector';
  r := public.leah_recall_semantic_for_actor(
    'e8a10000-0000-4000-8000-000000000001','e8a00000-0000-4000-8000-000000000001',
    'e8a20000-0000-4000-8000-000000000001',_vec,50,-1
  );
  if exists(select 1 from jsonb_array_elements(r) x where x->>'id'='e8a30000-0000-4000-8000-000000000001') then
    raise exception 'forgotten memory remained retrievable';
  end if;
end $$;

-- Expiration is durable forgetting-by-TTL, not just a query filter.
insert into public.leah_semantic_memory(
  id,workspace_id,project_id,source_ref,chunk,status,memory_kind,expires_at
) values (
  'e8a30000-0000-4000-8000-000000000004','e8a10000-0000-4000-8000-000000000001',
  'e8a20000-0000-4000-8000-000000000001','ttl:expired','expire me','pending','semantic',clock_timestamp()-interval '1 second'
);

do $$
declare n integer;
begin
  n := public.leah_expire_semantic_memories(500);
  if n < 1 then raise exception 'expiry sweep changed no rows'; end if;
  if not exists(select 1 from public.leah_semantic_memory
    where id='e8a30000-0000-4000-8000-000000000004' and status='expired' and chunk='' and embedding is null) then
    raise exception 'expired memory was not tombstoned';
  end if;
end $$;

rollback;
\echo 'MR8A SEMANTIC / DREAM MEMORY CONTRACT: PASS'
