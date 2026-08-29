begin;

-- P0.5 CRM-A closes tenant boundaries for the active CRM path. Public
-- enterprise intake is intentionally excluded because its six legacy rows are
-- platform leads without a user or workspace identity.

-- The only legacy pipeline stages without a workspace are two complete default
-- sets. Each owner has exactly one accessible workspace; refuse ambiguity.
with stage_users as (
  select distinct ps.user_id
  from public.pipeline_stages ps
  where ps.workspace_id is null
), candidates as (
  select su.user_id, (array_agg(w.id order by w.id))[1] as workspace_id
  from stage_users su
  join public.workspaces w
    on public.has_workspace_access_for_user(w.id, su.user_id)
  group by su.user_id
  having count(*) = 1
)
update public.pipeline_stages ps
set workspace_id = c.workspace_id
from candidates c
where ps.workspace_id is null
  and ps.user_id = c.user_id;

do $$
begin
  if exists (select 1 from public.pipeline_stages where workspace_id is null) then
    raise exception 'Cannot enforce pipeline_stages.workspace_id: ambiguous legacy rows remain';
  end if;
  if exists (select 1 from public.deals where workspace_id is null) then
    raise exception 'Cannot enforce deals.workspace_id: unresolved rows remain';
  end if;
  if exists (select 1 from public.contact_segments where workspace_id is null) then
    raise exception 'Cannot enforce contact_segments.workspace_id: unresolved rows remain';
  end if;
  if exists (select 1 from public.contact_tags where workspace_id is null) then
    raise exception 'Cannot enforce contact_tags.workspace_id: unresolved rows remain';
  end if;
  if exists (select 1 from public.enriched_contacts where workspace_id is null) then
    raise exception 'Cannot enforce enriched_contacts.workspace_id: unresolved rows remain';
  end if;
  if exists (select 1 from public.lead_scores where workspace_id is null) then
    raise exception 'Cannot enforce lead_scores.workspace_id: unresolved rows remain';
  end if;

  if exists (
    select 1 from public.pipeline_stages ps
    where not public.has_workspace_access_for_user(ps.workspace_id, ps.user_id)
  ) then
    raise exception 'Pipeline stage creator has no access to the assigned workspace';
  end if;
  if exists (
    select 1 from public.deals d
    where not public.has_workspace_access_for_user(d.workspace_id, d.user_id)
  ) then
    raise exception 'Deal creator has no access to the assigned workspace';
  end if;
  if exists (
    select 1 from public.contact_segments cs
    where not public.has_workspace_access_for_user(cs.workspace_id, cs.user_id)
  ) then
    raise exception 'Contact segment creator has no access to the assigned workspace';
  end if;
  if exists (
    select 1 from public.contact_tags ct
    where not public.has_workspace_access_for_user(ct.workspace_id, ct.user_id)
  ) then
    raise exception 'Contact tag creator has no access to the assigned workspace';
  end if;
  if exists (
    select 1 from public.enriched_contacts ec
    where not public.has_workspace_access_for_user(ec.workspace_id, ec.user_id)
  ) then
    raise exception 'Enriched contact creator has no access to the assigned workspace';
  end if;

  if exists (
    select 1
    from public.deals d
    join public.pipeline_stages ps on ps.id = d.stage_id
    where d.stage_id is not null
      and d.workspace_id is distinct from ps.workspace_id
  ) then
    raise exception 'Cross-workspace deal to pipeline stage link exists';
  end if;
  if exists (
    select 1
    from public.deals d
    join public.leads l on l.id = d.lead_id
    where d.lead_id is not null
      and d.workspace_id is distinct from l.workspace_id
  ) then
    raise exception 'Cross-workspace deal to lead link exists';
  end if;
  if exists (
    select 1
    from public.lead_scores ls
    join public.leads l on l.id = ls.lead_id
    where ls.lead_id is not null
      and ls.workspace_id is distinct from l.workspace_id
  ) then
    raise exception 'Cross-workspace lead score link exists';
  end if;
  if exists (
    select 1
    from public.contact_consent cc
    join public.leads l on l.id = cc.lead_id
    where cc.lead_id is not null
      and cc.workspace_id is distinct from l.workspace_id
  ) then
    raise exception 'Cross-workspace consent to lead link exists';
  end if;
end
$$;

alter table public.pipeline_stages alter column workspace_id set not null;
alter table public.deals alter column workspace_id set not null;
alter table public.contact_segments alter column workspace_id set not null;
alter table public.contact_tags alter column workspace_id set not null;
alter table public.enriched_contacts alter column workspace_id set not null;
alter table public.lead_scores alter column workspace_id set not null;

-- Enforce tenant identity across CRM relationships, not just at query time.
alter table public.pipeline_stages
  add constraint pipeline_stages_id_workspace_key unique (id, workspace_id);
alter table public.leads
  add constraint leads_id_workspace_key unique (id, workspace_id);

