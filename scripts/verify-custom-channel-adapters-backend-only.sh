#!/usr/bin/env bash
set -euo pipefail
: "${PGPASSWORD:=postgres}"; export PGPASSWORD
H="${PGHOST:-127.0.0.1}"; P="${PGPORT:-5432}"; U="${PGUSER:-postgres}"; A="${PGDATABASE:-postgres}"
M="supabase/migrations/20260829171500_custom_channel_adapters_backend_only.sql"
D="custom_adapters_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"
cleanup(){ psql -h "$H" -p "$P" -U "$U" -d "$A" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$D' and pid<>pg_backend_pid();" >/dev/null 2>&1 || true; dropdb -h "$H" -p "$P" -U "$U" --if-exists "$D" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for r in anon authenticated service_role sandbox_exec; do psql -h "$H" -p "$P" -U "$U" -d "$A" -v ON_ERROR_STOP=1 -c "do \$\$ begin create role $r nologin; exception when duplicate_object then null; end \$\$;" >/dev/null; done
createdb -h "$H" -p "$P" -U "$U" "$D"
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create type public.app_role as enum ('user','admin','super_admin');
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.custom_channel_adapters(
 id uuid primary key default gen_random_uuid(),workspace_id uuid,adapter_name text not null,adapter_key text not null unique,
 provider_api_url text,auth_type text not null,auth_credentials jsonb not null,inbound_mapping jsonb not null default '{}'::jsonb,
 outbound_mapping jsonb not null default '{}'::jsonb,is_active boolean not null default true,created_by uuid,business_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.custom_channel_adapters enable row level security;
create or replace function public.has_role(_uid uuid,_role public.app_role) returns boolean language sql stable as $$ select _uid is not null and _role='admin' $$;
create policy "Admins can manage custom channel adapters" on public.custom_channel_adapters for all to authenticated using(public.has_role(auth.uid(),'admin')) with check(public.has_role(auth.uid(),'admin'));
grant all on public.custom_channel_adapters to anon,authenticated,service_role;
grant select,insert on public.custom_channel_adapters to sandbox_exec;
alter role service_role bypassrls;
SQL
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -f "$M" >/dev/null
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if exists(select 1 from pg_policies where schemaname='public' and tablename='custom_channel_adapters') then raise exception 'browser policy remains'; end if;
 if (select is_nullable from information_schema.columns where table_schema='public' and table_name='custom_channel_adapters' and column_name='workspace_id') <> 'NO' then raise exception 'workspace_id still nullable'; end if;
 if has_table_privilege('anon','public.custom_channel_adapters','SELECT') or has_table_privilege('authenticated','public.custom_channel_adapters','SELECT') or has_table_privilege('sandbox_exec','public.custom_channel_adapters','SELECT') then raise exception 'browser grant remains'; end if;
 if not has_table_privilege('service_role','public.custom_channel_adapters','SELECT') or not has_table_privilege('service_role','public.custom_channel_adapters','INSERT') or not has_table_privilege('service_role','public.custom_channel_adapters','UPDATE') or not has_table_privilege('service_role','public.custom_channel_adapters','DELETE') then raise exception 'service_role DML missing'; end if;
end $$;
SQL
expect_fail(){ if psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; then echo "unexpected success: $2"; exit 1; fi; }
expect_fail "set role authenticated; insert into public.custom_channel_adapters(workspace_id,adapter_name,adapter_key,auth_type,auth_credentials) values(gen_random_uuid(),'x','x','api_key','{\"token\":\"secret\"}'::jsonb);" browser_insert
expect_fail "set role service_role; insert into public.custom_channel_adapters(workspace_id,adapter_name,adapter_key,auth_type,auth_credentials) values(null,'x','x','api_key','{}'::jsonb);" null_workspace
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -c "set role service_role; insert into public.custom_channel_adapters(workspace_id,adapter_name,adapter_key,auth_type,auth_credentials) values(gen_random_uuid(),'x','x','api_key','{}'::jsonb);" >/dev/null
echo "Custom channel adapters backend-only verification: PASS"
