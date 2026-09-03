begin;

-- ============================================================
-- BUSINESS INTELLIGENCE FINAL INTEGRATION CLOSURE
-- Atomic scan admission, execution fencing, canonical snapshots,
-- and removal of legacy raw-scan -> AI/post-processing paths.
-- ============================================================

-- A monotonic fence distinguishes a recovered scan execution from every prior
-- worker. Timestamp-only stale recovery is insufficient because an old worker
-- can resume after a new claimant has taken ownership.
alter table public.business_scan_history
  add column if not exists execution_claim_version bigint not null default 0;

alter table public.business_scan_pages
  add column if not exists execution_claim_version bigint not null default 0;

drop function if exists public.resolve_business_scan_authority(uuid,uuid,uuid);

create function public.resolve_business_scan_authority(
  p_scan_history_id uuid,
  p_source_id uuid,
  p_source_scan_id uuid
)
returns table (
  workspace_id uuid,
  business_id uuid,
  scanned_url text,
  triggered_by uuid,
  execution_claim_version bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
  v_business_id uuid;
  v_scanned_url text;
  v_triggered_by uuid;
  v_status text;
  v_claimed_at timestamptz;
  v_claim_version bigint;
  v_claim_count integer := 0;
  v_lock_key bigint;
begin
  if v_user_id is null then
    raise exception 'business scan authentication required' using errcode = '42501';
  end if;

  select sh.workspace_id, sh.business_id, sh.scanned_url, sh.triggered_by,
         sh.status, sh.execution_claimed_at, sh.execution_claim_version
    into v_workspace_id, v_business_id, v_scanned_url, v_triggered_by,
         v_status, v_claimed_at, v_claim_version
  from public.business_scan_history sh
  where sh.id = p_scan_history_id;

  if v_workspace_id is null or v_business_id is null then
    raise exception 'business scan authority denied' using errcode = '42501';
  end if;
  if not public.has_workspace_access(v_workspace_id) then
    raise exception 'business scan authority denied' using errcode = '42501';
  end if;
  if v_triggered_by is distinct from v_user_id
     and not public.has_workspace_role(v_workspace_id, array['owner','admin']::text[]) then
    raise exception 'business scan authority denied' using errcode = '42501';
  end if;
  if v_status not in ('pending','failed','scanning') then
    raise exception 'business scan is not executable from its current state';
  end if;
  if v_status = 'scanning'
     and v_claimed_at is not null
     and v_claimed_at > pg_catalog.now() - interval '5 minutes' then
    raise exception 'business scan is already actively claimed' using errcode = '55P03';
  end if;

  if not exists (
    select 1 from public.business_profiles bp
    where bp.id=v_business_id and bp.workspace_id=v_workspace_id
  ) then
    raise exception 'business scan workspace/business mismatch';
  end if;
  if not exists (
    select 1 from public.scan_sources ss
    where ss.id=p_source_id and ss.workspace_id=v_workspace_id and ss.business_id=v_business_id
  ) then
    raise exception 'business scan source authority denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.source_scans sscan
    where sscan.id=p_source_scan_id
      and sscan.source_id=p_source_id
      and sscan.workspace_id=v_workspace_id
      and sscan.business_id=v_business_id
  ) then
    raise exception 'business scan source-scan authority denied' using errcode = '42501';
  end if;

  v_lock_key := pg_catalog.hashtextextended(
    v_workspace_id::text || '|' || v_business_id::text || '|' || pg_catalog.lower(pg_catalog.btrim(v_scanned_url)), 0
  );
  perform pg_catalog.pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1 from public.business_scan_history other
    where other.id <> p_scan_history_id
      and other.workspace_id=v_workspace_id
      and other.business_id=v_business_id
      and pg_catalog.lower(pg_catalog.btrim(other.scanned_url))=pg_catalog.lower(pg_catalog.btrim(v_scanned_url))
      and other.status='scanning'
      and other.execution_claimed_at is not null
      and other.execution_claimed_at > pg_catalog.now() - interval '5 minutes'
  ) then
    raise exception 'business scan already active for this business URL' using errcode = '55P03';
  end if;

  update public.business_scan_history sh
  set status='scanning',
      scan_phase='authorized',
      execution_claimed_at=pg_catalog.now(),
      execution_claim_version=sh.execution_claim_version + 1,
      error_message=null
  where sh.id=p_scan_history_id
    and sh.workspace_id=v_workspace_id
    and sh.business_id=v_business_id
    and (
      sh.status in ('pending','failed')
      or (sh.status='scanning' and (
        sh.execution_claimed_at is null
        or sh.execution_claimed_at <= pg_catalog.now() - interval '5 minutes'
      ))
    )
  returning sh.execution_claim_version into v_claim_version;

  get diagnostics v_claim_count = row_count;
  if v_claim_count <> 1 then
    raise exception 'business scan execution claim lost' using errcode = '55P03';
  end if;

  return query select v_workspace_id, v_business_id, v_scanned_url, v_triggered_by, v_claim_version;