alter table public.deals drop constraint if exists deals_stage_id_fkey;
alter table public.deals
  add constraint deals_stage_workspace_fkey
  foreign key (stage_id, workspace_id)
  references public.pipeline_stages(id, workspace_id)
  on delete set null (stage_id);

alter table public.deals drop constraint if exists deals_lead_id_fkey;
alter table public.deals
  add constraint deals_lead_workspace_fkey
  foreign key (lead_id, workspace_id)
  references public.leads(id, workspace_id)
  on delete set null (lead_id);

alter table public.lead_scores drop constraint if exists lead_scores_lead_id_fkey;
alter table public.lead_scores
  add constraint lead_scores_lead_workspace_fkey
  foreign key (lead_id, workspace_id)
  references public.leads(id, workspace_id)
  on delete cascade;

alter table public.contact_consent drop constraint if exists contact_consent_lead_id_fkey;
alter table public.contact_consent
  add constraint contact_consent_lead_workspace_fkey
  foreign key (lead_id, workspace_id)
  references public.leads(id, workspace_id)
  on delete set null (lead_id);

alter table public.enriched_contacts
  drop constraint if exists enriched_contacts_user_id_contact_identifier_key;
alter table public.enriched_contacts
  add constraint enriched_contacts_workspace_id_contact_identifier_key
  unique (workspace_id, contact_identifier);

create index if not exists idx_pipeline_stages_workspace_sort
  on public.pipeline_stages(workspace_id, sort_order);
create index if not exists idx_deals_workspace_updated
  on public.deals(workspace_id, updated_at desc);
create index if not exists idx_contact_segments_workspace
  on public.contact_segments(workspace_id);
create index if not exists idx_contact_tags_workspace_contact
  on public.contact_tags(workspace_id, contact_identifier);
create index if not exists idx_deal_notes_deal
  on public.deal_notes(deal_id);
create index if not exists idx_deal_tasks_deal
  on public.deal_tasks(deal_id);
create index if not exists idx_deal_activities_deal
  on public.deal_activities(deal_id);

-- A user may legitimately belong to multiple workspaces. Membership in both
-- must not permit moving an existing row across tenant boundaries.
create or replace function public.p0_enforce_workspace_identity_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_id is immutable'
      using errcode = '42501';
  end if;
  return new;
end
$$;

revoke all on function public.p0_enforce_workspace_identity_immutable()
  from public, anon;
grant execute on function public.p0_enforce_workspace_identity_immutable()
  to authenticated, service_role;

create trigger p0_crm_pipeline_stages_workspace_immutable
before update of workspace_id on public.pipeline_stages
for each row execute function public.p0_enforce_workspace_identity_immutable();
create trigger p0_crm_deals_workspace_immutable
before update of workspace_id on public.deals
for each row execute function public.p0_enforce_workspace_identity_immutable();
create trigger p0_crm_contact_segments_workspace_immutable
before update of workspace_id on public.contact_segments
for each row execute function public.p0_enforce_workspace_identity_immutable();
create trigger p0_crm_contact_tags_workspace_immutable
before update of workspace_id on public.contact_tags
for each row execute function public.p0_enforce_workspace_identity_immutable();
create trigger p0_crm_enriched_contacts_workspace_immutable
before update of workspace_id on public.enriched_contacts
for each row execute function public.p0_enforce_workspace_identity_immutable();
create trigger p0_crm_lead_scores_workspace_immutable
before update of workspace_id on public.lead_scores
for each row execute function public.p0_enforce_workspace_identity_immutable();
create trigger p0_crm_contact_consent_workspace_immutable
before update of workspace_id on public.contact_consent
for each row execute function public.p0_enforce_workspace_identity_immutable();

alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;
alter table public.contact_segments enable row level security;
alter table public.contact_tags enable row level security;
alter table public.enriched_contacts enable row level security;
alter table public.lead_scores enable row level security;
alter table public.contact_consent enable row level security;
alter table public.deal_notes enable row level security;
alter table public.deal_tasks enable row level security;
alter table public.deal_activities enable row level security;

drop policy if exists "Users can manage own pipeline_stages" on public.pipeline_stages;
drop policy if exists "Users can manage own deals" on public.deals;
drop policy if exists "Users can manage own contact_segments" on public.contact_segments;
drop policy if exists "Users can manage own contact_tags" on public.contact_tags;
drop policy if exists "Users manage own enriched contacts" on public.enriched_contacts;
drop policy if exists "Workspace members can manage lead scores" on public.lead_scores;
drop policy if exists "service_manage_consent" on public.contact_consent;
drop policy if exists "workspace_read_consent" on public.contact_consent;
drop policy if exists "Users can manage own deal_notes" on public.deal_notes;
drop policy if exists "Users can manage own deal_tasks" on public.deal_tasks;
drop policy if exists "Users can manage own deal_activities" on public.deal_activities;

create policy "p0 crm members view pipeline stages"
on public.pipeline_stages for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 crm admins create pipeline stages"
on public.pipeline_stages for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin'])
);

