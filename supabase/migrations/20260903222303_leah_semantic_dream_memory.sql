-- MR8A — LEAH Semantic / Dream Memory.
-- Real pgvector materialization, durable embedding attempts, retrieval/ranking,
-- expiration/forgetting, dream provenance and strict tenant/lease boundaries.
--
-- CRITICAL TRUTH RULE:
-- `status = 'embedded'` is impossible unless a real 1536-d vector exists and
-- references a matching durable embedding attempt that already succeeded.

create extension if not exists vector with schema extensions;

alter table public.leah_semantic_memory
  add column if not exists embedding extensions.vector(1536) null,
  add column if not exists embedding_model text null,
  add column if not exists embedding_dimensions integer null,
  add column if not exists embedding_content_hash text null,
  add column if not exists embedding_attempt_id uuid null,
  add column if not exists embedded_at timestamptz null,
  add column if not exists memory_kind text not null default 'semantic',
  add column if not exists importance_score numeric(5,4) not null default 0.5000,
  add column if not exists confidence_score numeric(5,4) not null default 0.5000,
  add column if not exists access_count bigint not null default 0,
  add column if not exists last_accessed_at timestamptz null,
  add column if not exists expires_at timestamptz null,
  add column if not exists forgotten_at timestamptz null,
  add column if not exists forget_reason text null;

alter table public.leah_semantic_memory
  drop constraint if exists leah_semantic_memory_status_check;

alter table public.leah_semantic_memory
  add constraint leah_semantic_memory_status_check
    check (status in ('pending','embedding','embedded','failed','expired','forgotten')),
  add constraint leah_semantic_memory_kind_check
    check (memory_kind in ('semantic','episodic','dream','preference','artifact','task','fact')),
  add constraint leah_semantic_memory_importance_check
    check (importance_score between 0 and 1),
  add constraint leah_semantic_memory_confidence_check
    check (confidence_score between 0 and 1),
  add constraint leah_semantic_memory_access_count_check
    check (access_count >= 0),
  add constraint leah_semantic_memory_embedding_dimensions_check
    check (embedding_dimensions is null or embedding_dimensions = 1536),
  add constraint leah_semantic_memory_embedding_hash_check
    check (embedding_content_hash is null or embedding_content_hash ~ '^[0-9a-f]{64}$'),
  add constraint leah_semantic_memory_id_project_workspace_key
    unique (id, project_id, workspace_id);

-- Existing MR2/MR3 rows that claimed `embedded` only through text refs are not
-- real vector materializations. Demote them deterministically; never grandfather
-- fake embedded truth into MR8A.
update public.leah_semantic_memory
set status = 'pending',
    provider = null,
    provider_ref = null,
    embedding_ref = null,
    error = jsonb_build_object(
      'code','mr8a_real_embedding_required',
      'message','Legacy metadata-only embedding claim was demoted for real vector materialization'
    ),
    updated_at = clock_timestamp()
where status = 'embedded'
  and embedding is null;