end
$$;

revoke all on function public.resolve_business_scan_authority(uuid,uuid,uuid)
  from public, anon, service_role;
grant execute on function public.resolve_business_scan_authority(uuid,uuid,uuid)
  to authenticated;

-- The page row itself is a side effect of one exact execution claim. Old
-- workers may neither insert nor overwrite page evidence after a reclaim.
create or replace function public.enforce_business_scan_page_execution_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_version bigint;
  v_status text;
begin
  select sh.execution_claim_version, sh.status
    into v_claim_version, v_status
  from public.business_scan_history sh
  where sh.id=new.scan_history_id
    and sh.workspace_id=new.workspace_id
    and sh.business_id=new.business_id;

  if v_claim_version is null then
    raise exception 'business scan page execution claim lost' using errcode='55P03';
  end if;

  if v_status <> 'scanning' or new.execution_claim_version <> v_claim_version then
    raise exception 'business scan page execution claim lost' using errcode='55P03';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_business_scan_page_execution_claim()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_0_business_scan_page_execution_claim on public.business_scan_pages;
create trigger trg_0_business_scan_page_execution_claim
before insert or update on public.business_scan_pages
for each row execute function public.enforce_business_scan_page_execution_claim();

-- A successful new claim invalidates page side effects from all older claims.
create or replace function public.clear_business_scan_pages_on_new_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.execution_claim_version > old.execution_claim_version then
    delete from public.business_scan_pages p
    where p.scan_history_id=new.id
      and p.execution_claim_version <> new.execution_claim_version;
  end if;
  return new;
end
$$;

revoke all on function public.clear_business_scan_pages_on_new_claim()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_b_clear_business_scan_pages_on_new_claim on public.business_scan_history;
create trigger trg_b_clear_business_scan_pages_on_new_claim
after update of execution_claim_version on public.business_scan_history
for each row execute function public.clear_business_scan_pages_on_new_claim();

-- Provenance must come from the CURRENT execution, not merely from an older
-- approved page left on the same scan row.
create or replace function public.enforce_business_knowledge_scan_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_url text;
begin
  if new.scan_history_id is null then return new; end if;

  if new.item_type='page' then
    v_source_url := nullif(pg_catalog.btrim(coalesce(new.canonical_url,'')), '');
  elsif new.item_type in ('media','contact','link') then
    v_source_url := nullif(pg_catalog.btrim(coalesce(new.structured_data->>'source_url','')), '');
  elsif new.item_type in ('product','service','post','faq','review','comment','business_fact') then
    v_source_url := nullif(pg_catalog.btrim(coalesce(new.structured_data->>'source_url',new.canonical_url,'')), '');
  else
    return new;
  end if;

  if v_source_url is null then return null; end if;

  if not exists (
    select 1
    from public.business_scan_pages p
    join public.business_scan_history sh on sh.id=p.scan_history_id
    where p.scan_history_id=new.scan_history_id
      and p.workspace_id=new.workspace_id
      and p.business_id=new.business_id
      and p.is_knowledge_eligible=true
      and p.execution_claim_version=sh.execution_claim_version
      and pg_catalog.rtrim(pg_catalog.lower(pg_catalog.btrim(p.canonical_url)),'/')
          = pg_catalog.rtrim(pg_catalog.lower(v_source_url),'/')
  ) then
    return null;
  end if;
  return new;
