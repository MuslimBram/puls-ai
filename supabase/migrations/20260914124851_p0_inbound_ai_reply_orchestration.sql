-- ============================================================================
-- HAPI 4 P0 — Inbound -> AI reply -> outbound orchestration
--
-- Additive only. No drops, no column rewrites, no data rewrites.
--
-- Design:
--   inbound webhook/poller writes inbox_messages (unchanged)
--     -> AFTER INSERT trigger enqueues ai_reply_jobs  (no network I/O in the
--        trigger, so a broken orchestrator can never fail an inbound insert)
--     -> pg_cron drains the queue through the canonical `inbound-ai-reply`
--        edge function, which is the ONLY orchestrator for every channel.
--
-- Loop prevention is structural: the trigger fires only for
-- direction = 'inbound', and every outbound row written by the send-*
-- functions is direction = 'outbound'.
-- ============================================================================

-- ── 1. Thread-level auto-reply override ─────────────────────────────────────
-- NULL = inherit the workspace master switch. TRUE = force on. FALSE = force off.
--
-- conversation_threads.is_auto_reply_enabled already exists but its column
-- default is FALSE, so a stored FALSE cannot be distinguished from "never
-- configured". A nullable override is therefore added rather than reusing it;
-- the legacy column is left untouched and is superseded by this one.
alter table public.conversation_threads
  add column if not exists ai_auto_reply_override boolean;

comment on column public.conversation_threads.ai_auto_reply_override is
  'Per-thread auto-reply decision. NULL inherits ai_agent_configs.auto_reply_enabled for the workspace; TRUE forces on; FALSE forces off (e.g. a human has taken the thread over). Supersedes is_auto_reply_enabled.';

-- ── 2. Job queue ────────────────────────────────────────────────────────────
create table if not exists public.ai_reply_jobs (
  id                         uuid primary key default gen_random_uuid(),
  -- One job per inbound message. This UNIQUE is the primary idempotency
  -- guarantee: the same inbound event can never produce two replies.
  inbox_message_id           uuid not null unique
                               references public.inbox_messages(id) on delete cascade,
  workspace_id               uuid not null,
  user_id                    uuid,
  channel_id                 uuid,
  channel_type               text not null,
  thread_id                  uuid,

  status                     text not null default 'pending',
  skip_reason                text,
  attempts                   integer not null default 0,
  max_attempts               integer not null default 3,
  next_attempt_at            timestamptz not null default now(),
  locked_at                  timestamptz,
  last_error                 text,

  -- Audit linkage (no parallel ledger: these are foreign references into the
  -- ledgers that already exist).
  ai_usage_request_id        uuid,
  outbound_inbox_message_id  uuid,
  provider_message_id        text,
  dispatch_id                uuid not null default gen_random_uuid(),

  completed_at               timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint ai_reply_jobs_status_chk check (
    status in ('pending','processing','succeeded','skipped','failed')
  ),
  constraint ai_reply_jobs_attempts_chk check (
    attempts >= 0 and max_attempts between 1 and 10
  )
);

create index if not exists ai_reply_jobs_due_idx
  on public.ai_reply_jobs (next_attempt_at)
  where status = 'pending';

create index if not exists ai_reply_jobs_ws_created_idx
  on public.ai_reply_jobs (workspace_id, created_at desc);

create unique index if not exists ai_reply_jobs_dispatch_id_idx
  on public.ai_reply_jobs (dispatch_id);

alter table public.ai_reply_jobs enable row level security;

-- Workspace members may read their own jobs. Nobody writes through RLS; every
-- mutation goes through the SECURITY DEFINER functions below.
drop policy if exists ai_reply_jobs_select_members on public.ai_reply_jobs;
create policy ai_reply_jobs_select_members on public.ai_reply_jobs
  for select to authenticated
  using (public.is_workspace_member((select auth.uid()), workspace_id));

revoke insert, update, delete on public.ai_reply_jobs from authenticated, anon;

