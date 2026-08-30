#!/usr/bin/env bash
set -euo pipefail
: "${PGPASSWORD:=postgres}"; export PGPASSWORD
H="${PGHOST:-127.0.0.1}"; P="${PGPORT:-5432}"; U="${PGUSER:-postgres}"; A="${PGDATABASE:-postgres}"
M="supabase/migrations/20260829173500_business_scan_history_legacy_boundary.sql"
D="scan_history_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"
cleanup(){ psql -h "$H" -p "$P" -U "$U" -d "$A" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$D' and pid<>pg_backend_pid();" >/dev/null 2>&1 || true; dropdb -h "$H" -p "$P" -U "$U" --if-exists "$D" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for r in anon authenticated service_role sandbox_exec; do psql -h "$H" -p "$P" -U "$U" -d "$A" -v ON_ERROR_STOP=1 -c "do \$\$ begin create role $r nologin; exception when duplicate_object then null; end \$\$;" >/dev/null; done
createdb -h "$H" -p "$P" -U "$U" "$D"

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create type public.app_role as enum ('user','admin','super_admin');
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.user_roles(user_id uuid not null,role public.app_role not null);
create table public.workspaces(id uuid primary key,owner_id uuid not null);
create table public.workspace_members(workspace_id uuid not null,user_id uuid not null,role text not null);
create table public.business_profiles(id uuid primary key,user_id uuid,workspace_id uuid not null,business_name text);
create table public.business_scan_history(
 id uuid primary key,business_id uuid not null,workspace_id uuid not null,triggered_by uuid not null,
 scanned_url text not null,status text not null default 'pending',scan_phase text,created_at timestamptz not null default now()
);
create table public.business_ai_content(id uuid primary key,scan_history_id uuid);
alter table public.business_scan_history enable row level security;
create or replace function public.has_role(_uid uuid,_role public.app_role) returns boolean language sql stable as $$ select exists(select 1 from public.user_roles r where r.user_id=_uid and r.role=_role) $$;
create or replace function public.has_workspace_access(w uuid) returns boolean language sql stable security definer set search_path='' as $$ select (select auth.uid()) is not null and (exists(select 1 from public.workspaces x where x.id=w and x.owner_id=(select auth.uid())) or exists(select 1 from public.workspace_members x where x.workspace_id=w and x.user_id=(select auth.uid()))) $$;
create or replace function public.has_workspace_role(w uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$ select (select auth.uid()) is not null and (exists(select 1 from public.workspaces x where x.id=w and x.owner_id=(select auth.uid()) and 'owner'=any(roles)) or exists(select 1 from public.workspace_members x where x.workspace_id=w and x.user_id=(select auth.uid()) and x.role=any(roles))) $$;
create policy "Admins can manage all business scans" on public.business_scan_history for all to authenticated using(public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));
create policy "Workspace members can view their business scans" on public.business_scan_history for select to authenticated using(public.has_workspace_access(workspace_id));
grant all on public.business_scan_history to anon,authenticated,service_role;
grant select,insert on public.business_scan_history to sandbox_exec;
alter role service_role bypassrls;

insert into public.workspaces values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
insert into public.workspace_members values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','member'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','viewer');
insert into public.user_roles values('99999999-9999-4999-8999-999999999999','admin');
insert into public.business_profiles values('a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Business A');
insert into public.business_scan_history(id,business_id,workspace_id,triggered_by,scanned_url,status,scan_phase)
values
 ('a2111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','https://example.com','completed','completed'),
 ('5f8fbf39-982c-406f-bf76-51f639a6abfb','5e90e4cb-113f-4f32-b5d5-311f550e1176','8b1afa42-9655-4347-8951-236218f1fd56','d87c4aa5-aadf-4510-93a9-e4cd9fc4895b','https://muslimi-digital.in','completed','completed');
SQL

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -f "$M" >/dev/null

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if exists(select 1 from pg_policies where schemaname='public' and tablename='business_scan_history' and (coalesce(qual,'')||' '||coalesce(with_check,'')) ilike '%has_role(%') then raise exception 'platform bypass remains'; end if;
 if has_table_privilege('anon','public.business_scan_history','SELECT') or has_table_privilege('sandbox_exec','public.business_scan_history','SELECT') then raise exception 'anon/sandbox grant remains'; end if;
 if has_table_privilege('authenticated','public.business_scan_history','DELETE') then raise exception 'browser delete should be closed'; end if;
 if (select count(*) from public.business_scan_history where id='5f8fbf39-982c-406f-bf76-51f639a6abfb') <> 1 then raise exception 'legacy orphan was not preserved'; end if;
end $$;
SQL

expect_fail(){
  local sql="$1" label="$2" out
  if ! out="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -c "$sql" 2>&1)"; then
    return 0
  fi
  if printf '%s\n' "$out" | grep -Eq '^(UPDATE|DELETE) 0$'; then
    return 0
  fi
  echo "unexpected success: $label"
  echo "$out"
  exit 1
}

# Platform admin without workspace membership cannot see tenant or legacy scan rows.
platform_count="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='99999999-9999-4999-8999-999999999999'; select count(*) from public.business_scan_history;" | tail -n1)"; [[ "$platform_count" == "0" ]] || exit 1

# Member sees valid workspace scan, but not legacy orphan.
member_count="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333'; select count(*) from public.business_scan_history;" | tail -n1)"; [[ "$member_count" == "1" ]] || exit 1

# Viewer reads but cannot update.
viewer_count="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444'; select count(*) from public.business_scan_history;" | tail -n1)"; [[ "$viewer_count" == "1" ]] || exit 1
expect_fail "set role authenticated; set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444'; update public.business_scan_history set status='failed' where id='a2111111-1111-4111-8111-111111111111';" viewer_update

# Member creates a valid scan in own workspace.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
insert into public.business_scan_history(id,business_id,workspace_id,triggered_by,scanned_url,status)
values('a3111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','https://example.org','pending');
update public.business_scan_history set status='failed' where id='a3111111-1111-4111-8111-111111111111';
commit;
SQL

# New orphan/foreign parent cannot be created.
expect_fail "set role authenticated; set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333'; insert into public.business_scan_history(id,business_id,workspace_id,triggered_by,scanned_url,status) values('a4111111-1111-4111-8111-111111111111','5e90e4cb-113f-4f32-b5d5-311f550e1176','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','https://bad.example','pending');" orphan_insert

# Browser cannot move tenant identity.
expect_fail "set role authenticated; set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333'; update public.business_scan_history set workspace_id='8b1afa42-9655-4347-8951-236218f1fd56' where id='a2111111-1111-4111-8111-111111111111';" workspace_move

# Trusted backend still sees the preserved orphan and can later repair it to a valid parent if explicitly decided.
service_count="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role service_role; select count(*) from public.business_scan_history where id='5f8fbf39-982c-406f-bf76-51f639a6abfb';" | tail -n1)"; [[ "$service_count" == "1" ]] || exit 1
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -c "set role service_role; update public.business_scan_history set workspace_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',business_id='a1111111-1111-4111-8111-111111111111' where id='5f8fbf39-982c-406f-bf76-51f639a6abfb';" >/dev/null

echo "Business scan history legacy boundary verification: PASS"
