#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
H="${PGHOST:-127.0.0.1}"
P="${PGPORT:-5432}"
U="${PGUSER:-postgres}"
A="${PGDATABASE:-postgres}"
M="supabase/migrations/20260829161000_registered_assets_platform_bypass_closure.sql"
DB="registered_assets_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"

cleanup() {
  psql -h "$H" -p "$P" -U "$U" -d "$A" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$DB' and pid<>pg_backend_pid();" >/dev/null 2>&1 || true
  dropdb -h "$H" -p "$P" -U "$U" --if-exists "$DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql -h "$H" -p "$P" -U "$U" -d "$A" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  begin create role anon nologin; exception when duplicate_object then null; end;
  begin create role authenticated nologin; exception when duplicate_object then null; end;
  begin create role service_role nologin bypassrls; exception when duplicate_object then null; end;
  begin create role sandbox_exec nologin; exception when duplicate_object then null; end;
end $$;
alter role service_role bypassrls;
SQL

createdb -h "$H" -p "$P" -U "$U" "$DB"

psql -h "$H" -p "$P" -U "$U" -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;

create type public.app_role as enum ('user','business_owner','admin','super_admin');
create table public.workspaces (
  id uuid primary key,
  owner_id uuid not null,
  name text not null
);
create table public.workspace_members (
  workspace_id uuid not null,
  user_id uuid not null,
  role text not null
);
create table public.user_roles (
  user_id uuid not null,
  role public.app_role not null
);

create function public.has_role(_uid uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles ur where ur.user_id=_uid and ur.role=_role)
$$;
create function public.is_workspace_member(_uid uuid, _ws uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workspaces w where w.id=_ws and w.owner_id=_uid)
      or exists(select 1 from public.workspace_members wm where wm.workspace_id=_ws and wm.user_id=_uid)
$$;
create function public.has_workspace_access(_ws uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.is_workspace_member(auth.uid(), _ws)
$$;
create function public.has_workspace_role(_ws uuid, _roles text[])
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.workspaces w where w.id=_ws and w.owner_id=auth.uid() and 'owner'=any(_roles))
    or exists(select 1 from public.workspace_members wm where wm.workspace_id=_ws and wm.user_id=auth.uid() and wm.role=any(_roles))
  )
$$;
revoke all on function public.has_workspace_access(uuid) from public, anon;
revoke all on function public.has_workspace_role(uuid,text[]) from public, anon;
grant execute on function public.has_workspace_access(uuid) to authenticated, service_role;
grant execute on function public.has_workspace_role(uuid,text[]) to authenticated, service_role;

create table public.registered_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  asset_type text not null,
  asset_identifier text not null,
  asset_name text,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid,
  deactivation_reason text,
  registered_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.registered_assets enable row level security;

create policy "Admins can update assets" on public.registered_assets
for update to authenticated
using (public.has_role(auth.uid(),'super_admin'::public.app_role) or public.has_role(auth.uid(),'business_owner'::public.app_role));
create policy "Authenticated users can register assets" on public.registered_assets
for insert to authenticated with check (registered_by=auth.uid());
create policy "Workspace members can view assets" on public.registered_assets
for select to authenticated
using (public.is_workspace_member(auth.uid(),workspace_id) or public.has_role(auth.uid(),'admin'::public.app_role) or public.has_role(auth.uid(),'super_admin'::public.app_role));
grant all privileges on public.registered_assets to anon, authenticated, service_role;
grant select, insert on public.registered_assets to sandbox_exec;

insert into public.workspaces values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','A'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','B');
insert into public.workspace_members values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','member'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','viewer'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','admin');
insert into public.user_roles values
 ('55555555-5555-4555-8555-555555555555','business_owner'),
 ('66666666-6666-4666-8666-666666666666','admin'),
 ('77777777-7777-4777-8777-777777777777','super_admin');
insert into public.registered_assets(id,workspace_id,asset_type,asset_identifier,asset_name,registered_by)
values ('90000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','domain','example.test','A asset','11111111-1111-4111-8111-111111111111');
SQL

psql -h "$H" -p "$P" -U "$U" -d "$DB" -v ON_ERROR_STOP=1 -f "$M" >/dev/null

