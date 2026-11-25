-- ============================================================
-- BUSINESS INTELLIGENCE ADVERSARIAL CLOSURE
-- Server-owned scan lifecycle + canonical knowledge admission.
-- ============================================================

-- Browser roles may create a pending scan request, but may never complete a
-- scan or write canonical scan results. Completion is owned by the server-side
-- extractor after caller-bound authority has been resolved.
drop policy if exists "p1_business_scan_history_update_ws" on public.business_scan_history;
revoke update, delete on table public.business_scan_history from authenticated;
grant select, insert on table public.business_scan_history to authenticated;

create or replace function public.enforce_business_scan_history_client_insert_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.status := 'pending';
    new.scan_phase := 'queued';
    new.pages_scanned := 0;
    new.insights_count := 0;
    new.duration_ms := null;
    new.error_message := null;
    new.summary_json := '{}'::jsonb;
    new.products_found := '[]'::jsonb;
    new.services_found := '[]'::jsonb;
    new.contact_methods := '[]'::jsonb;
    new.social_links := '{}'::jsonb;
    new.pricing_signals := '[]'::jsonb;
    new.tone_of_voice := null;
    new.suggested_keywords := '[]'::jsonb;
    new.cta_signals := '[]'::jsonb;
    new.competitor_hints := '[]'::jsonb;
    new.completed_at := null;
    new.execution_claimed_at := null;
  end if;
  return new;
end
$$;

revoke all on function public.enforce_business_scan_history_client_insert_boundary()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_business_scan_history_client_insert_boundary
  on public.business_scan_history;
create trigger trg_business_scan_history_client_insert_boundary
before insert on public.business_scan_history
for each row execute function public.enforce_business_scan_history_client_insert_boundary();

-- Canonical business knowledge is server-owned. Browser roles retain read-only
-- workspace access; a future manual/import UI must use a separately audited
-- server boundary rather than direct table DML.
drop policy if exists business_knowledge_sources_insert on public.business_knowledge_sources;
drop policy if exists business_knowledge_sources_update on public.business_knowledge_sources;
drop policy if exists business_knowledge_sources_delete on public.business_knowledge_sources;
drop policy if exists business_knowledge_items_insert on public.business_knowledge_items;
drop policy if exists business_knowledge_items_update on public.business_knowledge_items;
drop policy if exists business_knowledge_items_delete on public.business_knowledge_items;
drop policy if exists business_knowledge_snapshots_insert on public.business_knowledge_snapshots;

revoke insert, update, delete on table
  public.business_knowledge_sources,
  public.business_knowledge_items,
  public.business_knowledge_snapshots
from public, anon, authenticated;

grant select on table
  public.business_knowledge_sources,
  public.business_knowledge_items,
  public.business_knowledge_snapshots
 to authenticated;

grant select, insert, update, delete on table
  public.business_knowledge_sources,
  public.business_knowledge_items
 to service_role;
grant select, insert on table public.business_knowledge_snapshots to service_role;
revoke update, delete on table public.business_knowledge_snapshots from service_role;

-- Strengthen structural lineage from workspace-only to exact
-- workspace + business + source/scan lineage.
create or replace function public.enforce_business_knowledge_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  business_workspace uuid;
  scan_workspace uuid;
  scan_business uuid;
  source_workspace uuid;
  source_business uuid;
begin
  select bp.workspace_id into business_workspace
  from public.business_profiles bp
  where bp.id = new.business_id;

  if business_workspace is null or business_workspace <> new.workspace_id then
    raise exception 'business_knowledge workspace/business mismatch';
  end if;

  if new.scan_history_id is not null then
    select sh.workspace_id, sh.business_id
      into scan_workspace, scan_business
    from public.business_scan_history sh
    where sh.id = new.scan_history_id;

    if scan_workspace is null
       or scan_workspace <> new.workspace_id
       or scan_business is distinct from new.business_id then
      raise exception 'business_knowledge workspace/scan/business mismatch';
    end if;
  end if;

  if new.source_id is not null then
    select s.workspace_id, s.business_id
      into source_workspace, source_business
    from public.business_knowledge_sources s
    where s.id = new.source_id;

    if source_workspace is null
       or source_workspace <> new.workspace_id
       or source_business is distinct from new.business_id then
      raise exception 'business_knowledge workspace/source/business mismatch';
    end if;
  end if;

  return new;
end
$$;

revoke all on function public.enforce_business_knowledge_workspace()
  from public, anon, authenticated, service_role;