end
$$;

revoke all on function public.enforce_business_knowledge_scan_provenance()
  from public, anon, authenticated, service_role;

-- Scan request admission is one server-side transaction. Browser code no
-- longer creates history/source/source-scan separately, so a mid-flight error
-- cannot leave a partial orphan topology.
create or replace function public.create_business_scan_request(
  p_business_id uuid,
  p_scanned_url text
)
returns table (
  scan_history_id uuid,
  source_id uuid,
  source_scan_id uuid,
  workspace_id uuid,
  business_id uuid,
  scanned_url text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
  v_url text := pg_catalog.btrim(p_scanned_url);
  v_source_id uuid;
  v_scan_history_id uuid;
  v_source_scan_id uuid;
begin
  if v_user_id is null then raise exception 'business scan authentication required' using errcode='42501'; end if;
  if v_url is null or v_url='' then raise exception 'business scan URL required'; end if;

  select bp.workspace_id into v_workspace_id
  from public.business_profiles bp
  where bp.id=p_business_id;

  if v_workspace_id is null
     or not public.has_workspace_role(v_workspace_id,array['owner','admin','member']::text[]) then
    raise exception 'business scan authority denied' using errcode='42501';
  end if;

  select ss.id into v_source_id
  from public.scan_sources ss
  where ss.workspace_id=v_workspace_id
    and ss.business_id=p_business_id
    and pg_catalog.lower(pg_catalog.btrim(ss.url_or_identifier))=pg_catalog.lower(v_url)
  order by ss.created_at
  limit 1;

  if v_source_id is null then
    insert into public.scan_sources(
      user_id,workspace_id,business_id,platform,source_type,url_or_identifier,label,is_active,scan_status
    ) values (
      v_user_id,v_workspace_id,p_business_id,'web','website',v_url,v_url,true,'pending'
    ) returning id into v_source_id;
  else
    update public.scan_sources
    set scan_status='pending',business_id=p_business_id,updated_at=pg_catalog.now()
    where id=v_source_id and workspace_id=v_workspace_id and business_id=p_business_id;
  end if;

  insert into public.business_scan_history(
    business_id,workspace_id,triggered_by,scanned_url,status,scan_phase,error_message
  ) values (
    p_business_id,v_workspace_id,v_user_id,v_url,'pending','queued',null
  ) returning id into v_scan_history_id;

  insert into public.source_scans(
    source_id,business_id,user_id,workspace_id,status,scan_phase,items_found,insights_found,pages_scanned,error_message
  ) values (
    v_source_id,p_business_id,v_user_id,v_workspace_id,'pending','queued',0,0,0,null
  ) returning id into v_source_scan_id;

  return query select v_scan_history_id,v_source_id,v_source_scan_id,v_workspace_id,p_business_id,v_url;
end
$$;

revoke all on function public.create_business_scan_request(uuid,text)
  from public, anon, service_role;
grant execute on function public.create_business_scan_request(uuid,text) to authenticated;

-- Direct browser creation of business_scan_history is superseded by the atomic
-- RPC above. Reads remain workspace-scoped.
revoke insert, update, delete on table public.business_scan_history from authenticated;
grant select on table public.business_scan_history to authenticated;

-- Legacy scan_post_process mutates the business profile and legacy AI knowledge
-- from raw scan fields. No new jobs of that type may enter the queue.
do $$
begin
  if exists (
    select 1 from public.job_queue
    where job_type='scan_post_process' and status='processing'
  ) then
    raise exception 'cannot close business scan integration while legacy scan_post_process is processing';
  end if;

  update public.job_queue
  set status='failed',
      error_message='legacy scan_post_process disabled: canonical business_knowledge_* is authoritative',
      completed_at=pg_catalog.now(),
      locked_by=null,
      locked_at=null
  where job_type='scan_post_process' and status in ('pending','retry');
end
$$;

create or replace function public.reject_legacy_scan_post_process_job()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.job_type='scan_post_process' then
    raise exception 'legacy scan_post_process is disabled';
  end if;
  return new;
end
$$;

revoke all on function public.reject_legacy_scan_post_process_job()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_reject_legacy_scan_post_process_job on public.job_queue;
create trigger trg_reject_legacy_scan_post_process_job
before insert on public.job_queue
for each row execute function public.reject_legacy_scan_post_process_job();

-- Canonical removals are soft retirements with change-ledger evidence. Service
-- code may update is_current=false but cannot hard-delete source/item history.
revoke delete on table public.business_knowledge_sources from service_role;
revoke delete on table public.business_knowledge_items from service_role;
grant select,insert,update on table public.business_knowledge_sources to service_role;
grant select,insert,update on table public.business_knowledge_items to service_role;

-- Reject the historical raw snapshot inserted by the legacy bridge. The new
-- snapshot below is built only after provenance triggers have admitted current
-- canonical items.
create or replace function public.require_canonical_business_scan_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.snapshot_kind='website_scan'
     and coalesce((new.payload->>'canonical')::boolean,false) is not true then
    return null;
  end if;
  return new;
end
$$;

revoke all on function public.require_canonical_business_scan_snapshot()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_0_require_canonical_business_scan_snapshot on public.business_knowledge_snapshots;
create trigger trg_0_require_canonical_business_scan_snapshot
before insert on public.business_knowledge_snapshots
for each row execute function public.require_canonical_business_scan_snapshot();

create or replace function public.capture_business_knowledge_scan_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_source_id uuid;
  v_items jsonb;
  v_payload jsonb;
  v_hash text;
begin
  if new.status <> 'completed' or old.status is not distinct from new.status then return new; end if;

  select s.id into v_source_id
  from public.business_knowledge_sources s
  where s.workspace_id=new.workspace_id
    and s.business_id=new.business_id
    and s.source_type='website'
    and s.provider='business-scan'
  order by s.updated_at desc
  limit 1;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id',i.id,
      'item_type',i.item_type,
      'external_id',i.external_id,
      'canonical_url',i.canonical_url,
      'title',i.title,
      'summary',i.summary,
      'content_text',i.content_text,
      'structured_data',i.structured_data,
      'content_hash',i.content_hash,
      'confidence',i.confidence,
      'source_trust_score',i.source_trust_score
    ) order by i.item_type::text,i.external_id
  ),'[]'::jsonb) into v_items
  from public.business_knowledge_items i
  where i.workspace_id=new.workspace_id
    and i.business_id=new.business_id
    and i.scan_history_id=new.id
    and i.is_current=true;

  v_payload := pg_catalog.jsonb_build_object(
    'canonical',true,
    'scan_history_id',new.id,
    'execution_claim_version',new.execution_claim_version,
    'items',v_items
  );
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_payload::text,'UTF8'),'sha256'),'hex');

  insert into public.business_knowledge_snapshots(
    workspace_id,business_id,source_id,scan_history_id,snapshot_kind,captured_at,content_hash,payload
  ) values (
    new.workspace_id,new.business_id,v_source_id,new.id,'website_scan',coalesce(new.completed_at,pg_catalog.now()),v_hash,v_payload
  );
  return new;
end
$$;

revoke all on function public.capture_business_knowledge_scan_snapshot()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_zz_capture_business_knowledge_scan_snapshot on public.business_scan_history;
create trigger trg_zz_capture_business_knowledge_scan_snapshot
after update of status on public.business_scan_history
for each row
when (new.status='completed')
execute function public.capture_business_knowledge_scan_snapshot();

comment on function public.create_business_scan_request(uuid,text) is
  'Atomically creates the tenant-bound scan source, scan history and source-scan from server-derived workspace authority.';
comment on function public.capture_business_knowledge_scan_snapshot() is
  'Captures immutable website snapshots only from current canonical provenance-admitted business knowledge items.';

commit;