create policy "p0 crm admins update pipeline stages"
on public.pipeline_stages for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']))
with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 crm admins delete pipeline stages"
on public.pipeline_stages for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 crm members view deals"
on public.deals for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 crm members create own deals"
on public.deals for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
);

create policy "p0 crm members update deals"
on public.deals for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 crm admins delete deals"
on public.deals for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 crm members view contact segments"
on public.contact_segments for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 crm admins create contact segments"
on public.contact_segments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin'])
);

create policy "p0 crm admins update contact segments"
on public.contact_segments for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']))
with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 crm admins delete contact segments"
on public.contact_segments for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 crm members view contact tags"
on public.contact_tags for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 crm members create own contact tags"
on public.contact_tags for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
);

create policy "p0 crm authors or admins delete contact tags"
on public.contact_tags for delete to authenticated
using (
  public.has_workspace_role(workspace_id, array['owner','admin'])
  or (
    user_id = (select auth.uid())
    and public.has_workspace_role(workspace_id, array['member'])
  )
);

create policy "p0 crm members view enriched contacts"
on public.enriched_contacts for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 crm members view lead scores"
on public.lead_scores for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 crm members view contact consent"
on public.contact_consent for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']));

-- Deal children inherit the tenant from their canonical parent deal.
create policy "p0 crm members view deal notes"
on public.deal_notes for select to authenticated
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_notes.deal_id
      and public.has_workspace_role(d.workspace_id, array['owner','admin','member'])
  )
);

create policy "p0 crm members create own deal notes"
on public.deal_notes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.deals d
    where d.id = deal_notes.deal_id
      and public.has_workspace_role(d.workspace_id, array['owner','admin','member'])
  )
);

create policy "p0 crm authors or admins delete deal notes"
on public.deal_notes for delete to authenticated
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_notes.deal_id
      and (
        deal_notes.user_id = (select auth.uid())
        or public.has_workspace_role(d.workspace_id, array['owner','admin'])
      )
      and public.has_workspace_role(d.workspace_id, array['owner','admin','member'])
  )
);

create policy "p0 crm members view deal tasks"
on public.deal_tasks for select to authenticated
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_tasks.deal_id
      and public.has_workspace_role(d.workspace_id, array['owner','admin','member'])
  )
);

create policy "p0 crm members create own deal tasks"
on public.deal_tasks for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.deals d
    where d.id = deal_tasks.deal_id
      and public.has_workspace_role(d.workspace_id, array['owner','admin','member'])
  )
);

create policy "p0 crm authors or admins update deal tasks"
on public.deal_tasks for update to authenticated
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_tasks.deal_id
      and (
        deal_tasks.user_id = (select auth.uid())
        or public.has_workspace_role(d.workspace_id, array['owner','admin'])
      )
      and public.has_workspace_role(d.workspace_id, array['owner','admin','member'])
  )
)
with check (
  exists (
    select 1 from public.deals d
    where d.id = deal_tasks.deal_id
      and (
        deal_tasks.user_id = (select auth.uid())
        or public.has_workspace_role(d.workspace_id, array['owner','admin'])
      )
      and public.has_workspace_role(d.workspace_id, array['owner','admin','member'])
  )
);

create policy "p0 crm authors or admins delete deal tasks"
on public.deal_tasks for delete to authenticated
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_tasks.deal_id
      and (
        deal_tasks.user_id = (select auth.uid())
        or public.has_workspace_role(d.workspace_id, array['owner','admin'])
      )
      and public.has_workspace_role(d.workspace_id, array['owner','admin','member'])
  )
);

create policy "p0 crm members view deal activities"
on public.deal_activities for select to authenticated
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_activities.deal_id
      and public.has_workspace_role(d.workspace_id, array['owner','admin','member'])
  )
);

revoke all on table public.pipeline_stages from public, anon, authenticated;
grant select, insert, update, delete on table public.pipeline_stages to authenticated;

revoke all on table public.deals from public, anon, authenticated;
grant select, insert, update, delete on table public.deals to authenticated;

revoke all on table public.contact_segments from public, anon, authenticated;
grant select, insert, update, delete on table public.contact_segments to authenticated;

revoke all on table public.contact_tags from public, anon, authenticated;
grant select, insert, delete on table public.contact_tags to authenticated;

revoke all on table public.enriched_contacts from public, anon, authenticated;
grant select on table public.enriched_contacts to authenticated;

revoke all on table public.lead_scores from public, anon, authenticated;
grant select on table public.lead_scores to authenticated;

revoke all on table public.contact_consent from public, anon, authenticated;
grant select on table public.contact_consent to authenticated;

revoke all on table public.deal_notes from public, anon, authenticated;
grant select, insert, delete on table public.deal_notes to authenticated;

revoke all on table public.deal_tasks from public, anon, authenticated;
grant select, insert, update, delete on table public.deal_tasks to authenticated;

revoke all on table public.deal_activities from public, anon, authenticated;
grant select on table public.deal_activities to authenticated;

commit;
