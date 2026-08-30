begin;

lock table public.user_roles, public.workspaces, public.profiles in share row exclusive mode;

do $$
begin
  if to_regclass('public.user_roles') is null
     or to_regclass('public.workspaces') is null
     or to_regclass('public.profiles') is null then
    raise exception 'Cannot harden platform governance: required tables are missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_roles'
      and policyname = 'Admins can manage roles' and cmd = 'INSERT'
  ) then
    raise exception 'Cannot harden user_roles: expected authenticated INSERT policy is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_roles'
      and policyname = 'Admins can update roles' and cmd = 'UPDATE'
  ) then
    raise exception 'Cannot harden user_roles: expected authenticated UPDATE policy is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_roles'
      and policyname = 'Admins can delete roles' and cmd = 'DELETE'
  ) then
    raise exception 'Cannot harden user_roles: expected authenticated DELETE policy is missing';
  end if;

  if to_regprocedure('public.request_admin_role(uuid)') is null then
    raise exception 'Cannot harden user_roles: canonical request_admin_role(uuid) RPC is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'full_name'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'user_id'
  ) then
    raise exception 'Cannot harden profiles: expected identity columns are missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspaces' and column_name = 'billing_mode'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspaces' and column_name = 'is_demo'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspaces' and column_name = 'referred_by_partner_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspaces' and column_name = 'workspace_owner_partner_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspaces' and column_name = 'owner_id'
  ) then
    raise exception 'Cannot harden workspaces: expected platform-managed columns are missing';
  end if;
end
$$;

-- C1: browser/authenticated role grants and role rewrites are removed. Admin
-- elevation continues through the existing two-person request/approval path;
-- lower-risk operational platform roles use a bounded SECURITY DEFINER RPC.
drop policy if exists "Admins can manage roles" on public.user_roles;
drop policy if exists "Admins can update roles" on public.user_roles;

revoke all privileges on table public.user_roles
  from public, anon, authenticated, sandbox_exec, service_role;
grant select, delete on table public.user_roles to authenticated;
grant select, insert, update, delete on table public.user_roles to service_role;

-- Preserve authenticated revocation, but prevent ordinary admins from deleting
-- protected/global roles such as super_admin, business_owner, partner, or user.
drop policy if exists "Admins can delete roles" on public.user_roles;
drop policy if exists "Admins can delete operational roles" on public.user_roles;
create policy "Admins can delete operational roles"
on public.user_roles
for delete to authenticated
using (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  or (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    and role in (
      'admin'::public.app_role,
      'controller'::public.app_role,
      'worker'::public.app_role,
      'moderator'::public.app_role
    )
  )
);

create or replace function public.grant_platform_operational_role(
  _target_user_id uuid,
  _role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _caller uuid := (select auth.uid());
begin
  if _caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not (
    public.has_role(_caller, 'admin'::public.app_role)
    or public.has_role(_caller, 'super_admin'::public.app_role)
  ) then
    raise exception 'Only platform admins can grant operational platform roles' using errcode = '42501';
  end if;

  if _target_user_id is null then
    raise exception 'Target user is required' using errcode = '22004';
  end if;

  if _role not in (
    'controller'::public.app_role,
    'worker'::public.app_role,
    'moderator'::public.app_role
  ) then
    raise exception 'Role must use the protected admin approval path or is not assignable here' using errcode = '42501';
  end if;

  insert into public.user_roles(user_id, role)
  values (_target_user_id, _role)
  on conflict (user_id, role) do nothing;
end
$$;

revoke all on function public.grant_platform_operational_role(uuid, public.app_role)
  from public, anon, authenticated, service_role;
grant execute on function public.grant_platform_operational_role(uuid, public.app_role)
  to authenticated;

-- Traceability: an ordinary platform admin cannot rewrite their own display
-- identity after being granted the admin role. Normal users remain able to edit
-- their own profile, while super_admin / trusted backend retain repair authority.
create or replace function public.enforce_platform_admin_profile_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  _caller uuid := (select auth.uid());
begin
  if new.full_name is distinct from old.full_name
     and current_user not in ('postgres', 'service_role', 'supabase_admin')
     and _caller is not null
     and old.user_id = _caller
     and public.has_role(_caller, 'admin'::public.app_role)
     and not public.has_role(_caller, 'super_admin'::public.app_role) then
    raise exception 'PLATFORM_ADMIN_IDENTITY_OWNER_MANAGED' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_platform_admin_profile_identity()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_platform_admin_profile_identity on public.profiles;
create trigger trg_enforce_platform_admin_profile_identity
before update of full_name
on public.profiles
for each row
execute function public.enforce_platform_admin_profile_identity();

-- C3: protect only fields with no legitimate tenant-side writer in current source.
-- `payment_mode` is intentionally excluded here because useWorkspacePayment.ts
-- currently exposes an owner workflow for it; that contract must be redesigned
-- separately rather than broken by this migration.
create or replace function public.enforce_workspace_platform_managed_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and not public.is_platform_operator() then
    if new.billing_mode is distinct from old.billing_mode
       or new.is_demo is distinct from old.is_demo
       or new.referred_by_partner_id is distinct from old.referred_by_partner_id
       or new.workspace_owner_partner_id is distinct from old.workspace_owner_partner_id
       or new.owner_id is distinct from old.owner_id then
      raise exception 'Commercial and ownership fields are platform-managed';
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.enforce_workspace_platform_managed_fields()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_workspace_platform_managed_fields on public.workspaces;
create trigger trg_enforce_workspace_platform_managed_fields
before update of billing_mode, is_demo, referred_by_partner_id,
                 workspace_owner_partner_id, owner_id
on public.workspaces
for each row
execute function public.enforce_workspace_platform_managed_fields();

commit;
