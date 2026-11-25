-- Platform admins can monitor all business-facing operational data, but regular admins must not enumerate platform admins.

-- Business visibility for platform admins.
drop policy if exists "p0 workspace members can view business profiles" on public.business_profiles;
create policy "Platform admins can view all business profiles"
on public.business_profiles
for select
to authenticated
using (
  (select public.has_role((select auth.uid()), 'admin'::public.app_role))
  or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
  or (select public.has_workspace_access(workspace_id))
);

-- Preserve workspace-member access through the same policy while adding platform-admin read access.
drop policy if exists "p0 workspace members can view leads" on public.leads;
create policy "Platform admins and workspace members can view leads"
on public.leads
for select
to authenticated
using (
  (select public.has_role((select auth.uid()), 'admin'::public.app_role))
  or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
  or (select public.has_workspace_access(workspace_id))
);

drop policy if exists "p0 workspace members can view channels" on public.channels;
create policy "Platform admins and workspace members can view channels"
on public.channels
for select
to authenticated
using (
  (select public.has_role((select auth.uid()), 'admin'::public.app_role))
  or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
  or (select public.has_workspace_access(workspace_id))
);

-- Regular platform admins must not enumerate platform roles/admin identities.
drop policy if exists "Admins can view all roles" on public.user_roles;
create policy "Users and owner can view platform roles"
on public.user_roles
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
);

-- Regular admins must not administer the platform-admin role itself.
drop policy if exists "Admins can delete operational roles" on public.user_roles;
create policy "Owner can delete platform roles; admins only operational roles"
on public.user_roles
for delete
to authenticated
using (
  (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
  or (
    (select public.has_role((select auth.uid()), 'admin'::public.app_role))
    and role = any (array['controller'::public.app_role, 'worker'::public.app_role, 'moderator'::public.app_role])
  )
);;
