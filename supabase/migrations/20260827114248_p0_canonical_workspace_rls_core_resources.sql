begin;

-- Canonical workspace authorization helper for role-aware policies.
create or replace function public.has_workspace_role(_user_id uuid, _workspace_id uuid, _roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = _user_id
      and wm.workspace_id = _workspace_id
      and wm.role = any(_roles)
  )
  or exists (
    select 1
    from public.workspaces w
    where w.id = _workspace_id
      and w.owner_id = _user_id
  );
$$;

revoke all on function public.has_workspace_role(uuid, uuid, text[]) from public;
grant execute on function public.has_workspace_role(uuid, uuid, text[]) to authenticated;

-- Remove legacy user_id-only policies from the four core tenant resources.
drop policy if exists "Admins can view all business_profiles" on public.business_profiles;
drop policy if exists "Users can create their own business profiles" on public.business_profiles;
drop policy if exists "Users can delete their own business profiles" on public.business_profiles;
drop policy if exists "Users can update their own business profiles" on public.business_profiles;
drop policy if exists "Users can view their own business profiles" on public.business_profiles;

drop policy if exists "Admins can view all channels" on public.channels;
drop policy if exists "Users can delete own channels" on public.channels;
drop policy if exists "Users can insert own channels" on public.channels;
drop policy if exists "Users can update own channels" on public.channels;
drop policy if exists "Users can view own channels" on public.channels;

drop policy if exists "Users can manage own conversation_threads" on public.conversation_threads;

drop policy if exists "Admins can view all leads" on public.leads;
drop policy if exists "Users can delete own leads" on public.leads;
drop policy if exists "Users can insert own leads" on public.leads;
drop policy if exists "Users can update own leads" on public.leads;
drop policy if exists "Users can view own leads" on public.leads;

-- SELECT: workspace membership is the tenant boundary; platform admins retain visibility.
create policy "workspace members can view business profiles" on public.business_profiles
for select to authenticated
using (public.is_workspace_member(auth.uid(), workspace_id) or public.has_role(auth.uid(), 'admin'::app_role));

create policy "workspace members can view channels" on public.channels
for select to authenticated
using (public.is_workspace_member(auth.uid(), workspace_id) or public.has_role(auth.uid(), 'admin'::app_role));

create policy "workspace members can view conversation threads" on public.conversation_threads
for select to authenticated
using (public.is_workspace_member(auth.uid(), workspace_id) or public.has_role(auth.uid(), 'admin'::app_role));

create policy "workspace members can view leads" on public.leads
for select to authenticated
using (public.is_workspace_member(auth.uid(), workspace_id) or public.has_role(auth.uid(), 'admin'::app_role));

-- INSERT: user must belong to the target workspace; owner/admin/member may create resources.
create policy "workspace members can create business profiles" on public.business_profiles
for insert to authenticated
with check (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']));

create policy "workspace members can create channels" on public.channels
for insert to authenticated
with check (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']));

create policy "workspace members can create conversation threads" on public.conversation_threads
for insert to authenticated
with check (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']));

create policy "workspace members can create leads" on public.leads
for insert to authenticated
with check (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']));

-- UPDATE: members can update; viewers cannot.
create policy "workspace editors can update business profiles" on public.business_profiles
for update to authenticated
using (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']));

create policy "workspace editors can update channels" on public.channels
for update to authenticated
using (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']));

create policy "workspace editors can update conversation threads" on public.conversation_threads
for update to authenticated
using (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']));

create policy "workspace editors can update leads" on public.leads
for update to authenticated
using (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']));

-- DELETE: owner/admin/member may delete resources; viewers cannot.
create policy "workspace editors can delete business profiles" on public.business_profiles
for delete to authenticated
using (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']));

create policy "workspace editors can delete channels" on public.channels
for delete to authenticated
using (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']));

create policy "workspace editors can delete conversation threads" on public.conversation_threads
for delete to authenticated
using (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']));

create policy "workspace editors can delete leads" on public.leads
for delete to authenticated
using (public.has_workspace_role(auth.uid(), workspace_id, array['owner','admin','member']));

commit;