psql -h "$H" -p "$P" -U "$U" -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare r text; p text;
begin
  if (select count(*) from pg_policies where schemaname='public' and tablename='registered_assets') <> 3 then
    raise exception 'expected exactly 3 registered_assets policies';
  end if;
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='registered_assets'
      and (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ '(has_role|business_owner|super_admin)'
  ) then raise exception 'platform/business-owner bypass remains'; end if;
  foreach r in array array['anon','sandbox_exec'] loop
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(r,'public.registered_assets',p) then raise exception '% retains %',r,p; end if;
    end loop;
  end loop;
  foreach r in array array['authenticated','service_role'] loop
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if not has_table_privilege(r,'public.registered_assets',p) then raise exception '% missing %',r,p; end if;
    end loop;
    foreach p in array array['TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(r,'public.registered_assets',p) then raise exception '% retains excessive %',r,p; end if;
    end loop;
  end loop;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='registered_assets' and t.tgname='trg_registered_assets_identity_immutability' and not t.tgisinternal
  ) then raise exception 'identity immutability trigger missing'; end if;
end $$;
SQL

as_user(){ local uid="$1"; local sql="$2"; psql -h "$H" -p "$P" -U "$U" -d "$DB" -qAt -v ON_ERROR_STOP=1 -c "set role authenticated; set request.jwt.claim.sub='$uid'; $sql"; }
expect_value(){ local uid="$1" sql="$2" expected="$3" label="$4" out; out="$(as_user "$uid" "$sql")"; [[ "$out" == "$expected" ]] || { echo "ERROR: $label expected $expected got $out"; exit 1; }; }
expect_fail(){ local uid="$1" sql="$2" label="$3"; if as_user "$uid" "$sql" >/dev/null 2>&1; then echo "ERROR: $label unexpectedly succeeded"; exit 1; fi; }

OWNER='11111111-1111-4111-8111-111111111111'
MEMBER='33333333-3333-4333-8333-333333333333'
VIEWER='44444444-4444-4444-8444-444444444444'
BOWNER='55555555-5555-4555-8555-555555555555'
PADM='66666666-6666-4666-8666-666666666666'
PSUP='77777777-7777-4777-8777-777777777777'
WA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
WB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

expect_value "$OWNER" "select count(*) from public.registered_assets;" "1" "owner select"
expect_value "$MEMBER" "select count(*) from public.registered_assets;" "1" "member select"
expect_value "$VIEWER" "select count(*) from public.registered_assets;" "1" "viewer select"
expect_value "$BOWNER" "select count(*) from public.registered_assets;" "0" "business_owner standing read"
expect_value "$PADM" "select count(*) from public.registered_assets;" "0" "platform admin standing read"
expect_value "$PSUP" "select count(*) from public.registered_assets;" "0" "super_admin standing read"

as_user "$MEMBER" "insert into public.registered_assets(workspace_id,asset_type,asset_identifier,registered_by) values('$WA','domain','member.test','$MEMBER');" >/dev/null
expect_fail "$MEMBER" "insert into public.registered_assets(workspace_id,asset_type,asset_identifier,registered_by) values('$WB','domain','foreign.test','$MEMBER');" "foreign workspace insert"
expect_fail "$MEMBER" "insert into public.registered_assets(workspace_id,asset_type,asset_identifier,registered_by) values('$WA','domain','spoof.test','$OWNER');" "registered_by spoof"
expect_fail "$VIEWER" "insert into public.registered_assets(workspace_id,asset_type,asset_identifier,registered_by) values('$WA','domain','viewer.test','$VIEWER');" "viewer insert"

expect_value "$MEMBER" "with u as (update public.registered_assets set asset_name='member-change' where id='90000000-0000-4000-8000-000000000001' returning 1) select count(*) from u;" "0" "member update denied"
expect_value "$BOWNER" "with u as (update public.registered_assets set asset_name='cross-tenant' where id='90000000-0000-4000-8000-000000000001' returning 1) select count(*) from u;" "0" "business_owner cross-tenant update denied"
as_user "$OWNER" "update public.registered_assets set asset_name='owner-change' where id='90000000-0000-4000-8000-000000000001';" >/dev/null
expect_fail "$OWNER" "update public.registered_assets set workspace_id='$WB' where id='90000000-0000-4000-8000-000000000001';" "workspace move"
expect_fail "$OWNER" "update public.registered_assets set registered_by='$MEMBER' where id='90000000-0000-4000-8000-000000000001';" "registered_by move"
expect_value "$OWNER" "with d as (delete from public.registered_assets where id='90000000-0000-4000-8000-000000000001' returning 1) select count(*) from d;" "0" "browser delete remains denied"

service_count="$(psql -h "$H" -p "$P" -U "$U" -d "$DB" -qAt -v ON_ERROR_STOP=1 -c "set role service_role; select count(*) from public.registered_assets;")"
[[ "$service_count" =~ ^[1-9][0-9]*$ ]] || { echo "ERROR: service_role cannot read assets"; exit 1; }

echo "registered_assets platform bypass closure: PASS"
