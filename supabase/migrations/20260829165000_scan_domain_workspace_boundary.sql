begin;

lock table public.business_ai_content, public.scan_sources,
  public.source_scans, public.scan_insights
in share row exclusive mode;

do $$
begin
  if exists(select 1 from public.business_ai_content where workspace_id is null)
     or exists(select 1 from public.scan_sources where workspace_id is null)
     or exists(select 1 from public.source_scans where workspace_id is null)
     or exists(select 1 from public.scan_insights where workspace_id is null) then
    raise exception 'Cannot harden scan domain: NULL workspace_id exists';
  end if;

  if exists(
    select 1 from public.business_ai_content x
    where not exists(
      select 1 from public.business_profiles b
      where b.id=x.business_id and b.workspace_id=x.workspace_id
    )
  ) or exists(
    select 1 from public.business_ai_content x
    where x.scan_history_id is not null and not exists(
      select 1 from public.business_scan_history s
      where s.id=x.scan_history_id and s.workspace_id=x.workspace_id
    )
  ) then raise exception 'Cannot harden business_ai_content: parent workspace mismatch'; end if;

  if exists(
    select 1 from public.scan_sources x
    where x.business_id is not null and not exists(
      select 1 from public.business_profiles b
      where b.id=x.business_id and b.workspace_id=x.workspace_id
    )
  ) then raise exception 'Cannot harden scan_sources: business workspace mismatch'; end if;

  if exists(
    select 1 from public.source_scans x
    where not exists(
      select 1 from public.scan_sources s
      where s.id=x.source_id and s.workspace_id=x.workspace_id
        and (x.business_id is null or s.business_id is null or s.business_id=x.business_id)
    )
  ) or exists(
    select 1 from public.source_scans x
    where x.business_id is not null and not exists(
      select 1 from public.business_profiles b
      where b.id=x.business_id and b.workspace_id=x.workspace_id
    )
  ) then raise exception 'Cannot harden source_scans: parent workspace mismatch'; end if;

  if exists(
    select 1 from public.scan_insights x
    where not exists(
      select 1 from public.scan_sources s
      where s.id=x.source_id and s.workspace_id=x.workspace_id
        and (x.business_id is null or s.business_id is null or s.business_id=x.business_id)
    )
  ) or exists(
    select 1 from public.scan_insights x
    where not exists(
      select 1 from public.source_scans s
      where s.id=x.scan_id and s.workspace_id=x.workspace_id and s.source_id=x.source_id
        and (x.business_id is null or s.business_id is null or s.business_id=x.business_id)
    )
  ) or exists(
    select 1 from public.scan_insights x
    where x.business_id is not null and not exists(
      select 1 from public.business_profiles b
      where b.id=x.business_id and b.workspace_id=x.workspace_id
    )
  ) then raise exception 'Cannot harden scan_insights: parent lineage mismatch'; end if;
end
$$;

create or replace function public.enforce_scan_domain_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := to_jsonb(old);
begin
  if n->>'workspace_id' is distinct from o->>'workspace_id' then
    raise exception '% workspace_id is immutable', tg_table_name;
  end if;

  if tg_table_name in ('scan_sources','source_scans','scan_insights')
     and n->>'user_id' is distinct from o->>'user_id' then
    raise exception '% user_id is immutable', tg_table_name;
  end if;

  if tg_table_name = 'business_ai_content'
     and n->>'generated_by' is distinct from o->>'generated_by' then
    raise exception 'business_ai_content generated_by is immutable';
  end if;

  return new;
end
$$;

revoke all on function public.enforce_scan_domain_identity()
from public, anon, authenticated, service_role;

create or replace function public.enforce_scan_domain_parent_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n jsonb := to_jsonb(new);
  v_ws uuid := nullif(n->>'workspace_id','')::uuid;
  v_business uuid := nullif(n->>'business_id','')::uuid;
  v_source uuid := nullif(n->>'source_id','')::uuid;
  v_scan uuid;
begin
  if v_ws is null then raise exception '% workspace_id is required', tg_table_name; end if;

  if v_business is not null and not exists(
    select 1 from public.business_profiles b where b.id=v_business and b.workspace_id=v_ws
  ) then raise exception '% business workspace mismatch', tg_table_name; end if;

  if tg_table_name = 'business_ai_content' then
    v_scan := nullif(n->>'scan_history_id','')::uuid;
    if v_scan is not null and not exists(
      select 1 from public.business_scan_history s where s.id=v_scan and s.workspace_id=v_ws
    ) then raise exception 'business_ai_content scan history workspace mismatch'; end if;
  elsif tg_table_name = 'source_scans' then
    if v_source is null or not exists(
      select 1 from public.scan_sources s
      where s.id=v_source and s.workspace_id=v_ws
        and (v_business is null or s.business_id is null or s.business_id=v_business)
    ) then raise exception 'source_scans source workspace mismatch'; end if;
  elsif tg_table_name = 'scan_insights' then
    v_scan := nullif(n->>'scan_id','')::uuid;
    if v_source is null or not exists(
      select 1 from public.scan_sources s
      where s.id=v_source and s.workspace_id=v_ws
        and (v_business is null or s.business_id is null or s.business_id=v_business)
    ) then raise exception 'scan_insights source workspace mismatch'; end if;
    if v_scan is null or not exists(
      select 1 from public.source_scans s
      where s.id=v_scan and s.workspace_id=v_ws and s.source_id=v_source
        and (v_business is null or s.business_id is null or s.business_id=v_business)
    ) then raise exception 'scan_insights scan lineage mismatch'; end if;
  end if;

  return new;
