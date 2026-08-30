#!/usr/bin/env bash
set -euo pipefail
: "${PGPASSWORD:=postgres}"; export PGPASSWORD
H="${PGHOST:-127.0.0.1}"; P="${PGPORT:-5432}"; U="${PGUSER:-postgres}"; A="${PGDATABASE:-postgres}"
M="supabase/migrations/20260829162500_platform_governance_c1_c3.sql"
D="platform_governance_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"
cleanup(){ psql -h "$H" -p "$P" -U "$U" -d "$A" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$D' and pid<>pg_backend_pid();" >/dev/null 2>&1 || true; dropdb -h "$H" -p "$P" -U "$U" --if-exists "$D" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for r in anon authenticated service_role sandbox_exec; do psql -h "$H" -p "$P" -U "$U" -d "$A" -v ON_ERROR_STOP=1 -c "do \$\$ begin create role $r nologin; exception when duplicate_object then null; end \$\$;" >/dev/null; done
createdb -h "$H" -p "$P" -U "$U" "$D"

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create type public.app_role as enum ('user','business_owner','admin','super_admin','controller','worker','moderator','support_agent','staff','accountant');
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.user_roles(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  unique(user_id, role)
);
create table public.profiles(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_suspended boolean default false
);
create table public.workspaces(
  id uuid primary key,
  name text not null,
  slug text,
  owner_id uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  referred_by_partner_id uuid,
  billing_mode text,
  payment_mode text,
  payment_accounts jsonb default '{}'::jsonb,
  workspace_owner_partner_id uuid,
  require_2fa boolean default false,
  max_sessions_per_user int default 5,
  is_demo boolean default false,
  region text
);

alter table public.user_roles enable row level security;
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;

create or replace function public.has_role(_uid uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles ur where ur.user_id=_uid and ur.role=_role)
$$;
create or replace function public.is_platform_operator()
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.role in ('admin','super_admin')
  )
$$;

create policy "Admins can view all roles" on public.user_roles for select to authenticated
using (auth.uid()=user_id or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));
create policy "Admins can manage roles" on public.user_roles for insert to authenticated
with check (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'admin'));
create policy "Admins can update roles" on public.user_roles for update to authenticated
using (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'admin'))
with check (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'admin'));
create policy "Admins can delete roles" on public.user_roles for delete to authenticated
using (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'admin'));
create policy "Users can update own profile" on public.profiles for update to authenticated
using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Users can view own profile" on public.profiles for select to authenticated
using (auth.uid()=user_id);
create policy "Owners can view their workspaces" on public.workspaces for select to authenticated
using (owner_id=auth.uid() or public.is_platform_operator());
create policy "Owners can update their workspaces" on public.workspaces for update to authenticated
using (owner_id=auth.uid()) with check (owner_id=auth.uid());

-- Canonical admin elevation RPC is an earlier migration dependency. The
-- isolated fixture only needs its signature; admin grant behavior is exercised
-- independently through test_grant_admin below.
create or replace function public.request_admin_role(_target_user_id uuid)
returns uuid language sql security definer set search_path='' as $$
  select gen_random_uuid()
$$;
grant execute on function public.request_admin_role(uuid) to authenticated;

create or replace function public.test_grant_admin(_target uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.user_roles(user_id,role) values (_target,'admin') on conflict do nothing;
end $$;
grant execute on function public.test_grant_admin(uuid) to authenticated;

insert into public.user_roles(user_id,role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','user'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','user'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','admin'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','super_admin');
insert into public.profiles(user_id,full_name,avatar_url) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Admin Name','admin-old.png'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','User Name','user-old.png'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Owner Name','owner-old.png');
insert into public.workspaces(id,name,slug,owner_id,billing_mode,payment_mode,is_demo,require_2fa)
values
 ('11111111-1111-4111-8111-111111111111','Owner workspace','owner','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','direct','platform',false,false),
 ('22222222-2222-4222-8222-222222222222','Admin-owned workspace','admin-owned','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','direct','platform',false,false);

grant all privileges on public.user_roles, public.profiles, public.workspaces to anon, authenticated, service_role;
grant select,insert on public.user_roles to sandbox_exec;
alter role service_role bypassrls;
SQL

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -f "$M" >/dev/null

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if exists(select 1 from pg_policies where schemaname='public' and tablename='user_roles' and cmd in ('INSERT','UPDATE')) then raise exception 'direct role-grant/update policy remains'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='user_roles' and policyname='Admins can delete operational roles' and cmd='DELETE') then raise exception 'bounded authenticated role-revoke policy missing'; end if;
  if has_table_privilege('authenticated','public.user_roles','INSERT') or has_table_privilege('authenticated','public.user_roles','UPDATE') then raise exception 'authenticated direct role grant/update remains'; end if;
  if not has_table_privilege('authenticated','public.user_roles','SELECT') or not has_table_privilege('authenticated','public.user_roles','DELETE') then raise exception 'authenticated role read/revoke contract broken'; end if;
  if has_table_privilege('anon','public.user_roles','SELECT') or has_table_privilege('sandbox_exec','public.user_roles','SELECT') then raise exception 'browser/sandbox excess role grant remains'; end if;
  if not has_table_privilege('service_role','public.user_roles','SELECT') or not has_table_privilege('service_role','public.user_roles','INSERT') or not has_table_privilege('service_role','public.user_roles','UPDATE') or not has_table_privilege('service_role','public.user_roles','DELETE') then raise exception 'service_role DML contract broken'; end if;
  if not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='grant_platform_operational_role' and prosecdef=true and proconfig::text like '%search_path=%') then raise exception 'bounded operational role RPC missing or unsafe'; end if;
  if not has_function_privilege('authenticated','public.grant_platform_operational_role(uuid,public.app_role)','EXECUTE') then raise exception 'authenticated operational role RPC grant missing'; end if;
  if has_function_privilege('anon','public.grant_platform_operational_role(uuid,public.app_role)','EXECUTE') then raise exception 'anon can execute operational role RPC'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass and tgname='trg_enforce_platform_admin_profile_identity' and not tgisinternal) then raise exception 'admin identity guard missing'; end if;
  if not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='enforce_platform_admin_profile_identity' and prosecdef=false and proconfig::text like '%search_path=%') then raise exception 'admin identity guard must be SECURITY INVOKER with fixed search_path'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.workspaces'::regclass and tgname='trg_enforce_workspace_platform_managed_fields' and not tgisinternal) then raise exception 'workspace commercial guard missing'; end if;
  if not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='enforce_workspace_platform_managed_fields' and prosecdef=false and proconfig::text like '%search_path=%') then raise exception 'workspace guard must be SECURITY INVOKER with fixed search_path'; end if;
