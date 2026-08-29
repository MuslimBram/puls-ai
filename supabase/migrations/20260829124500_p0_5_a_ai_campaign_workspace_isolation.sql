begin;

lock table public.ai_conversations, public.ai_content_library, public.campaigns, public.campaign_content in share row exclusive mode;

-- Abort rather than guessing tenant ownership.
do $$
begin
  if exists (select 1 from public.ai_conversations where workspace_id is null) then
    raise exception 'Cannot harden ai_conversations: unresolved workspace rows remain';
  end if;
  if exists (select 1 from public.ai_content_library where workspace_id is null) then
    raise exception 'Cannot harden ai_content_library: unresolved workspace rows remain';
  end if;
  if exists (select 1 from public.campaigns where workspace_id is null) then
    raise exception 'Cannot harden campaigns: unresolved workspace rows remain';
  end if;
  if exists (select 1 from public.campaign_content where workspace_id is null) then
    raise exception 'Cannot harden campaign_content: unresolved workspace rows remain';
  end if;

  if exists (
    select 1
    from public.ai_conversations c
    join public.business_profiles b on b.id = c.business_id
    where c.business_id is not null and b.workspace_id <> c.workspace_id
  ) then
    raise exception 'Cannot harden ai_conversations: business workspace mismatch';
  end if;

  if exists (
    select 1
    from public.campaign_content cc
    join public.campaigns c on c.id = cc.campaign_id
    where c.workspace_id <> cc.workspace_id
  ) then
    raise exception 'Cannot harden campaign_content: campaign workspace mismatch';
  end if;

  if exists (
    select 1
    from public.campaign_content cc
    join public.content_posts cp on cp.id = cc.content_post_id
    where cc.content_post_id is not null and cp.workspace_id <> cc.workspace_id
  ) then
    raise exception 'Cannot harden campaign_content: content post workspace mismatch';
  end if;
end
$$;

alter table public.ai_conversations alter column workspace_id set not null;
alter table public.ai_content_library alter column workspace_id set not null;
alter table public.campaigns alter column workspace_id set not null;
alter table public.campaign_content alter column workspace_id set not null;

create index if not exists idx_ai_conversations_workspace_created
  on public.ai_conversations(workspace_id, created_at desc);
create index if not exists idx_ai_content_library_workspace_created
  on public.ai_content_library(workspace_id, created_at desc);
create index if not exists idx_campaigns_workspace_created
  on public.campaigns(workspace_id, created_at desc);
create index if not exists idx_campaign_content_workspace_created
  on public.campaign_content(workspace_id, created_at desc);

-- Creator and tenant identity are immutable after insert. This prevents moving a
-- row between workspaces even when one caller belongs to both workspaces.
create or replace function public.enforce_p0_5_a_identity_immutability()
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

revoke all on function public.enforce_p0_5_a_identity_immutability() from public, anon;
grant execute on function public.enforce_p0_5_a_identity_immutability() to authenticated, service_role;

drop trigger if exists trg_p0_5_a_ai_conversations_identity on public.ai_conversations;
create trigger trg_p0_5_a_ai_conversations_identity
before update of workspace_id, user_id on public.ai_conversations
for each row execute function public.enforce_p0_5_a_identity_immutability();

drop trigger if exists trg_p0_5_a_ai_content_library_identity on public.ai_content_library;
create trigger trg_p0_5_a_ai_content_library_identity
before update of workspace_id, user_id on public.ai_content_library
for each row execute function public.enforce_p0_5_a_identity_immutability();

drop trigger if exists trg_p0_5_a_campaigns_identity on public.campaigns;
create trigger trg_p0_5_a_campaigns_identity
before update of workspace_id, user_id on public.campaigns
for each row execute function public.enforce_p0_5_a_identity_immutability();

drop trigger if exists trg_p0_5_a_campaign_content_identity on public.campaign_content;
create trigger trg_p0_5_a_campaign_content_identity
before update of workspace_id, user_id on public.campaign_content
for each row execute function public.enforce_p0_5_a_identity_immutability();

-- Remove legacy user_id-only RLS.
drop policy if exists "Users can delete own ai_conversations" on public.ai_conversations;
drop policy if exists "Users can insert own ai_conversations" on public.ai_conversations;
drop policy if exists "Users can update own ai_conversations" on public.ai_conversations;
drop policy if exists "Users can view own ai_conversations" on public.ai_conversations;