end
$$;

revoke all on function public.enforce_scan_domain_parent_workspace()
from public, anon, authenticated, service_role;

drop policy if exists "Admins can manage all AI content" on public.business_ai_content;
drop policy if exists "Workspace members can view AI content" on public.business_ai_content;
drop policy if exists "Workspace members can view scan_sources" on public.scan_sources;
drop policy if exists "Workspace members can insert scan_sources" on public.scan_sources;
drop policy if exists "Workspace members can update scan_sources" on public.scan_sources;
drop policy if exists "Workspace members can delete scan_sources" on public.scan_sources;
drop policy if exists "Workspace members can view source_scans" on public.source_scans;
drop policy if exists "Workspace members can insert source_scans" on public.source_scans;
drop policy if exists "Workspace members can update source_scans" on public.source_scans;
drop policy if exists "Workspace members can delete source_scans" on public.source_scans;
drop policy if exists "Workspace members can view scan_insights" on public.scan_insights;
drop policy if exists "Workspace members can insert scan_insights" on public.scan_insights;
drop policy if exists "Workspace members can update scan_insights" on public.scan_insights;
drop policy if exists "Workspace members can delete scan_insights" on public.scan_insights;

alter table public.business_ai_content enable row level security;
alter table public.scan_sources enable row level security;
alter table public.source_scans enable row level security;
alter table public.scan_insights enable row level security;

revoke all privileges on table public.business_ai_content, public.scan_sources,
  public.source_scans, public.scan_insights
from public, anon, authenticated, sandbox_exec, service_role;

grant select on public.business_ai_content to authenticated;
grant select, insert, update, delete on public.scan_sources to authenticated;
grant select, insert, update on public.source_scans to authenticated;
grant select, update on public.scan_insights to authenticated;
grant select, insert, update, delete on public.business_ai_content, public.scan_sources,
  public.source_scans, public.scan_insights to service_role;

create policy "p1_business_ai_content_select_ws" on public.business_ai_content
for select to authenticated using (public.has_workspace_access(workspace_id));
create policy "p1_scan_sources_select_ws" on public.scan_sources
for select to authenticated using (public.has_workspace_access(workspace_id));
create policy "p1_source_scans_select_ws" on public.source_scans
for select to authenticated using (public.has_workspace_access(workspace_id));
create policy "p1_scan_insights_select_ws" on public.scan_insights
for select to authenticated using (public.has_workspace_access(workspace_id));

create policy "p1_scan_sources_insert_ws" on public.scan_sources
for insert to authenticated with check (
  user_id=(select auth.uid())
  and public.has_workspace_role(workspace_id,array['owner','admin','member'])
);
create policy "p1_scan_sources_update_ws" on public.scan_sources
for update to authenticated
using (public.has_workspace_role(workspace_id,array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id,array['owner','admin','member']));
create policy "p1_scan_sources_delete_ws" on public.scan_sources
for delete to authenticated
using (public.has_workspace_role(workspace_id,array['owner','admin','member']));

create policy "p1_source_scans_insert_ws" on public.source_scans
for insert to authenticated with check (
  user_id=(select auth.uid())
  and public.has_workspace_role(workspace_id,array['owner','admin','member'])
);
create policy "p1_source_scans_update_ws" on public.source_scans
for update to authenticated
using (public.has_workspace_role(workspace_id,array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id,array['owner','admin','member']));

create policy "p1_scan_insights_update_ws" on public.scan_insights
for update to authenticated
using (public.has_workspace_role(workspace_id,array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id,array['owner','admin','member']));

drop trigger if exists trg_scan_domain_identity_business_ai_content on public.business_ai_content;
create trigger trg_scan_domain_identity_business_ai_content before update on public.business_ai_content
for each row execute function public.enforce_scan_domain_identity();
drop trigger if exists trg_scan_domain_identity_scan_sources on public.scan_sources;
create trigger trg_scan_domain_identity_scan_sources before update on public.scan_sources
for each row execute function public.enforce_scan_domain_identity();
drop trigger if exists trg_scan_domain_identity_source_scans on public.source_scans;
create trigger trg_scan_domain_identity_source_scans before update on public.source_scans
for each row execute function public.enforce_scan_domain_identity();
drop trigger if exists trg_scan_domain_identity_scan_insights on public.scan_insights;
create trigger trg_scan_domain_identity_scan_insights before update on public.scan_insights
for each row execute function public.enforce_scan_domain_identity();

drop trigger if exists trg_scan_domain_parent_business_ai_content on public.business_ai_content;
create trigger trg_scan_domain_parent_business_ai_content before insert or update on public.business_ai_content
for each row execute function public.enforce_scan_domain_parent_workspace();
drop trigger if exists trg_scan_domain_parent_scan_sources on public.scan_sources;
create trigger trg_scan_domain_parent_scan_sources before insert or update on public.scan_sources
for each row execute function public.enforce_scan_domain_parent_workspace();
drop trigger if exists trg_scan_domain_parent_source_scans on public.source_scans;
create trigger trg_scan_domain_parent_source_scans before insert or update on public.source_scans
for each row execute function public.enforce_scan_domain_parent_workspace();
drop trigger if exists trg_scan_domain_parent_scan_insights on public.scan_insights;
create trigger trg_scan_domain_parent_scan_insights before insert or update on public.scan_insights
for each row execute function public.enforce_scan_domain_parent_workspace();

commit;