end $$;
SQL

expect_error(){
  local sql="$1" label="$2" output
  if output=$(psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -c "$sql" 2>&1); then
    echo "unexpected success: $label"
    echo "$output"
    exit 1
  fi
}

expect_error "set role authenticated; set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; insert into public.user_roles(user_id,role) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','admin');" direct_admin_insert
expect_error "set role authenticated; set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; update public.user_roles set role='controller' where user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';" direct_admin_update
expect_error "set role authenticated; set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; update public.profiles set full_name='Changed Admin' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';" admin_self_identity
expect_error "set role authenticated; set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; select public.grant_platform_operational_role('cccccccc-cccc-4ccc-8ccc-cccccccccccc','admin');" operational_rpc_cannot_grant_admin

# Bounded operational role grant remains functional for platform admins.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select public.grant_platform_operational_role('cccccccc-cccc-4ccc-8ccc-cccccccccccc','controller');
commit;
do $$ begin if not exists(select 1 from public.user_roles where user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and role='controller') then raise exception 'operational role RPC broken'; end if; end $$;
SQL

# Existing SECURITY DEFINER admin grant path remains functional.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select public.test_grant_admin('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
commit;
do $$ begin if not exists(select 1 from public.user_roles where user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and role='admin') then raise exception 'SECURITY DEFINER grant path broken'; end if; end $$;
SQL

# Admin can still change non-identity profile fields.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.profiles set avatar_url='admin-new.png' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
commit;
SQL

# Normal users keep their ordinary self-profile edit contract.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update public.profiles set full_name='Renamed User' where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
commit;
SQL

# super_admin is the owner-level repair authority and is not self-locked.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
update public.profiles set full_name='Owner Renamed' where user_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
commit;
SQL

# Trusted backend can repair an admin identity when explicitly required.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role service_role;
update public.profiles set full_name='Admin Corrected' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
commit;
SQL

# Current tenant controls, including payment_mode, remain usable and hit the row.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update public.workspaces set name='Renamed', require_2fa=true, payment_mode='external' where id='11111111-1111-4111-8111-111111111111';
commit;
do $$ begin
  if not exists(select 1 from public.workspaces where id='11111111-1111-4111-8111-111111111111' and name='Renamed' and require_2fa=true and payment_mode='external') then
    raise exception 'owner workspace update did not hit the fixture row';
  end if;
end $$;
SQL

expect_error "set role authenticated; set request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; update public.workspaces set billing_mode='partner_billed' where id='11111111-1111-4111-8111-111111111111';" owner_billing_mode
expect_error "set role authenticated; set request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; update public.workspaces set is_demo=true where id='11111111-1111-4111-8111-111111111111';" owner_demo
expect_error "set role authenticated; set request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; update public.workspaces set owner_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' where id='11111111-1111-4111-8111-111111111111';" owner_transfer

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if not exists(
    select 1 from public.workspaces
    where id='11111111-1111-4111-8111-111111111111'
      and billing_mode='direct' and is_demo=false
      and owner_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ) then raise exception 'protected workspace field changed despite denial'; end if;
end $$;
SQL

# Platform operator authorized by the row policy is not blocked.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.workspaces set billing_mode='partner_billed' where id='22222222-2222-4222-8222-222222222222';
commit;
do $$ begin if not exists(select 1 from public.workspaces where id='22222222-2222-4222-8222-222222222222' and billing_mode='partner_billed') then raise exception 'platform operator workspace update failed'; end if; end $$;
SQL

# Trusted backend remains able to manage platform-owned fields.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role service_role;
update public.workspaces set billing_mode='backend-managed' where id='11111111-1111-4111-8111-111111111111';
commit;
do $$ begin if not exists(select 1 from public.workspaces where id='11111111-1111-4111-8111-111111111111' and billing_mode='backend-managed') then raise exception 'service role workspace update failed'; end if; end $$;
SQL

echo "Platform governance C1/C3 verification: PASS"
