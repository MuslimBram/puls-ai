#!/usr/bin/env bash
set -euo pipefail
: "${PGPASSWORD:=postgres}"; export PGPASSWORD
H="${PGHOST:-127.0.0.1}"; P="${PGPORT:-5432}"; U="${PGUSER:-postgres}"; A="${PGDATABASE:-postgres}"
M="supabase/migrations/20260829165000_scan_domain_workspace_boundary.sql"
D="scan_domain_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"
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
create table public.business_profiles(id uuid primary key,workspace_id uuid not null);
create table public.business_scan_history(id uuid primary key,business_id uuid not null,workspace_id uuid not null,triggered_by uuid not null,status text default 'pending');
create table public.business_ai_content(id uuid primary key,business_id uuid not null,scan_history_id uuid,workspace_id uuid not null,generated_by uuid not null,status text default 'draft');
create table public.scan_sources(id uuid primary key,workspace_id uuid not null,user_id uuid not null,business_id uuid,scan_status text default 'pending');
create table public.source_scans(id uuid primary key,source_id uuid not null,user_id uuid not null,workspace_id uuid not null,business_id uuid,status text default 'pending');
create table public.scan_insights(id uuid primary key,source_id uuid not null,workspace_id uuid not null,scan_id uuid not null,user_id uuid not null,business_id uuid,is_important boolean default false);

create or replace function public.has_role(_uid uuid,_role public.app_role) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_roles r where r.user_id=_uid and r.role=_role) $$;
create or replace function public.has_workspace_access(w uuid) returns boolean language sql stable security definer set search_path='' as $$ select (select auth.uid()) is not null and (exists(select 1 from public.workspaces x where x.id=w and x.owner_id=(select auth.uid())) or exists(select 1 from public.workspace_members x where x.workspace_id=w and x.user_id=(select auth.uid()))) $$;
create or replace function public.has_workspace_role(w uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$ select (select auth.uid()) is not null and (exists(select 1 from public.workspaces x where x.id=w and x.owner_id=(select auth.uid()) and 'owner'=any(roles)) or exists(select 1 from public.workspace_members x where x.workspace_id=w and x.user_id=(select auth.uid()) and x.role=any(roles))) $$;

alter table public.business_ai_content enable row level security;
alter table public.scan_sources enable row level security;
alter table public.source_scans enable row level security;
alter table public.scan_insights enable row level security;
create policy "Admins can manage all AI content" on public.business_ai_content for all to authenticated using(public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));
create policy "Workspace members can view AI content" on public.business_ai_content for select to authenticated using(public.has_workspace_access(workspace_id));
create policy "Workspace members can view scan_sources" on public.scan_sources for select to authenticated using(public.has_workspace_access(workspace_id) or public.has_role(auth.uid(),'admin'));
create policy "Workspace members can insert scan_sources" on public.scan_sources for insert to authenticated with check((auth.uid()=user_id and public.has_workspace_access(workspace_id)) or public.has_role(auth.uid(),'admin'));
create policy "Workspace members can update scan_sources" on public.scan_sources for update to authenticated using(public.has_workspace_access(workspace_id) or public.has_role(auth.uid(),'admin')) with check(public.has_workspace_access(workspace_id) or public.has_role(auth.uid(),'admin'));
create policy "Workspace members can delete scan_sources" on public.scan_sources for delete to authenticated using(public.has_workspace_access(workspace_id) or public.has_role(auth.uid(),'admin'));
create policy "Workspace members can view source_scans" on public.source_scans for select to authenticated using(public.has_workspace_access(workspace_id) or public.has_role(auth.uid(),'admin'));
create policy "Workspace members can insert source_scans" on public.source_scans for insert to authenticated with check((auth.uid()=user_id and public.has_workspace_access(workspace_id)) or public.has_role(auth.uid(),'admin'));
create policy "Workspace members can update source_scans" on public.source_scans for update to authenticated using(public.has_workspace_access(workspace_id) or public.has_role(auth.uid(),'admin')) with check(public.has_workspace_access(workspace_id) or public.has_role(auth.uid(),'admin'));
create policy "Workspace members can delete source_scans" on public.source_scans for delete to authenticated using(public.has_workspace_access(workspace_id) or public.has_role(auth.uid(),'admin'));
create policy "Workspace members can view scan_insights" on public.scan_insights for select to authenticated using(public.has_workspace_access(workspace_id) or public.has_role(auth.uid(),'admin'));
create policy "Workspace members can insert scan_insights" on public.scan_insights for insert to authenticated with check((auth.uid()=user_id and public.has_workspace_access(workspace_id)) or public.has_role(auth.uid(),'admin'));
create policy "Workspace members can update scan_insights" on public.scan_insights for update to authenticated using(public.has_workspace_access(workspace_id) or public.has_role(auth.uid(),'admin')) with check(public.has_workspace_access(workspace_id) or public.has_role(auth.uid(),'admin'));
create policy "Workspace members can delete scan_insights" on public.scan_insights for delete to authenticated using(public.has_workspace_access(workspace_id) or public.has_role(auth.uid(),'admin'));