-- ── 3. Outbound dispatch claims ─────────────────────────────────────────────
-- Replay protection + audit trail for the trusted internal outbound route.
-- Claimed BEFORE the provider call, so a retried dispatch is rejected even if
-- the first attempt died after the provider accepted the message.
create table if not exists public.outbound_dispatch_claims (
  id                    uuid primary key default gen_random_uuid(),
  dispatch_id           uuid not null unique,
  workspace_id          uuid not null,
  channel_id            uuid,
  channel_type          text not null,
  inbox_message_id      uuid,
  actor                 text not null,
  status                text not null default 'claimed',
  provider_message_id   text,
  error_code            text,
  created_at            timestamptz not null default now(),
  completed_at          timestamptz,
  constraint outbound_dispatch_claims_status_chk check (
    status in ('claimed','sent','failed')
  )
);

create index if not exists outbound_dispatch_claims_ws_idx
  on public.outbound_dispatch_claims (workspace_id, created_at desc);

alter table public.outbound_dispatch_claims enable row level security;

drop policy if exists outbound_dispatch_claims_select_members on public.outbound_dispatch_claims;
create policy outbound_dispatch_claims_select_members on public.outbound_dispatch_claims
  for select to authenticated
  using (public.is_workspace_member((select auth.uid()), workspace_id));

revoke insert, update, delete on public.outbound_dispatch_claims from authenticated, anon;

