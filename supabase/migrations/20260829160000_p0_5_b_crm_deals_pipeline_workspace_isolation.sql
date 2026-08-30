begin;

lock table public.workspaces, public.pipeline_stages, public.deals in share row exclusive mode;

do $$
declare
  unmapped_count integer;
  ambiguous_count integer;
begin
  select count(*) into unmapped_count
  from public.pipeline_stages ps
  where ps.workspace_id is null
    and not exists (select 1 from public.workspaces w where w.owner_id = ps.user_id);

  select count(*) into ambiguous_count
  from (
    select ps.id
    from public.pipeline_stages ps
    join public.workspaces w on w.owner_id = ps.user_id
    where ps.workspace_id is null
    group by ps.id
    having count(*) > 1
  ) ambiguous;

  if unmapped_count > 0 then
    raise exception 'Cannot harden pipeline_stages: % NULL rows have no deterministic owner workspace', unmapped_count;
  end if;
  if ambiguous_count > 0 then
    raise exception 'Cannot harden pipeline_stages: % NULL rows have ambiguous owner workspace mapping', ambiguous_count;
  end if;
end
$$;

update public.pipeline_stages ps
set workspace_id = w.id
from public.workspaces w
where ps.workspace_id is null
  and w.owner_id = ps.user_id
  and not exists (
    select 1 from public.workspaces w2
    where w2.owner_id = ps.user_id and w2.id <> w.id
  );

do $$
begin
  if exists (select 1 from public.pipeline_stages where workspace_id is null) then
    raise exception 'Cannot harden pipeline_stages: NULL workspace_id remains after deterministic backfill';
  end if;
  if exists (select 1 from public.deals where workspace_id is null) then
    raise exception 'Cannot harden deals: NULL workspace_id exists; no automatic deal backfill is permitted';
  end if;
  if exists (
    select 1 from public.deals d
    join public.pipeline_stages ps on ps.id = d.stage_id
    where d.stage_id is not null and d.workspace_id is distinct from ps.workspace_id
  ) then
    raise exception 'Cannot harden deals: deal/pipeline_stage workspace mismatch remains';
  end if;
  if exists (
    select 1 from public.deals d
    join public.leads l on l.id = d.lead_id
    where d.lead_id is not null and d.workspace_id is distinct from l.workspace_id
  ) then
    raise exception 'Cannot harden deals: deal/lead workspace mismatch exists';
  end if;
end
$$;

alter table public.pipeline_stages alter column workspace_id set not null;
alter table public.deals alter column workspace_id set not null;

create index if not exists idx_pipeline_stages_workspace_sort on public.pipeline_stages(workspace_id, sort_order);
create index if not exists idx_deals_workspace_updated on public.deals(workspace_id, updated_at desc);
create index if not exists idx_deals_workspace_stage on public.deals(workspace_id, stage_id);
create index if not exists idx_deals_workspace_lead on public.deals(workspace_id, lead_id);

create or replace function public.enforce_p0_5_b_identity_immutability()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception '% workspace_id is immutable', tg_table_name;
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception '% user_id is immutable', tg_table_name;
  end if;
  return new;
end
$$;

revoke all on function public.enforce_p0_5_b_identity_immutability() from public, anon, authenticated, service_role;

create or replace function public.enforce_p0_5_b_deal_parent_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage_id is not null and not exists (
    select 1 from public.pipeline_stages ps
    where ps.id = new.stage_id and ps.workspace_id = new.workspace_id
  ) then
    raise exception 'deals stage workspace mismatch';
  end if;
  if new.lead_id is not null and not exists (
    select 1 from public.leads l
    where l.id = new.lead_id and l.workspace_id = new.workspace_id
  ) then
    raise exception 'deals lead workspace mismatch';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_p0_5_b_deal_parent_workspace() from public, anon, authenticated, service_role;

drop trigger if exists trg_p0_5_b_a_pipeline_identity on public.pipeline_stages;
create trigger trg_p0_5_b_a_pipeline_identity
before update of workspace_id, user_id on public.pipeline_stages
for each row execute function public.enforce_p0_5_b_identity_immutability();

drop trigger if exists trg_p0_5_b_a_deal_identity on public.deals;
create trigger trg_p0_5_b_a_deal_identity
before update of workspace_id, user_id on public.deals
for each row execute function public.enforce_p0_5_b_identity_immutability();

drop trigger if exists trg_p0_5_b_b_deal_parent_workspace on public.deals;
create trigger trg_p0_5_b_b_deal_parent_workspace
before insert or update of workspace_id, stage_id, lead_id on public.deals
for each row execute function public.enforce_p0_5_b_deal_parent_workspace();

drop policy if exists "Users can manage own pipeline_stages" on public.pipeline_stages;
drop policy if exists "Users can manage own deals" on public.deals;

alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;

revoke all privileges on table public.pipeline_stages from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.deals from public, anon, authenticated, sandbox_exec, service_role;

grant select, insert, update, delete on table public.pipeline_stages to authenticated, service_role;
grant select, insert, update, delete on table public.deals to authenticated, service_role;

create policy "p0_5_b workspace can view pipeline_stages"
on public.pipeline_stages for select to authenticated
using (public.has_workspace_access(workspace_id));

create policy "p0_5_b members can insert pipeline_stages"
on public.pipeline_stages for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and user_id = (select auth.uid())
);

create policy "p0_5_b members can update pipeline_stages"
on public.pipeline_stages for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0_5_b owners admins delete pipeline_stages"
on public.pipeline_stages for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0_5_b workspace can view deals"
on public.deals for select to authenticated
using (public.has_workspace_access(workspace_id));

create policy "p0_5_b members can insert deals"
on public.deals for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and user_id = (select auth.uid())
);

create policy "p0_5_b members can update deals"
on public.deals for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0_5_b owners admins delete deals"
on public.deals for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

commit;