grant all on public.business_ai_content,public.scan_sources,public.source_scans,public.scan_insights to anon,authenticated,service_role;
grant select,insert on public.business_ai_content,public.scan_sources,public.source_scans,public.scan_insights to sandbox_exec;
alter role service_role bypassrls;

insert into public.workspaces values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
insert into public.workspace_members values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','member'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','viewer');
insert into public.user_roles values('99999999-9999-4999-8999-999999999999','admin');
insert into public.business_profiles values
 ('a1111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('b1111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.business_scan_history values('a2111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','completed');
insert into public.scan_sources values
 ('a3111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','active'),
 ('b3111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','b1111111-1111-4111-8111-111111111111','active');
insert into public.source_scans values('a4111111-1111-4111-8111-111111111111','a3111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a1111111-1111-4111-8111-111111111111','completed');
insert into public.scan_insights values('a5111111-1111-4111-8111-111111111111','a3111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a4111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',false);
insert into public.business_ai_content values('a6111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','a2111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','ready');
SQL

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -f "$M" >/dev/null

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if exists(select 1 from pg_policies where schemaname='public' and tablename in ('business_ai_content','scan_sources','source_scans','scan_insights') and (coalesce(qual,'')||' '||coalesce(with_check,'')) ilike '%has_role(%') then raise exception 'platform role bypass remains'; end if;
 if has_table_privilege('anon','public.scan_sources','SELECT') or has_table_privilege('sandbox_exec','public.scan_sources','SELECT') then raise exception 'anon/sandbox scan access remains'; end if;
 if has_table_privilege('authenticated','public.business_ai_content','INSERT') or has_table_privilege('authenticated','public.scan_insights','INSERT') or has_table_privilege('authenticated','public.source_scans','DELETE') then raise exception 'excess browser mutation remains'; end if;
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
platform_count="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='99999999-9999-4999-8999-999999999999'; select count(*) from public.scan_sources;" | tail -n1)"; [[ "$platform_count" == "0" ]] || { echo "platform_count assertion failed: got $platform_count expected 0"; exit 1; }
viewer_count="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444'; select count(*) from public.scan_sources;" | tail -n1)"; [[ "$viewer_count" == "1" ]] || { echo "viewer_count assertion failed: got $viewer_count expected 1"; exit 1; }
expect_fail "set role authenticated; set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444'; update public.scan_sources set scan_status='paused' where id='a3111111-1111-4111-8111-111111111111';" viewer_update

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
insert into public.scan_sources(id,workspace_id,user_id,business_id,scan_status) values('a8111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','a1111111-1111-4111-8111-111111111111','pending');
insert into public.source_scans(id,source_id,user_id,workspace_id,business_id,status) values('a9111111-1111-4111-8111-111111111111','a8111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a1111111-1111-4111-8111-111111111111','pending');
update public.scan_sources set scan_status='error' where id='a8111111-1111-4111-8111-111111111111';
commit;
SQL
expect_fail "set role authenticated; set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333'; insert into public.scan_sources(id,workspace_id,user_id,business_id) values('aa111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','b1111111-1111-4111-8111-111111111111');" cross_workspace_insert
expect_fail "set role authenticated; set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333'; update public.scan_sources set workspace_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id='a3111111-1111-4111-8111-111111111111';" workspace_move
member_visible_count="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333'; select count(*) from public.scan_sources where id='a8111111-1111-4111-8111-111111111111';" | tail -n1)"; [[ "$member_visible_count" == "1" ]] || { echo "member visibility assertion failed: got $member_visible_count expected 1"; exit 1; }
expect_fail "set role authenticated; set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333'; update public.scan_sources set user_id='22222222-2222-4222-8222-222222222222' where id='a8111111-1111-4111-8111-111111111111';" user_move

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role service_role;
insert into public.scan_insights(id,source_id,workspace_id,scan_id,user_id,business_id,is_important)
values('ab111111-1111-4111-8111-111111111111','a3111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a4111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',false);
commit;
SQL
expect_fail "set role service_role; insert into public.scan_insights(id,source_id,workspace_id,scan_id,user_id,business_id) values('ac111111-1111-4111-8111-111111111111','a3111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','a4111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','b1111111-1111-4111-8111-111111111111');" foreign_parent

echo "Scan domain workspace boundary verification: PASS"
