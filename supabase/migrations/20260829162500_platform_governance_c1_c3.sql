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

-- C1: authenticated clients may inspect their permitted role rows and platform
-- admins may revoke roles, but role grants/changes must go through audited
-- SECURITY DEFINER/service-role governance paths.
drop policy if exists "Admins can manage roles" on public.user_roles;
drop policy if exists "Admins can update roles" on public.user_roles;

revoke all privileges on table public.user_roles
  from public, anon, authenticated, sandbox_exec, service_role;
grant select, delete on table public.user_roles to authenticated;
grant select, insert, update, delete on table public.user_roles to service_role;

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
