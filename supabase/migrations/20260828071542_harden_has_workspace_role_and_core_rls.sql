begin;

-- Remove policies that depend on the legacy arbitrary-user helper signature.
drop policy if exists "workspace editors can delete business profiles" on public.business_profiles;
drop policy if exists "workspace editors can update business profiles" on public.business_profiles;
drop policy if exists "workspace members can create business profiles" on public.business_profiles;
drop policy if exists "workspace members can view business profiles" on public.business_profiles;

drop policy if exists "workspace editors can delete channels" on public.channels;
drop policy if exists "workspace editors can update channels" on public.channels;
drop policy if exists "workspace members can create channels" on public.channels;
drop policy if exists "workspace members can view channels" on public.channels;

drop policy if exists "workspace editors can delete leads" on public.leads;
drop policy if exists "workspace editors can update leads" on public.leads;
drop policy if exists "workspace members can create leads" on public.leads;
drop policy if exists "workspace members can view leads" on public.leads;

drop policy if exists "workspace editors can delete conversation threads" on public.conversation_threads;
drop policy if exists "workspace editors can update conversation threads" on public.conversation_threads;
drop policy if exists "workspace members can create conversation threads" on public.conversation_threads;
drop policy if exists "workspace members can view conversation threads" on public.conversation_threads;

-- The old helper can now be removed because all dependent policies are gone.
drop function if exists public.has_workspace_role(uuid, uuid, text[]);

-- Caller-bound browser helper. The caller identity is always auth.uid().
create function public.has_workspace_role(_workspace_id uuid, _roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.workspaces w
        where w.id = _workspace_id
          and w.owner_id = (select auth.uid())
          and 'owner' = any(_roles)
      )
      or exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = _workspace_id
          and wm.user_id = (select auth.uid())
          and wm.role = any(_roles)
      )
      or exists (
        select 1
        from public.workspace_access_assignments waa
        where waa.workspace_id = _workspace_id
          and waa.user_id = (select auth.uid())
          and waa.is_active
          and (waa.expires_at is null or waa.expires_at > pg_catalog.now())
          and (
            case waa.access_role::text
              when 'business_admin' then 'admin'
              when 'manager' then 'member'
              when 'employee' then 'member'
              when 'freelancer' then 'member'
            end
          ) = any(_roles)
      )
    );
$$;

-- Explicit-user helper is backend-only and never browser-callable.
create function public.has_workspace_role_for_user(_user_id uuid, _workspace_id uuid, _roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    _user_id is not null
    and (
      exists (
        select 1
        from public.workspaces w
        where w.id = _workspace_id
          and w.owner_id = _user_id
          and 'owner' = any(_roles)
      )
      or exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = _workspace_id
          and wm.user_id = _user_id
          and wm.role = any(_roles)
      )
      or exists (
        select 1
        from public.workspace_access_assignments waa
        where waa.workspace_id = _workspace_id
          and waa.user_id = _user_id
          and waa.is_active
          and (waa.expires_at is null or waa.expires_at > pg_catalog.now())
          and (
            case waa.access_role::text
              when 'business_admin' then 'admin'
              when 'manager' then 'member'
              when 'employee' then 'member'
              when 'freelancer' then 'member'
            end
          ) = any(_roles)
      )
    );
$$;

revoke all on function public.has_workspace_role(uuid, text[]) from public, anon, authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated, service_role;

revoke all on function public.has_workspace_role_for_user(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.has_workspace_role_for_user(uuid, uuid, text[]) to service_role;

-- Workspace-authorized SELECT. Platform admins have no automatic private-data bypass.
create policy "p0 workspace members can view business profiles"
on public.business_profiles for select to authenticated
using (public.has_workspace_access(workspace_id));

create policy "p0 workspace members can view channels"
on public.channels for select to authenticated
using (public.has_workspace_access(workspace_id));

create policy "p0 workspace members can view leads"
on public.leads for select to authenticated
using (public.has_workspace_access(workspace_id));

create policy "p0 workspace members can view conversation threads"
on public.conversation_threads for select to authenticated
using (public.has_workspace_access(workspace_id));

-- business_profiles: owner/admin only for writes.
create policy "p0 owners and admins can create business profiles"
on public.business_profiles for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 owners and admins can update business profiles"
on public.business_profiles for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']))
with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 owners and admins can delete business profiles"
on public.business_profiles for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

-- channels: owner/admin only for writes. Edge Functions/integrations are untouched.
create policy "p0 owners and admins can create channels"
on public.channels for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 owners and admins can update channels"
on public.channels for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']))
with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 owners and admins can delete channels"
on public.channels for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

-- leads: member can create/update, but only owner/admin can delete.
create policy "p0 workspace members can create leads"
on public.leads for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 workspace members can update leads"
on public.leads for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 owners and admins can delete leads"
on public.leads for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

-- conversation_threads: member can create/update, but only owner/admin can delete.
create policy "p0 workspace members can create conversation threads"
on public.conversation_threads for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 workspace members can update conversation threads"
on public.conversation_threads for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 owners and admins can delete conversation threads"
on public.conversation_threads for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

commit;