-- Firecrawl metadata is provider-controlled and was not part of the firewall
-- decision. Keep only the exact link subset sent to the firewall and do not
-- persist unscreened metadata/title into canonical knowledge provenance.
create or replace function public.enforce_business_scan_page_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.business_profiles bp
    where bp.id = new.business_id
      and bp.workspace_id = new.workspace_id
  ) then
    raise exception 'business_scan_pages workspace/business mismatch';
  end if;

  if not exists (
    select 1
    from public.business_scan_history sh
    where sh.id = new.scan_history_id
      and sh.workspace_id = new.workspace_id
      and sh.business_id = new.business_id
  ) then
    raise exception 'business_scan_pages workspace/scan mismatch';
  end if;

  new.title := null;
  new.metadata := '{}'::jsonb;

  if not new.is_knowledge_eligible then
    new.content_markdown := null;
    new.links := '[]'::jsonb;
  elsif pg_catalog.jsonb_typeof(new.links) <> 'array' then
    new.links := '[]'::jsonb;
  else
    select coalesce(pg_catalog.jsonb_agg(x.value order by x.ordinality), '[]'::jsonb)
      into new.links
    from pg_catalog.jsonb_array_elements(new.links) with ordinality as x(value, ordinality)
    where x.ordinality <= 50;
  end if;

  return new;
end
$$;

revoke all on function public.enforce_business_scan_page_workspace()
  from public, anon, authenticated, service_role;

-- AI-extracted records are admitted only when their claimed source_url maps to
-- a security-approved page from the same exact scan/business/workspace.
-- Legacy contact/social extraction currently loses exact per-page provenance;
-- fail closed for those item types until that provenance is implemented.
create or replace function public.enforce_business_knowledge_scan_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_url text;
begin
  if new.scan_history_id is null then
    return new;
  end if;

  if new.item_type = 'page' then
    v_source_url := nullif(pg_catalog.btrim(coalesce(new.canonical_url, '')), '');
  elsif new.item_type in ('media','contact','link') then
    v_source_url := nullif(pg_catalog.btrim(coalesce(new.structured_data ->> 'source_url', '')), '');
  elsif new.item_type in ('product','service','post','faq','review','comment','business_fact') then
    v_source_url := nullif(pg_catalog.btrim(coalesce(
      new.structured_data ->> 'source_url',
      new.canonical_url,
      ''
    )), '');
  else
    return new;
  end if;

  if v_source_url is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.business_scan_pages p
    where p.scan_history_id = new.scan_history_id
      and p.workspace_id = new.workspace_id
      and p.business_id = new.business_id
      and p.is_knowledge_eligible = true
      and pg_catalog.rtrim(pg_catalog.lower(pg_catalog.btrim(p.canonical_url)), '/')
        = pg_catalog.rtrim(pg_catalog.lower(v_source_url), '/')
  ) then
    return null;
  end if;

  return new;
end
$$;

revoke all on function public.enforce_business_knowledge_scan_provenance()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_a_business_knowledge_scan_provenance
  on public.business_knowledge_items;
create trigger trg_a_business_knowledge_scan_provenance
before insert or update on public.business_knowledge_items
for each row execute function public.enforce_business_knowledge_scan_provenance();

-- #218 is Phase 1 canonical knowledge capture. The older scan_post_process
-- worker also writes synthesized scan summaries into legacy knowledge_chunks,
-- which can feed the main AI outside the new evidence/provenance layer. Block
-- only that legacy business_scan chunk bridge. Phase 2 will consume the new
-- canonical business_knowledge_* layer deliberately.
create or replace function public.block_legacy_business_scan_knowledge_chunk()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.content_type = 'business_scan'
     and exists (
       select 1
       from public.knowledge_sources s
       where s.id = new.source_id
         and coalesce(s.metadata ->> 'origin', '') = 'business_scan'
     ) then
    return null;
  end if;
  return new;
end
$$;

revoke all on function public.block_legacy_business_scan_knowledge_chunk()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_block_legacy_business_scan_knowledge_chunk
  on public.knowledge_chunks;
create trigger trg_block_legacy_business_scan_knowledge_chunk
before insert on public.knowledge_chunks
for each row execute function public.block_legacy_business_scan_knowledge_chunk();

comment on function public.block_legacy_business_scan_knowledge_chunk() is
  'Fail-closed Phase 1 guard: prevents website-scan summaries from bypassing canonical Business Intelligence evidence/provenance through legacy knowledge_chunks.';;