drop policy if exists "Users manage own content" on public.ai_content_library;

drop policy if exists "Users can delete own campaigns" on public.campaigns;
drop policy if exists "Users can insert own campaigns" on public.campaigns;
drop policy if exists "Users can update own campaigns" on public.campaigns;
drop policy if exists "Users can view own campaigns" on public.campaigns;

drop policy if exists "Users can delete own campaign_content" on public.campaign_content;
drop policy if exists "Users can insert own campaign_content" on public.campaign_content;
drop policy if exists "Users can update own campaign_content" on public.campaign_content;
drop policy if exists "Users can view own campaign_content" on public.campaign_content;

-- Browser grants are least-privilege DML only. anon and sandbox cannot touch
-- private tenant tables; service_role remains backend DML-only.
revoke all privileges on table public.ai_conversations from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.ai_content_library from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.campaigns from public, anon, authenticated, sandbox_exec, service_role;
revoke all privileges on table public.campaign_content from public, anon, authenticated, sandbox_exec, service_role;

grant select, insert, update, delete on table public.ai_conversations to authenticated, service_role;
grant select, insert, update, delete on table public.ai_content_library to authenticated, service_role;
grant select, insert, update, delete on table public.campaigns to authenticated, service_role;
grant select, insert, update, delete on table public.campaign_content to authenticated, service_role;

-- Workspace readers include viewer/member/admin/owner and active assignments.
-- Platform admin/super_admin has no automatic private-tenant bypass.
create policy "p0_5_a workspace can view ai_conversations"
on public.ai_conversations for select to authenticated
using (public.has_workspace_access(workspace_id));

create policy "p0_5_a members can insert ai_conversations"
on public.ai_conversations for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and user_id = (select auth.uid())
  and (
    business_id is null
    or exists (
      select 1 from public.business_profiles b
      where b.id = business_id and b.workspace_id = workspace_id
    )
  )
);

create policy "p0_5_a members can update ai_conversations"
on public.ai_conversations for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (
  public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and (
    business_id is null
    or exists (
      select 1 from public.business_profiles b
      where b.id = business_id and b.workspace_id = workspace_id
    )
  )
);

create policy "p0_5_a owners admins delete ai_conversations"
on public.ai_conversations for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0_5_a workspace can view ai_content_library"
on public.ai_content_library for select to authenticated
using (public.has_workspace_access(workspace_id));

create policy "p0_5_a members can insert ai_content_library"
on public.ai_content_library for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and user_id = (select auth.uid())
);

create policy "p0_5_a members can update ai_content_library"
on public.ai_content_library for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0_5_a owners admins delete ai_content_library"
on public.ai_content_library for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0_5_a workspace can view campaigns"
on public.campaigns for select to authenticated
using (public.has_workspace_access(workspace_id));

create policy "p0_5_a members can insert campaigns"
on public.campaigns for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and user_id = (select auth.uid())
);

create policy "p0_5_a members can update campaigns"
on public.campaigns for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0_5_a owners admins delete campaigns"
on public.campaigns for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0_5_a workspace can view campaign_content"
on public.campaign_content for select to authenticated
using (public.has_workspace_access(workspace_id));

create policy "p0_5_a members can insert campaign_content"
on public.campaign_content for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and user_id = (select auth.uid())
  and exists (
    select 1 from public.campaigns c
    where c.id = campaign_id and c.workspace_id = workspace_id
  )
  and (
    content_post_id is null
    or exists (
      select 1 from public.content_posts cp
      where cp.id = content_post_id and cp.workspace_id = workspace_id
    )
  )
);

create policy "p0_5_a members can update campaign_content"
on public.campaign_content for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (
  public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and exists (
    select 1 from public.campaigns c
    where c.id = campaign_id and c.workspace_id = workspace_id
  )
  and (
    content_post_id is null
    or exists (
      select 1 from public.content_posts cp
      where cp.id = content_post_id and cp.workspace_id = workspace_id
    )
  )
);

create policy "p0_5_a owners admins delete campaign_content"
on public.campaign_content for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

commit;