-- ── 4. Eligibility ──────────────────────────────────────────────────────────
-- Consumes, in order of authority:
--   1. ai_agent_configs.auto_reply_enabled            (workspace master)
--   2. conversation_threads.ai_auto_reply_override    (thread)
--   3. channels.is_enabled + settings.ai_auto_reply_enabled (channel)
--
-- The workspace master must be present AND true. The column default is TRUE,
-- so a missing row is deliberately NOT treated as enabled: an operator must
-- opt in before Pulse AI ever answers a customer on its own.
create or replace function public.ai_reply_eligibility(
  _workspace_id uuid,
  _channel_id   uuid,
  _thread_id    uuid,
  _channel_type text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  _master   boolean;
  _override boolean;
  _ch       public.channels%rowtype;
  _ch_pref  boolean;
begin
  if _workspace_id is null then
    return jsonb_build_object('eligible', false, 'reason', 'workspace_missing');
  end if;

  if _channel_type is null or _channel_type not in
     ('whatsapp','telegram','email','website_chat') then
    return jsonb_build_object('eligible', false, 'reason', 'channel_type_unsupported');
  end if;

  select auto_reply_enabled into _master
  from public.ai_agent_configs
  where workspace_id = _workspace_id
  limit 1;

  if _master is null then
    return jsonb_build_object('eligible', false, 'reason', 'agent_config_missing');
  end if;
  if _master is not true then
    return jsonb_build_object('eligible', false, 'reason', 'workspace_auto_reply_disabled');
  end if;

  if _thread_id is not null then
    select ai_auto_reply_override into _override
    from public.conversation_threads
    where id = _thread_id and workspace_id = _workspace_id;

    if _override is false then
      return jsonb_build_object('eligible', false, 'reason', 'thread_auto_reply_disabled');
    end if;
  end if;

  if _channel_id is not null then
    select * into _ch from public.channels
    where id = _channel_id and workspace_id = _workspace_id;

    if not found then
      return jsonb_build_object('eligible', false, 'reason', 'channel_not_in_workspace');
    end if;
    if _ch.is_enabled is not true then
      return jsonb_build_object('eligible', false, 'reason', 'channel_disabled');
    end if;

    begin
      _ch_pref := (_ch.settings ->> 'ai_auto_reply_enabled')::boolean;
    exception when others then
      _ch_pref := null;
    end;

    if _ch_pref is false then
      return jsonb_build_object('eligible', false, 'reason', 'channel_auto_reply_disabled');
    end if;
  end if;

  return jsonb_build_object('eligible', true, 'reason', 'ok');
end;
$$;

revoke all on function public.ai_reply_eligibility(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.ai_reply_eligibility(uuid, uuid, uuid, text) to authenticated;

-- ── 5. Enqueue trigger ──────────────────────────────────────────────────────
-- Deliberately cannot fail the inbound insert: the whole point of the queue is
-- that the customer's message is durably stored before anything AI-shaped runs.
create or replace function public.enqueue_ai_reply_job()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.direction is distinct from 'inbound' then
    return NEW;
  end if;
  if NEW.workspace_id is null then
    return NEW;
  end if;
  if coalesce(NEW.channel_type, '') not in
     ('whatsapp','telegram','email','website_chat') then
    return NEW;
  end if;
  -- An AI reply this system itself produced must never re-enter as work.
  if NEW.metadata ? 'ai_reply_job_id' then
    return NEW;
  end if;

  begin
    insert into public.ai_reply_jobs (
      inbox_message_id, workspace_id, user_id, channel_id, channel_type, thread_id
    ) values (
      NEW.id, NEW.workspace_id, NEW.user_id, NEW.channel_id, NEW.channel_type, NEW.thread_id
    )
    on conflict (inbox_message_id) do nothing;
  exception when others then
    -- Never block ingestion on queueing.
    raise warning '[enqueue_ai_reply_job] skipped for % : %', NEW.id, sqlerrm;
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_enqueue_ai_reply_job on public.inbox_messages;
create trigger trg_enqueue_ai_reply_job
  after insert on public.inbox_messages
  for each row execute function public.enqueue_ai_reply_job();

-- ── 6. Claim / complete ─────────────────────────────────────────────────────
create or replace function public.ai_reply_claim_jobs(_limit integer default 5)
returns setof public.ai_reply_jobs
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  with due as (
    select id from public.ai_reply_jobs
    where status = 'pending' and next_attempt_at <= now()
    order by next_attempt_at
    limit greatest(1, least(coalesce(_limit, 5), 25))
    for update skip locked
  )
  update public.ai_reply_jobs j
     set status      = 'processing',
         attempts    = j.attempts + 1,
         locked_at   = now(),
         updated_at  = now()
    from due
   where j.id = due.id
  returning j.*;
end;
$$;

revoke all on function public.ai_reply_claim_jobs(integer) from public, anon, authenticated;

-- Claim one specific job, for "run this one now instead of waiting for the next
-- cron tick". Deliberately limited to jobs that are still pending: replaying a
-- succeeded job would send a second message to a real customer, and a failed job
-- has already spent its dispatch claim, so both need an explicit operator
-- decision rather than an endpoint call.
create or replace function public.ai_reply_claim_job_by_message(_inbox_message_id uuid)
returns setof public.ai_reply_jobs
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  with target as (
    select id from public.ai_reply_jobs
    where inbox_message_id = _inbox_message_id
      and status = 'pending'
    for update skip locked
  )
  update public.ai_reply_jobs j
     set status     = 'processing',
         attempts   = j.attempts + 1,
         locked_at  = now(),
         updated_at = now()
    from target
   where j.id = target.id
  returning j.*;
end;
$$;

revoke all on function public.ai_reply_claim_job_by_message(uuid) from public, anon, authenticated;

create or replace function public.ai_reply_complete_job(
  _job_id                     uuid,
  _status                     text,
  _skip_reason                text default null,
  _last_error                 text default null,
  _ai_usage_request_id        uuid default null,
  _outbound_inbox_message_id  uuid default null,
  _provider_message_id        text default null
)
returns public.ai_reply_jobs
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _job public.ai_reply_jobs%rowtype;
  _final text;
begin
  select * into _job from public.ai_reply_jobs where id = _job_id for update;
  if not found then raise exception 'ai_reply_job % not found', _job_id; end if;

  if _status not in ('succeeded','skipped','failed','retry') then
    raise exception 'invalid status %', _status;
  end if;

  if _status = 'retry' then
    -- Controlled retry with exponential backoff; terminal once attempts are spent.
    if _job.attempts >= _job.max_attempts then
      _final := 'failed';
    else
      _final := 'pending';
    end if;
  else
    _final := _status;
  end if;

  update public.ai_reply_jobs set
    status       = _final,
    skip_reason  = coalesce(_skip_reason, skip_reason),
    last_error   = case when _status in ('retry','failed')
                        then left(coalesce(_last_error, last_error), 500)
                        else last_error end,
    ai_usage_request_id       = coalesce(_ai_usage_request_id, ai_usage_request_id),
    outbound_inbox_message_id = coalesce(_outbound_inbox_message_id, outbound_inbox_message_id),
    provider_message_id       = coalesce(_provider_message_id, provider_message_id),
    next_attempt_at = case when _final = 'pending'
                           then now() + make_interval(secs => least(900, 30 * power(4, _job.attempts)::int))
                           else next_attempt_at end,
    locked_at    = case when _final = 'pending' then null else locked_at end,
    completed_at = case when _final in ('succeeded','skipped','failed') then now() else null end,
    updated_at   = now()
  where id = _job_id
  returning * into _job;

  return _job;
end;
$$;

revoke all on function public.ai_reply_complete_job(uuid, text, text, text, uuid, uuid, text)
  from public, anon, authenticated;

-- Reclaim jobs whose worker died mid-flight (edge function timeout, redeploy).
create or replace function public.ai_reply_reap_stuck_jobs(_older_than interval default interval '10 minutes')
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare _n integer;
begin
  with reaped as (
    update public.ai_reply_jobs
       set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
           last_error = 'worker_lease_expired',
           next_attempt_at = now(),
           locked_at = null,
           completed_at = case when attempts >= max_attempts then now() else null end,
           updated_at = now()
     where status = 'processing'
       and locked_at < now() - _older_than
    returning 1
  )
  select count(*) into _n from reaped;
  return _n;
end;
$$;

revoke all on function public.ai_reply_reap_stuck_jobs(interval) from public, anon, authenticated;

-- ── 7. Outbound dispatch claim / settle ─────────────────────────────────────
create or replace function public.claim_outbound_dispatch(
  _dispatch_id      uuid,
  _workspace_id     uuid,
  _channel_id       uuid,
  _channel_type     text,
  _inbox_message_id uuid,
  _actor            text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare _existing public.outbound_dispatch_claims%rowtype;
begin
  insert into public.outbound_dispatch_claims (
    dispatch_id, workspace_id, channel_id, channel_type, inbox_message_id, actor
  ) values (
    _dispatch_id, _workspace_id, _channel_id, _channel_type, _inbox_message_id, _actor
  )
  on conflict (dispatch_id) do nothing;

  if found then
    return jsonb_build_object('claimed', true);
  end if;

  select * into _existing from public.outbound_dispatch_claims where dispatch_id = _dispatch_id;
  return jsonb_build_object(
    'claimed', false,
    'status', _existing.status,
    'provider_message_id', _existing.provider_message_id
  );
end;
$$;

revoke all on function public.claim_outbound_dispatch(uuid, uuid, uuid, text, uuid, text)
  from public, anon, authenticated;

create or replace function public.settle_outbound_dispatch(
  _dispatch_id         uuid,
  _status              text,
  _provider_message_id text default null,
  _error_code          text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if _status not in ('sent','failed') then
    raise exception 'invalid dispatch status %', _status;
  end if;
  update public.outbound_dispatch_claims set
    status = _status,
    provider_message_id = coalesce(_provider_message_id, provider_message_id),
    error_code = coalesce(_error_code, error_code),
    completed_at = now()
  where dispatch_id = _dispatch_id;
end;
$$;

revoke all on function public.settle_outbound_dispatch(uuid, text, text, text)
  from public, anon, authenticated;

-- A failed dispatch must be retryable: releasing the claim is the only way the
-- job's own retry can reach the provider again.
create or replace function public.release_outbound_dispatch(_dispatch_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.outbound_dispatch_claims
   where dispatch_id = _dispatch_id and status = 'claimed';
end;
$$;

revoke all on function public.release_outbound_dispatch(uuid) from public, anon, authenticated;

-- ── 8. Drain schedule ───────────────────────────────────────────────────────
-- Safe to apply before the edge function exists: net.http_post simply 404s and
-- the jobs stay pending.
select cron.unschedule('inbound-ai-reply-1min')
  where exists (select 1 from cron.job where jobname = 'inbound-ai-reply-1min');

select cron.schedule(
  'inbound-ai-reply-1min',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/inbound-ai-reply',
    body    := '{"source":"pg_cron","mode":"drain"}'::jsonb,
    params  := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
  )
  $cron$
);;
