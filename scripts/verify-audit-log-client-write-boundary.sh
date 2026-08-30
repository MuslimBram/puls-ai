#!/usr/bin/env bash
set -euo pipefail
: "${PGPASSWORD:=postgres}"; export PGPASSWORD
H="${PGHOST:-127.0.0.1}"; P="${PGPORT:-5432}"; U="${PGUSER:-postgres}"; A="${PGDATABASE:-postgres}"
M="supabase/migrations/20260829163500_audit_log_client_write_boundary.sql"
D="audit_log_boundary_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"
cleanup(){ psql -h "$H" -p "$P" -U "$U" -d "$A" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$D' and pid<>pg_backend_pid();" >/dev/null 2>&1 || true; dropdb -h "$H" -p "$P" -U "$U" --if-exists "$D" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for r in anon authenticated service_role sandbox_exec; do psql -h "$H" -p "$P" -U "$U" -d "$A" -v ON_ERROR_STOP=1 -c "do \$\$ begin create role $r nologin; exception when duplicate_object then null; end \$\$;" >/dev/null; done
createdb -h "$H" -p "$P" -U "$U" "$D"

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create type public.app_role as enum ('user','admin','super_admin');
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.user_roles(user_id uuid not null, role public.app_role not null, unique(user_id,role));
create table public.workspaces(id uuid primary key, owner_id uuid not null);
create table public.audit_logs(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create or replace function public.is_platform_operator()
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.role in ('admin','super_admin')
  )
$$;
create or replace function public.has_workspace_role(_workspace_id uuid, _roles text[])
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.workspaces w
    where w.id=_workspace_id and w.owner_id=(select auth.uid()) and 'owner'=any(_roles)
  )
$$;

create policy "Admins can view all audit logs" on public.audit_logs for select to authenticated
using (exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role='admin'));
create policy "authenticated_insert_own_audit_logs" on public.audit_logs for insert to authenticated
with check (actor_id=auth.uid() and action is not null and length(action)<=200);

grant all privileges on public.audit_logs to anon, authenticated, service_role;
grant select,insert on public.audit_logs to sandbox_exec;
alter role service_role bypassrls;

insert into public.user_roles values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','super_admin'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','user'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','user');
insert into public.workspaces values
 ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('22222222-2222-4222-8222-222222222222','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
SQL

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -f "$M" >/dev/null

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if exists(select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and cmd='INSERT') then raise exception 'direct audit INSERT policy remains'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='p1_audit_logs_select_platform' and cmd='SELECT') then raise exception 'platform audit SELECT policy missing'; end if;
  if has_table_privilege('authenticated','public.audit_logs','INSERT') or has_table_privilege('authenticated','public.audit_logs','UPDATE') or has_table_privilege('authenticated','public.audit_logs','DELETE') then raise exception 'authenticated direct audit mutation remains'; end if;
  if not has_table_privilege('authenticated','public.audit_logs','SELECT') then raise exception 'authenticated audit SELECT grant missing'; end if;
  if has_table_privilege('anon','public.audit_logs','SELECT') or has_table_privilege('sandbox_exec','public.audit_logs','SELECT') then raise exception 'anon/sandbox audit access remains'; end if;
  if not has_table_privilege('service_role','public.audit_logs','SELECT') or not has_table_privilege('service_role','public.audit_logs','INSERT') or not has_table_privilege('service_role','public.audit_logs','UPDATE') or not has_table_privilege('service_role','public.audit_logs','DELETE') then raise exception 'service_role DML contract broken'; end if;
  if has_function_privilege('anon','public.record_client_audit_event(text,text,text,jsonb)','EXECUTE') then raise exception 'anon can execute client audit RPC'; end if;
  if not has_function_privilege('authenticated','public.record_client_audit_event(text,text,text,jsonb)','EXECUTE') then raise exception 'authenticated cannot execute client audit RPC'; end if;
end $$;
SQL

expect_fail(){ if psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; then echo "unexpected success: $2"; exit 1; fi; }

expect_fail "set role authenticated; set request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; insert into public.audit_logs(actor_id,action) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','forged');" direct_insert

# Allowed conversion event for any authenticated user. Client spoof of _source must be overwritten.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select public.record_client_audit_event('conversion.plan_page_view','conversion',null,'{"_source":"system","plan":"pro"}'::jsonb);
commit;
do $$ begin
  if not exists(select 1 from public.audit_logs where actor_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and action='conversion.plan_page_view' and metadata->>'_source'='client_rpc') then raise exception 'conversion audit RPC failed or source spoof survived'; end if;
end $$;
SQL

expect_fail "set role authenticated; set request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; select public.record_client_audit_event('support_session_started','workspace','11111111-1111-4111-8111-111111111111','{}'::jsonb);" forbidden_sensitive_event
expect_fail "set role authenticated; set request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; select public.record_client_audit_event('partner_approved','partner','99999999-9999-4999-8999-999999999999','{}'::jsonb);" non_admin_platform_event
expect_fail "set role authenticated; set request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; select public.record_client_audit_event('payment_accounts_update','workspace','22222222-2222-4222-8222-222222222222','{}'::jsonb);" foreign_workspace_event

# Owner workspace event succeeds.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select public.record_client_audit_event('payment_accounts_update','workspace','11111111-1111-4111-8111-111111111111','{}'::jsonb);
commit;
SQL

# Platform event succeeds for platform admin.
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select public.record_client_audit_event('partner_approved','partner','99999999-9999-4999-8999-999999999999','{}'::jsonb);
commit;
SQL

# Ordinary user cannot read audit rows; super_admin can.
ordinary_count="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atqc "set role authenticated; set request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; select count(*) from public.audit_logs;")"; [[ "$ordinary_count" == "0" ]] || { echo "ordinary audit SELECT leaked: $ordinary_count"; exit 1; }
super_count="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atqc "set role authenticated; set request.jwt.claim.sub='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; select count(*) from public.audit_logs;")"; [[ "$super_count" =~ ^[1-9][0-9]*$ ]] || { echo "super_admin audit SELECT failed: $super_count"; exit 1; }

echo "Audit log client write boundary verification: PASS"