create table public.leah_memory_embedding_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  semantic_id uuid not null,
  execution_id uuid null,
  task_id uuid null,
  actor_id uuid null,
  lease_token_hash text null,
  attempt_no integer not null check (attempt_no >= 1),
  provider text not null check (length(trim(provider)) between 1 and 100),
  model text not null check (length(trim(model)) between 1 and 200),
  dimensions integer not null check (dimensions = 1536),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'in_flight'
    check (status in ('in_flight','succeeded','failed','unknown')),
  provider_request_id text null,
  error_code text null,
  latency_ms integer null check (latency_ms is null or latency_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz null,
  unique (id, workspace_id),
  unique (semantic_id, attempt_no),
  constraint leah_memory_embedding_attempt_semantic_fk
    foreign key (semantic_id, project_id, workspace_id)
    references public.leah_semantic_memory(id, project_id, workspace_id)
    on delete cascade,
  constraint leah_memory_embedding_attempt_task_fk
    foreign key (task_id, execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id)
    on delete cascade,
  constraint leah_memory_embedding_attempt_authority_ck check (
    (
      actor_id is not null
      and task_id is null
      and execution_id is null
      and lease_token_hash is null
    )
    or
    (
      actor_id is null
      and task_id is not null
      and execution_id is not null
      and lease_token_hash ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint leah_memory_embedding_attempt_completion_ck check (
    (status = 'in_flight' and completed_at is null)
    or (status <> 'in_flight' and completed_at is not null)
  )
);

create unique index leah_memory_embedding_one_inflight_uq
  on public.leah_memory_embedding_attempts(semantic_id)
  where status = 'in_flight';
create index leah_memory_embedding_attempts_workspace_idx
  on public.leah_memory_embedding_attempts(workspace_id, project_id, semantic_id, started_at desc);

alter table public.leah_memory_embedding_attempts enable row level security;
alter table public.leah_memory_embedding_attempts force row level security;
revoke all on public.leah_memory_embedding_attempts from public, anon, authenticated;
grant all on public.leah_memory_embedding_attempts to service_role;

alter table public.leah_semantic_memory
  add constraint leah_semantic_memory_embedding_attempt_fk
    foreign key (embedding_attempt_id, workspace_id)
    references public.leah_memory_embedding_attempts(id, workspace_id)
    on delete set null (embedding_attempt_id);

create index leah_semantic_memory_embedding_hnsw_idx
  on public.leah_semantic_memory
  using hnsw (embedding extensions.vector_cosine_ops)
  where status = 'embedded' and forgotten_at is null;
create index leah_semantic_memory_expiry_idx
  on public.leah_semantic_memory(expires_at)
  where expires_at is not null and status not in ('expired','forgotten');
create index leah_semantic_memory_rank_idx
  on public.leah_semantic_memory(workspace_id, project_id, status, importance_score desc, updated_at desc);

create or replace function public.leah_enforce_semantic_embedding_truth()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  _attempt public.leah_memory_embedding_attempts%rowtype;
begin
  if new.status = 'embedded' then
    if new.embedding is null then raise exception 'embedded semantic memory requires a real vector'; end if;
    if new.provider is null or length(trim(new.provider)) < 1 then raise exception 'embedded semantic memory requires provider'; end if;
    if new.embedding_model is null or length(trim(new.embedding_model)) < 1 then raise exception 'embedded semantic memory requires model'; end if;
    if new.embedding_dimensions <> 1536 then raise exception 'embedded semantic memory requires 1536 dimensions'; end if;
    if vector_dims(new.embedding) <> 1536 then raise exception 'embedded vector dimension mismatch'; end if;
    if new.embedding_content_hash is null or new.embedding_content_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'embedded semantic memory requires content hash';
    end if;
    if new.embedding_attempt_id is null then raise exception 'embedded semantic memory requires durable attempt'; end if;
    if new.embedded_at is null then raise exception 'embedded semantic memory requires embedded_at'; end if;
    if new.forgotten_at is not null then raise exception 'forgotten semantic memory cannot be embedded'; end if;
    if new.expires_at is not null and new.expires_at <= clock_timestamp() then
      raise exception 'expired semantic memory cannot be embedded';
    end if;

    select a.* into _attempt
    from public.leah_memory_embedding_attempts a
    where a.id = new.embedding_attempt_id
      and a.workspace_id = new.workspace_id
      and a.project_id = new.project_id
      and a.semantic_id = new.id
      and a.status = 'succeeded';
    if not found then raise exception 'embedded semantic memory requires a succeeded matching attempt'; end if;
    if _attempt.provider <> new.provider
       or _attempt.model <> new.embedding_model
       or _attempt.dimensions <> new.embedding_dimensions
       or _attempt.content_hash <> new.embedding_content_hash then
      raise exception 'semantic embedding evidence mismatch';
    end if;
  elsif new.status = 'embedding' then
    if new.embedding is not null then raise exception 'in-flight semantic memory cannot already contain a vector'; end if;
    if new.embedding_attempt_id is null then raise exception 'embedding semantic memory requires in-flight attempt'; end if;
    select a.* into _attempt
    from public.leah_memory_embedding_attempts a
    where a.id = new.embedding_attempt_id
      and a.workspace_id = new.workspace_id
      and a.project_id = new.project_id
      and a.semantic_id = new.id
      and a.status = 'in_flight';
    if not found then raise exception 'embedding semantic memory requires matching in-flight attempt'; end if;
  else
    if new.embedding is not null then
      raise exception 'only embedded semantic memory may retain a vector';
    end if;
  end if;

  if new.status = 'forgotten' and (new.chunk <> '' or new.forgotten_at is null) then
    raise exception 'forgotten semantic memory must be tombstoned';
  end if;
  if new.status = 'expired' and new.chunk <> '' then
    raise exception 'expired semantic memory must be tombstoned';
  end if;
  return new;
end;
$$;

drop trigger if exists leah_semantic_embedding_truth_trigger on public.leah_semantic_memory;
create trigger leah_semantic_embedding_truth_trigger
before insert or update on public.leah_semantic_memory
for each row execute function public.leah_enforce_semantic_embedding_truth();

create or replace function public.leah_begin_semantic_embedding_for_actor(
  _workspace_id uuid,
  _actor_id uuid,
  _semantic_id uuid,
  _provider text,
  _model text,
  _dimensions integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  _memory public.leah_semantic_memory%rowtype;
  _attempt public.leah_memory_embedding_attempts%rowtype;
  _attempt_no integer;
  _content_hash text;
begin
  if not public.has_workspace_role_for_user(_actor_id, _workspace_id, array['owner','admin','member']::text[]) then
    raise exception 'Forbidden: LEAH workspace access required';
  end if;
  if _provider is null or length(trim(_provider)) < 1 then raise exception 'provider is required'; end if;
  if _model is null or length(trim(_model)) < 1 then raise exception 'model is required'; end if;
  if _dimensions <> 1536 then raise exception 'MR8A requires 1536 embedding dimensions'; end if;

  select m.* into _memory
  from public.leah_semantic_memory m
  join public.leah_projects p
    on p.id=m.project_id and p.workspace_id=m.workspace_id and p.archived_at is null
  where m.id=_semantic_id
    and m.workspace_id=_workspace_id
    and m.status in ('pending','failed')
    and m.forgotten_at is null
    and (m.expires_at is null or m.expires_at > clock_timestamp())
  for update of m;
  if not found then raise exception 'Semantic memory state conflict'; end if;

  _content_hash := encode(digest(convert_to(_memory.chunk,'UTF8'),'sha256'),'hex');
  select coalesce(max(a.attempt_no),0)+1 into _attempt_no
  from public.leah_memory_embedding_attempts a
  where a.semantic_id=_memory.id;

  insert into public.leah_memory_embedding_attempts(
    workspace_id,project_id,semantic_id,actor_id,attempt_no,provider,model,dimensions,content_hash
  ) values (
    _memory.workspace_id,_memory.project_id,_memory.id,_actor_id,_attempt_no,
    trim(_provider),trim(_model),_dimensions,_content_hash
  ) returning * into _attempt;

  update public.leah_semantic_memory m
  set status='embedding', provider=trim(_provider), embedding_model=trim(_model),
      embedding_dimensions=_dimensions, embedding_content_hash=_content_hash,
      embedding_attempt_id=_attempt.id, provider_ref=null, embedding_ref=null,
      error=null, embedded_at=null, updated_at=clock_timestamp()
  where m.id=_memory.id and m.workspace_id=_memory.workspace_id;

  return jsonb_build_object(
    'attempt_id',_attempt.id,'semantic_id',_memory.id,'workspace_id',_memory.workspace_id,
    'project_id',_memory.project_id,'chunk',_memory.chunk,'provider',_attempt.provider,
    'model',_attempt.model,'dimensions',_attempt.dimensions,'content_hash',_attempt.content_hash
  );
end;
$$;

create or replace function public.leah_begin_semantic_embedding_for_task(
  _task_id uuid,
  _lease_token uuid,
  _semantic_id uuid,
  _provider text,
  _model text,
  _dimensions integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _memory public.leah_semantic_memory%rowtype;
  _attempt public.leah_memory_embedding_attempts%rowtype;
  _attempt_no integer;
  _content_hash text;
  _lease_hash text;
begin
  if _task_id is null or _lease_token is null then raise exception 'Task and lease token are required'; end if;
  if _provider is null or length(trim(_provider)) < 1 then raise exception 'provider is required'; end if;
  if _model is null or length(trim(_model)) < 1 then raise exception 'model is required'; end if;
  if _dimensions <> 1536 then raise exception 'MR8A requires 1536 embedding dimensions'; end if;

  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions e on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id and t.status='running' and t.lease_token=_lease_token
    and t.lease_expires_at > clock_timestamp() and e.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select m.* into _memory
  from public.leah_semantic_memory m
  where m.id=_semantic_id and m.workspace_id=_task.workspace_id and m.project_id=_task.project_id
    and m.status in ('pending','failed') and m.forgotten_at is null
    and (m.expires_at is null or m.expires_at > clock_timestamp())
  for update;
  if not found then raise exception 'Semantic memory state conflict'; end if;

  _content_hash := encode(digest(convert_to(_memory.chunk,'UTF8'),'sha256'),'hex');
  _lease_hash := encode(digest(convert_to(_lease_token::text,'UTF8'),'sha256'),'hex');
  select coalesce(max(a.attempt_no),0)+1 into _attempt_no
  from public.leah_memory_embedding_attempts a where a.semantic_id=_memory.id;

  insert into public.leah_memory_embedding_attempts(
    workspace_id,project_id,semantic_id,execution_id,task_id,lease_token_hash,
    attempt_no,provider,model,dimensions,content_hash
  ) values (
    _memory.workspace_id,_memory.project_id,_memory.id,_task.execution_id,_task.id,_lease_hash,
    _attempt_no,trim(_provider),trim(_model),_dimensions,_content_hash
  ) returning * into _attempt;

  update public.leah_semantic_memory m
  set status='embedding', provider=trim(_provider), embedding_model=trim(_model),
      embedding_dimensions=_dimensions, embedding_content_hash=_content_hash,
      embedding_attempt_id=_attempt.id, provider_ref=null, embedding_ref=null,
      error=null, embedded_at=null, updated_at=clock_timestamp()
  where m.id=_memory.id and m.workspace_id=_memory.workspace_id;

  return jsonb_build_object(
    'attempt_id',_attempt.id,'semantic_id',_memory.id,'workspace_id',_memory.workspace_id,
    'project_id',_memory.project_id,'chunk',_memory.chunk,'provider',_attempt.provider,
    'model',_attempt.model,'dimensions',_attempt.dimensions,'content_hash',_attempt.content_hash
  );
end;
$$;

create or replace function public.leah_finalize_semantic_embedding_for_actor(
  _workspace_id uuid,
  _actor_id uuid,
  _attempt_id uuid,
  _embedding_text text,
  _provider_request_id text,
  _latency_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  _attempt public.leah_memory_embedding_attempts%rowtype;
  _memory public.leah_semantic_memory%rowtype;
  _embedding extensions.vector(1536);
begin
  select a.* into _attempt from public.leah_memory_embedding_attempts a
  where a.id=_attempt_id and a.workspace_id=_workspace_id and a.actor_id=_actor_id
    and a.task_id is null and a.status='in_flight'
  for update;
  if not found then raise exception 'Embedding attempt state conflict'; end if;

  select m.* into _memory from public.leah_semantic_memory m
  where m.id=_attempt.semantic_id and m.workspace_id=_attempt.workspace_id
    and m.embedding_attempt_id=_attempt.id and m.status='embedding'
    and m.forgotten_at is null and (m.expires_at is null or m.expires_at > clock_timestamp())
  for update;
  if not found then raise exception 'Semantic memory state conflict'; end if;

  begin
    _embedding := _embedding_text::extensions.vector(1536);
  exception when others then
    raise exception 'Invalid embedding vector';
  end;
  if vector_dims(_embedding) <> _attempt.dimensions then raise exception 'Embedding vector dimension mismatch'; end if;

  update public.leah_memory_embedding_attempts a
  set status='succeeded', provider_request_id=nullif(trim(_provider_request_id),''),
      latency_ms=_latency_ms, completed_at=clock_timestamp()
  where a.id=_attempt.id and a.workspace_id=_attempt.workspace_id;

  update public.leah_semantic_memory m
  set status='embedded', embedding=_embedding, provider=_attempt.provider,
      embedding_model=_attempt.model, embedding_dimensions=_attempt.dimensions,
      embedding_content_hash=_attempt.content_hash, embedding_attempt_id=_attempt.id,
      provider_ref=nullif(trim(_provider_request_id),''), embedding_ref=null,
      embedded_at=clock_timestamp(), error=null, updated_at=clock_timestamp()
  where m.id=_memory.id and m.workspace_id=_memory.workspace_id;

  return jsonb_build_object('id',_memory.id,'status','embedded','provider',_attempt.provider,
    'model',_attempt.model,'dimensions',_attempt.dimensions,'attempt_id',_attempt.id);
end;
$$;

create or replace function public.leah_finalize_semantic_embedding_for_task(
  _task_id uuid,
  _lease_token uuid,
  _attempt_id uuid,
  _embedding_text text,
  _provider_request_id text,
  _latency_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  _attempt public.leah_memory_embedding_attempts%rowtype;
  _memory public.leah_semantic_memory%rowtype;
  _embedding extensions.vector(1536);
  _lease_hash text;
begin
  _lease_hash := encode(digest(convert_to(_lease_token::text,'UTF8'),'sha256'),'hex');
  select a.* into _attempt from public.leah_memory_embedding_attempts a
  where a.id=_attempt_id and a.task_id=_task_id and a.lease_token_hash=_lease_hash
    and a.status='in_flight'
  for update;
  if not found then raise exception 'Embedding attempt state conflict'; end if;

  -- Settlement preserves truth for an already-admitted side effect even if the
  -- originating task lease expired after provider dispatch. It does not authorize
  -- a new provider call; only begin() can do that and begin() requires a live lease.
  select m.* into _memory from public.leah_semantic_memory m
  where m.id=_attempt.semantic_id and m.workspace_id=_attempt.workspace_id
    and m.embedding_attempt_id=_attempt.id and m.status='embedding'
    and m.forgotten_at is null and (m.expires_at is null or m.expires_at > clock_timestamp())
  for update;
  if not found then raise exception 'Semantic memory state conflict'; end if;

  begin
    _embedding := _embedding_text::extensions.vector(1536);
  exception when others then
    raise exception 'Invalid embedding vector';
  end;
  if vector_dims(_embedding) <> _attempt.dimensions then raise exception 'Embedding vector dimension mismatch'; end if;

  update public.leah_memory_embedding_attempts a
  set status='succeeded', provider_request_id=nullif(trim(_provider_request_id),''),
      latency_ms=_latency_ms, completed_at=clock_timestamp()
  where a.id=_attempt.id and a.workspace_id=_attempt.workspace_id;

  update public.leah_semantic_memory m
  set status='embedded', embedding=_embedding, provider=_attempt.provider,
      embedding_model=_attempt.model, embedding_dimensions=_attempt.dimensions,
      embedding_content_hash=_attempt.content_hash, embedding_attempt_id=_attempt.id,
      provider_ref=nullif(trim(_provider_request_id),''), embedding_ref=null,
      embedded_at=clock_timestamp(), error=null, updated_at=clock_timestamp()
  where m.id=_memory.id and m.workspace_id=_memory.workspace_id;

  return jsonb_build_object('id',_memory.id,'status','embedded','provider',_attempt.provider,
    'model',_attempt.model,'dimensions',_attempt.dimensions,'attempt_id',_attempt.id);
end;
$$;

create or replace function public.leah_fail_semantic_embedding_for_actor(
  _workspace_id uuid,
  _actor_id uuid,
  _attempt_id uuid,
  _outcome text,
  _error_code text,
  _latency_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare _attempt public.leah_memory_embedding_attempts%rowtype; _next text;
begin
  if _outcome not in ('failed','unknown') then raise exception 'Invalid embedding failure outcome'; end if;
  select a.* into _attempt from public.leah_memory_embedding_attempts a
  where a.id=_attempt_id and a.workspace_id=_workspace_id and a.actor_id=_actor_id
    and a.task_id is null and a.status='in_flight' for update;
  if not found then raise exception 'Embedding attempt state conflict'; end if;
  _next := case when _outcome='unknown' then 'pending' else 'failed' end;
  update public.leah_memory_embedding_attempts
  set status=_outcome, error_code=left(coalesce(nullif(trim(_error_code),''),'embedding_failed'),120),
      latency_ms=_latency_ms, completed_at=clock_timestamp()
  where id=_attempt.id and workspace_id=_attempt.workspace_id;
  update public.leah_semantic_memory
  set status=_next, embedding=null, embedded_at=null,
      error=jsonb_build_object('code',left(coalesce(nullif(trim(_error_code),''),'embedding_failed'),120)),
      updated_at=clock_timestamp()
  where id=_attempt.semantic_id and workspace_id=_attempt.workspace_id
    and embedding_attempt_id=_attempt.id and status='embedding';
  return jsonb_build_object('attempt_id',_attempt.id,'status',_outcome,'memory_status',_next);
end;
$$;

create or replace function public.leah_fail_semantic_embedding_for_task(
  _task_id uuid,
  _lease_token uuid,
  _attempt_id uuid,
  _outcome text,
  _error_code text,
  _latency_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare _attempt public.leah_memory_embedding_attempts%rowtype; _next text; _lease_hash text;
begin
  if _outcome not in ('failed','unknown') then raise exception 'Invalid embedding failure outcome'; end if;
  _lease_hash := encode(digest(convert_to(_lease_token::text,'UTF8'),'sha256'),'hex');
  select a.* into _attempt from public.leah_memory_embedding_attempts a
  where a.id=_attempt_id and a.task_id=_task_id and a.lease_token_hash=_lease_hash
    and a.status='in_flight' for update;
  if not found then raise exception 'Embedding attempt state conflict'; end if;
  _next := case when _outcome='unknown' then 'pending' else 'failed' end;
  update public.leah_memory_embedding_attempts
  set status=_outcome, error_code=left(coalesce(nullif(trim(_error_code),''),'embedding_failed'),120),
      latency_ms=_latency_ms, completed_at=clock_timestamp()
  where id=_attempt.id and workspace_id=_attempt.workspace_id;
  update public.leah_semantic_memory
  set status=_next, embedding=null, embedded_at=null,
      error=jsonb_build_object('code',left(coalesce(nullif(trim(_error_code),''),'embedding_failed'),120)),
      updated_at=clock_timestamp()
  where id=_attempt.semantic_id and workspace_id=_attempt.workspace_id
    and embedding_attempt_id=_attempt.id and status='embedding';
  return jsonb_build_object('attempt_id',_attempt.id,'status',_outcome,'memory_status',_next);
end;
$$;

create or replace function public.leah_semantic_search_core(
  _workspace_id uuid,
  _project_id uuid,
  _query_embedding_text text,
  _match_count integer default 10,
  _min_similarity numeric default 0.15
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  _query extensions.vector(1536);
  _result jsonb := '[]'::jsonb;
  _ids uuid[] := '{}'::uuid[];
begin
  if _match_count < 1 or _match_count > 50 then raise exception 'Invalid match count'; end if;
  if _min_similarity < -1 or _min_similarity > 1 then raise exception 'Invalid similarity threshold'; end if;
  begin _query := _query_embedding_text::extensions.vector(1536);
  exception when others then raise exception 'Invalid query embedding vector'; end;
  if vector_dims(_query) <> 1536 then raise exception 'Query embedding dimension mismatch'; end if;

  with scored as (
    select m.id,m.source_ref,m.chunk,m.memory_kind,m.importance_score,m.confidence_score,
      m.created_at,m.updated_at,m.expires_at,
      (1 - (m.embedding <=> _query))::numeric as similarity,
      greatest(0::numeric, 1 - (extract(epoch from (clock_timestamp()-coalesce(m.last_accessed_at,m.updated_at,m.created_at))) / 2592000.0)::numeric) as recency,
      least(1::numeric, ln(1 + m.access_count::numeric) / 5) as access_signal
    from public.leah_semantic_memory m
    where m.workspace_id=_workspace_id and m.project_id=_project_id
      and m.status='embedded' and m.embedding is not null and m.forgotten_at is null
      and (m.expires_at is null or m.expires_at > clock_timestamp())
  ), ranked as (
    select s.*,
      (0.70*s.similarity + 0.12*s.importance_score + 0.08*s.confidence_score + 0.07*s.recency + 0.03*s.access_signal)::numeric as score
    from scored s where s.similarity >= _min_similarity
    order by score desc, s.updated_at desc limit _match_count
  )
  select coalesce(array_agg(r.id order by r.score desc),'{}'::uuid[]),
         coalesce(jsonb_agg(jsonb_build_object(
           'id',r.id,'source_ref',r.source_ref,'chunk',r.chunk,'memory_kind',r.memory_kind,
           'similarity',r.similarity,'score',r.score,'importance',r.importance_score,
           'confidence',r.confidence_score,'created_at',r.created_at,'expires_at',r.expires_at
         ) order by r.score desc),'[]'::jsonb)
  into _ids,_result from ranked r;

  if cardinality(_ids) > 0 then
    update public.leah_semantic_memory m
    set access_count=m.access_count+1,last_accessed_at=clock_timestamp(),updated_at=m.updated_at
    where m.id=any(_ids) and m.workspace_id=_workspace_id;
  end if;
  return _result;
end;
$$;

create or replace function public.leah_recall_semantic_for_actor(
  _workspace_id uuid,
  _actor_id uuid,
  _project_id uuid,
  _query_embedding_text text,
  _match_count integer default 10,
  _min_similarity numeric default 0.15
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.has_workspace_role_for_user(_actor_id,_workspace_id,array['owner','admin','member']::text[]) then
    raise exception 'Forbidden: LEAH workspace access required';
  end if;
  if not exists(select 1 from public.leah_projects p where p.id=_project_id and p.workspace_id=_workspace_id and p.archived_at is null) then
    raise exception 'Project not found';
  end if;
  return public.leah_semantic_search_core(_workspace_id,_project_id,_query_embedding_text,_match_count,_min_similarity);
end;
$$;

create or replace function public.leah_recall_semantic_for_task(
  _task_id uuid,
  _lease_token uuid,
  _query_embedding_text text,
  _match_count integer default 10,
  _min_similarity numeric default 0.15
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare _task public.leah_tasks%rowtype;
begin
  select t.* into _task from public.leah_tasks t
  join public.leah_executions e on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id and t.status='running' and t.lease_token=_lease_token
    and t.lease_expires_at > clock_timestamp() and e.status='running';
  if not found then raise exception 'Task lease invalid or expired'; end if;
  return public.leah_semantic_search_core(_task.workspace_id,_task.project_id,_query_embedding_text,_match_count,_min_similarity);
end;
$$;

create or replace function public.leah_create_dream_memory_for_task(
  _task_id uuid,
  _lease_token uuid,
  _source_ids uuid[],
  _source_ref text,
  _chunk text,
  _expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _source_count integer;
  _distinct_count integer;
  _importance numeric;
  _confidence numeric;
  _memory public.leah_semantic_memory%rowtype;
begin
  if _source_ids is null or cardinality(_source_ids) < 2 or cardinality(_source_ids) > 50 then
    raise exception 'Dream memory requires 2-50 source memories';
  end if;
  if _source_ref is null or length(trim(_source_ref)) < 1 or length(_source_ref) > 500 then raise exception 'source_ref is required'; end if;
  if _chunk is null or length(trim(_chunk)) < 1 or length(_chunk) > 100000 then raise exception 'chunk is required'; end if;
  if _expires_at is not null and _expires_at <= clock_timestamp() then raise exception 'expires_at must be in the future'; end if;

  select t.* into _task from public.leah_tasks t
  join public.leah_executions e on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id and t.status='running' and t.lease_token=_lease_token
    and t.lease_expires_at > clock_timestamp() and e.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select count(*),count(distinct m.id),avg(m.importance_score),avg(m.confidence_score)
  into _source_count,_distinct_count,_importance,_confidence
  from public.leah_semantic_memory m
  where m.id=any(_source_ids) and m.workspace_id=_task.workspace_id and m.project_id=_task.project_id
    and m.status='embedded' and m.embedding is not null and m.forgotten_at is null
    and (m.expires_at is null or m.expires_at > clock_timestamp());
  if _source_count <> cardinality(_source_ids) or _distinct_count <> cardinality(_source_ids) then
    raise exception 'Dream source set contains duplicate, foreign, expired or non-embedded memory';
  end if;

  insert into public.leah_semantic_memory(
    workspace_id,project_id,source_ref,chunk,status,memory_kind,importance_score,
    confidence_score,expires_at,metadata
  ) values (
    _task.workspace_id,_task.project_id,trim(_source_ref),trim(_chunk),'pending','dream',
    least(1::numeric,coalesce(_importance,0.5)+0.1),coalesce(_confidence,0.5),_expires_at,
    jsonb_build_object('dream_source_ids',to_jsonb(_source_ids),'dream_source_count',cardinality(_source_ids),
      'created_by_task_id',_task.id,'execution_id',_task.execution_id)
  ) returning * into _memory;
  return to_jsonb(_memory) - 'embedding';
end;
$$;

create or replace function public.leah_forget_semantic_for_actor(
  _workspace_id uuid,
  _actor_id uuid,
  _semantic_id uuid,
  _reason text default 'user_request'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare _memory public.leah_semantic_memory%rowtype;
begin
  if not public.has_workspace_role_for_user(_actor_id,_workspace_id,array['owner','admin']::text[]) then
    raise exception 'Forbidden: LEAH workspace admin required';
  end if;
  select * into _memory from public.leah_semantic_memory
  where id=_semantic_id and workspace_id=_workspace_id and status <> 'forgotten' for update;
  if not found then raise exception 'Semantic memory not found'; end if;
  update public.leah_memory_embedding_attempts
  set status='failed',error_code='forgotten_during_attempt',completed_at=clock_timestamp()
  where semantic_id=_memory.id and workspace_id=_memory.workspace_id and status='in_flight';
  update public.leah_semantic_memory
  set status='forgotten',chunk='',embedding=null,provider=null,provider_ref=null,embedding_ref=null,
      embedding_model=null,embedding_dimensions=null,embedding_content_hash=null,embedding_attempt_id=null,
      embedded_at=null,forgotten_at=clock_timestamp(),forget_reason=left(coalesce(nullif(trim(_reason),''),'user_request'),200),
      metadata=jsonb_build_object('forgotten',true),error=null,updated_at=clock_timestamp()
  where id=_memory.id and workspace_id=_memory.workspace_id;
  return jsonb_build_object('id',_memory.id,'status','forgotten');
end;
$$;

create or replace function public.leah_expire_semantic_memories(_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare _ids uuid[]; _count integer := 0;
begin
  if _limit < 1 or _limit > 5000 then raise exception 'Invalid expiry limit'; end if;
  select coalesce(array_agg(x.id),'{}'::uuid[]) into _ids
  from (
    select m.id from public.leah_semantic_memory m
    where m.expires_at is not null and m.expires_at <= clock_timestamp()
      and m.status not in ('expired','forgotten')
    order by m.expires_at for update skip locked limit _limit
  ) x;
  if cardinality(_ids)=0 then return 0; end if;
  update public.leah_memory_embedding_attempts
  set status='failed',error_code='memory_expired',completed_at=clock_timestamp()
  where semantic_id=any(_ids) and status='in_flight';
  update public.leah_semantic_memory
  set status='expired',chunk='',embedding=null,provider=null,provider_ref=null,embedding_ref=null,
      embedding_model=null,embedding_dimensions=null,embedding_content_hash=null,embedding_attempt_id=null,
      embedded_at=null,metadata=jsonb_build_object('expired',true),error=null,updated_at=clock_timestamp()
  where id=any(_ids);
  get diagnostics _count = row_count;
  return _count;
end;
$$;

-- Legacy MR3 function is intentionally retained only as a failure-reporting
-- compatibility path. It can never create `embedded` truth again.
create or replace function public.leah_mark_semantic_for_task(
  _task_id uuid,
  _lease_token uuid,
  _semantic_id uuid,
  _status text,
  _provider text default null,
  _provider_ref text default null,
  _embedding_ref text default null,
  _error jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare _task public.leah_tasks%rowtype; _memory public.leah_semantic_memory%rowtype;
begin
  if _status = 'embedded' then
    raise exception 'Direct embedded mark disabled by MR8A; real vector finalization is required';
  end if;
  if _status <> 'failed' then raise exception 'Invalid semantic status'; end if;
  select t.* into _task from public.leah_tasks t
  join public.leah_executions e on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id and t.status='running' and t.lease_token=_lease_token
    and t.lease_expires_at > clock_timestamp() and e.status='running' for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;
  select m.* into _memory from public.leah_semantic_memory m
  where m.id=_semantic_id and m.workspace_id=_task.workspace_id and m.project_id=_task.project_id
    and m.status in ('pending','failed') for update;
  if not found then raise exception 'Semantic memory state conflict'; end if;
  update public.leah_semantic_memory
  set status='failed',embedding=null,error=coalesce(_error,jsonb_build_object('message','Embedding failed')),
      updated_at=clock_timestamp()
  where id=_memory.id and workspace_id=_memory.workspace_id
  returning * into _memory;
  return to_jsonb(_memory) - 'embedding';
end;
$$;

-- Internal core search is never exposed to browser roles. All authority-bearing
-- entry points are service-only and independently validate actor membership or task lease.
revoke all on function public.leah_enforce_semantic_embedding_truth() from public,anon,authenticated;
revoke all on function public.leah_begin_semantic_embedding_for_actor(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.leah_begin_semantic_embedding_for_task(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.leah_finalize_semantic_embedding_for_actor(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.leah_finalize_semantic_embedding_for_task(uuid,uuid,uuid,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.leah_fail_semantic_embedding_for_actor(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.leah_fail_semantic_embedding_for_task(uuid,uuid,uuid,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.leah_semantic_search_core(uuid,uuid,text,integer,numeric) from public,anon,authenticated;
revoke all on function public.leah_recall_semantic_for_actor(uuid,uuid,uuid,text,integer,numeric) from public,anon,authenticated;
revoke all on function public.leah_recall_semantic_for_task(uuid,uuid,text,integer,numeric) from public,anon,authenticated;
revoke all on function public.leah_create_dream_memory_for_task(uuid,uuid,uuid[],text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.leah_forget_semantic_for_actor(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.leah_expire_semantic_memories(integer) from public,anon,authenticated;
revoke all on function public.leah_mark_semantic_for_task(uuid,uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;

grant execute on function public.leah_begin_semantic_embedding_for_actor(uuid,uuid,uuid,text,text,integer) to service_role;
grant execute on function public.leah_begin_semantic_embedding_for_task(uuid,uuid,uuid,text,text,integer) to service_role;
grant execute on function public.leah_finalize_semantic_embedding_for_actor(uuid,uuid,uuid,text,text,integer) to service_role;
grant execute on function public.leah_finalize_semantic_embedding_for_task(uuid,uuid,uuid,text,text,text,integer) to service_role;
grant execute on function public.leah_fail_semantic_embedding_for_actor(uuid,uuid,uuid,text,text,integer) to service_role;
grant execute on function public.leah_fail_semantic_embedding_for_task(uuid,uuid,uuid,text,text,text,integer) to service_role;
grant execute on function public.leah_semantic_search_core(uuid,uuid,text,integer,numeric) to service_role;
grant execute on function public.leah_recall_semantic_for_actor(uuid,uuid,uuid,text,integer,numeric) to service_role;
grant execute on function public.leah_recall_semantic_for_task(uuid,uuid,text,integer,numeric) to service_role;
grant execute on function public.leah_create_dream_memory_for_task(uuid,uuid,uuid[],text,text,timestamptz) to service_role;
grant execute on function public.leah_forget_semantic_for_actor(uuid,uuid,uuid,text) to service_role;
grant execute on function public.leah_expire_semantic_memories(integer) to service_role;
grant execute on function public.leah_mark_semantic_for_task(uuid,uuid,uuid,text,text,text,text,jsonb) to service_role;
;
