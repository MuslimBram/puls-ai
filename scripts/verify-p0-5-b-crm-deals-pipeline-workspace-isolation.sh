#!/usr/bin/env bash
set -euo pipefail
: "${PGPASSWORD:=postgres}"; export PGPASSWORD
H="${PGHOST:-127.0.0.1}"; P="${PGPORT:-5432}"; U="${PGUSER:-postgres}"; A="${PGDATABASE:-postgres}"
M="supabase/migrations/20260829160000_p0_5_b_crm_deals_pipeline_workspace_isolation.sql"
X="p0_5_b_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"; AMB="${X}_amb"; UNM="${X}_unm"; OK="${X}_ok"
cleanup(){ for d in "$AMB" "$UNM" "$OK"; do psql -h "$H" -p "$P" -U "$U" -d "$A" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$d' and pid<>pg_backend_pid();" >/dev/null 2>&1 || true; dropdb -h "$H" -p "$P" -U "$U" --if-exists "$d" >/dev/null 2>&1 || true; done; }; trap cleanup EXIT
for r in anon authenticated service_role sandbox_exec; do psql -h "$H" -p "$P" -U "$U" -d "$A" -v ON_ERROR_STOP=1 -c "do \$\$ begin create role $r nologin; exception when duplicate_object then null; end \$\$;" >/dev/null; done
setup(){
  local d="$1"; createdb -h "$H" -p "$P" -U "$U" "$d"
  psql -h "$H" -p "$P" -U "$U" -d "$d" -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create or replace function public.has_role(uuid,text) returns boolean language sql stable as $$ select true $$;
create table public.workspaces(id uuid primary key,owner_id uuid not null,name text);
create table public.workspace_members(workspace_id uuid not null,user_id uuid not null,role text not null);
create table public.workspace_access_assignments(workspace_id uuid not null,user_id uuid not null,access_role text not null,is_active boolean not null default true,expires_at timestamptz);
create table public.leads(id uuid primary key,workspace_id uuid not null,user_id uuid not null);
create table public.pipeline_stages(id uuid primary key,workspace_id uuid references public.workspaces(id),user_id uuid not null,name text not null,sort_order int not null,color text,is_default boolean default true,created_at timestamptz default now());
create table public.deals(id uuid primary key,workspace_id uuid references public.workspaces(id),user_id uuid not null,stage_id uuid references public.pipeline_stages(id) on delete set null,lead_id uuid references public.leads(id) on delete set null,title text not null,created_at timestamptz default now(),updated_at timestamptz default now());
create or replace function public.has_workspace_access(w uuid) returns boolean language sql stable security definer set search_path='' as $$ select (select auth.uid()) is not null and (exists(select 1 from public.workspaces x where x.id=w and x.owner_id=(select auth.uid())) or exists(select 1 from public.workspace_members x where x.workspace_id=w and x.user_id=(select auth.uid())) or exists(select 1 from public.workspace_access_assignments x where x.workspace_id=w and x.user_id=(select auth.uid()) and x.is_active and (x.expires_at is null or x.expires_at>pg_catalog.now()))) $$;
create or replace function public.has_workspace_role(w uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$ select (select auth.uid()) is not null and (exists(select 1 from public.workspaces x where x.id=w and x.owner_id=(select auth.uid()) and 'owner'=any(roles)) or exists(select 1 from public.workspace_members x where x.workspace_id=w and x.user_id=(select auth.uid()) and x.role=any(roles)) or exists(select 1 from public.workspace_access_assignments x where x.workspace_id=w and x.user_id=(select auth.uid()) and x.is_active and (x.expires_at is null or x.expires_at>pg_catalog.now()) and (case x.access_role when 'business_admin' then 'admin' when 'manager' then 'member' when 'employee' then 'member' when 'freelancer' then 'member' end)=any(roles))) $$;
alter table public.pipeline_stages enable row level security; alter table public.deals enable row level security;
create policy old_stage on public.pipeline_stages for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy old_deal on public.deals for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant all privileges on public.pipeline_stages,public.deals to anon,authenticated,service_role; grant select,insert on public.pipeline_stages,public.deals to sandbox_exec; alter role service_role bypassrls;
insert into public.workspaces values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','A'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','B');
insert into public.workspace_members values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','member'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-3333-3333-333333333333','member'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','viewer'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555','member'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','66666666-6666-6666-6666-666666666666','admin');
insert into public.pipeline_stages values('a1111111-1111-4111-8111-111111111111',null,'11111111-1111-1111-1111-111111111111','A New',0,null,true,now()),('a2222222-2222-4222-8222-222222222222',null,'11111111-1111-1111-1111-111111111111','A Won',1,null,true,now()),('b1111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','B New',0,null,true,now());
insert into public.leads values('c1111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111'),('c2222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222');
insert into public.deals values('d1111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','a1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','A',now(),now()),('d2222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','b1111111-1111-4111-8111-111111111111','c2222222-2222-4222-8222-222222222222','B',now(),now());
SQL
}

setup "$AMB"; psql -h "$H" -p "$P" -U "$U" -d "$AMB" -v ON_ERROR_STOP=1 -c "insert into public.workspaces values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-1111-1111-111111111111','A2');" >/dev/null
if psql -h "$H" -p "$P" -U "$U" -d "$AMB" -v ON_ERROR_STOP=1 -f "$M" >/tmp/p0_5_b_amb.log 2>&1; then exit 1; fi
grep -q 'ambiguous owner workspace mapping' /tmp/p0_5_b_amb.log
setup "$UNM"; psql -h "$H" -p "$P" -U "$U" -d "$UNM" -v ON_ERROR_STOP=1 -c "insert into public.pipeline_stages values('a3333333-3333-4333-8333-333333333333',null,'99999999-9999-4999-8999-999999999999','Orphan',9,null,true,now());" >/dev/null
if psql -h "$H" -p "$P" -U "$U" -d "$UNM" -v ON_ERROR_STOP=1 -f "$M" >/tmp/p0_5_b_unm.log 2>&1; then exit 1; fi
grep -q 'no deterministic owner workspace' /tmp/p0_5_b_unm.log
setup "$OK"; psql -h "$H" -p "$P" -U "$U" -d "$OK" -v ON_ERROR_STOP=1 -f "$M" >/dev/null

psql -h "$H" -p "$P" -U "$U" -d "$OK" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if exists(select 1 from public.pipeline_stages where workspace_id is null) then raise exception 'NULL stage remains'; end if;
 if exists(select 1 from public.deals where workspace_id is null) then raise exception 'NULL deal remains'; end if;
 if exists(select 1 from public.deals d join public.pipeline_stages s on s.id=d.stage_id where d.workspace_id is distinct from s.workspace_id) then raise exception 'stage mismatch'; end if;
 if exists(select 1 from public.deals d join public.leads l on l.id=d.lead_id where d.workspace_id is distinct from l.workspace_id) then raise exception 'lead mismatch'; end if;
 if exists(select 1 from pg_policies where tablename in('deals','pipeline_stages') and coalesce(qual,'') ilike '%has_role(%admin%') then raise exception 'admin bypass'; end if;
 if exists(select 1 from pg_policies where tablename in('deals','pipeline_stages') and cmd='UPDATE' and (qual is null or with_check is null)) then raise exception 'update policy incomplete'; end if;
 if has_table_privilege('anon','public.deals','SELECT') or has_table_privilege('sandbox_exec','public.deals','SELECT') then raise exception 'broad grant'; end if;
end $$;
insert into public.deals values('d3333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','a1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','AX',now(),now()),('d4444444-4444-4444-8444-444444444444','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','b1111111-1111-4111-8111-111111111111','c2222222-2222-4222-8222-222222222222','BX',now(),now());
SQL

viewer_count="$(psql -h "$H" -p "$P" -U "$U" -d "$OK" -Atc "set role authenticated; set request.jwt.claim.sub='44444444-4444-4444-4444-444444444444'; select count(*) from public.deals;")"; [[ "$viewer_count" == "2" ]] || { echo "viewer select failed: $viewer_count"; exit 1; }

psql -h "$H" -p "$P" -U "$U" -d "$OK" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='55555555-5555-5555-5555-555555555555';
insert into public.deals(id,workspace_id,user_id,stage_id,lead_id,title) values('d6666666-6666-4666-8666-666666666666','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555','a1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','M');
update public.deals set title='M2' where id='d6666666-6666-4666-8666-666666666666';
commit;
SQL

expect_fail(){ if psql -h "$H" -p "$P" -U "$U" -d "$OK" -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; then echo "unexpected success: $2"; exit 1; fi; }
expect_fail "set role authenticated; set request.jwt.claim.sub='55555555-5555-5555-5555-555555555555'; insert into public.deals(id,workspace_id,user_id,title) values('d7777777-7777-4777-8777-777777777777','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','55555555-5555-5555-5555-555555555555','F');" foreign_workspace_insert
expect_fail "set role authenticated; set request.jwt.claim.sub='55555555-5555-5555-5555-555555555555'; update public.deals set workspace_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id='d1111111-1111-4111-8111-111111111111';" workspace_move
expect_fail "set role authenticated; set request.jwt.claim.sub='55555555-5555-5555-5555-555555555555'; insert into public.deals(id,workspace_id,user_id,title) values('d8888888-8888-4888-8888-888888888888','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','spoof');" user_spoof
expect_fail "set role authenticated; set request.jwt.claim.sub='55555555-5555-5555-5555-555555555555'; insert into public.deals(id,workspace_id,user_id,stage_id,title) values('d9999999-9999-4999-8999-999999999999','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555','b1111111-1111-4111-8111-111111111111','foreign-stage');" foreign_stage
expect_fail "set role authenticated; set request.jwt.claim.sub='55555555-5555-5555-5555-555555555555'; insert into public.deals(id,workspace_id,user_id,lead_id,title) values('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555','c2222222-2222-4222-8222-222222222222','foreign-lead');" foreign_lead
expect_fail "set role authenticated; set request.jwt.claim.sub='44444444-4444-4444-4444-444444444444'; insert into public.deals(id,workspace_id,user_id,title) values('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','viewer');" viewer_insert
expect_fail "set role authenticated; set request.jwt.claim.sub='44444444-4444-4444-4444-444444444444'; update public.deals set title='viewer' where id='d1111111-1111-4111-8111-111111111111';" viewer_update
expect_fail "set role authenticated; set request.jwt.claim.sub='44444444-4444-4444-4444-444444444444'; delete from public.deals where id='d1111111-1111-4111-8111-111111111111';" viewer_delete
expect_fail "set role authenticated; set request.jwt.claim.sub='55555555-5555-5555-5555-555555555555'; delete from public.deals where id='d6666666-6666-4666-8666-666666666666';" member_delete

platform_count="$(psql -h "$H" -p "$P" -U "$U" -d "$OK" -Atc "set role authenticated; set request.jwt.claim.sub='99999999-9999-4999-8999-999999999999'; select count(*) from public.deals;")"; [[ "$platform_count" == "0" ]] || { echo "platform admin read: $platform_count"; exit 1; }
service_count="$(psql -h "$H" -p "$P" -U "$U" -d "$OK" -Atc "set role service_role; select count(*) from public.deals;")"; [[ "$service_count" =~ ^[1-9][0-9]*$ ]] || { echo "service role access: $service_count"; exit 1; }

echo "P0.5-B CRM deals + pipeline stages verification: PASS"
