#!/usr/bin/env bash
set -euo pipefail
: "${PGPASSWORD:=postgres}"; export PGPASSWORD
H="${PGHOST:-127.0.0.1}"; P="${PGPORT:-5432}"; U="${PGUSER:-postgres}"; A="${PGDATABASE:-postgres}"
M="supabase/migrations/20260829172500_platform_reference_backend_only.sql"
D="platform_ref_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"
cleanup(){ psql -h "$H" -p "$P" -U "$U" -d "$A" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$D' and pid<>pg_backend_pid();" >/dev/null 2>&1 || true; dropdb -h "$H" -p "$P" -U "$U" --if-exists "$D" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for r in anon authenticated service_role sandbox_exec; do psql -h "$H" -p "$P" -U "$U" -d "$A" -v ON_ERROR_STOP=1 -c "do \$\$ begin create role $r nologin; exception when duplicate_object then null; end \$\$;" >/dev/null; done
createdb -h "$H" -p "$P" -U "$U" "$D"
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create type public.app_role as enum ('user','admin','super_admin');
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.vault_secret_refs(
 id uuid primary key default gen_random_uuid(),workspace_id uuid,integration_key text not null,label text,
 vault_secret_name text not null unique,created_by uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.vault_secret_refs enable row level security;
create or replace function public.has_role(_uid uuid,_role public.app_role) returns boolean language sql stable as $$ select _uid is not null and _role in ('admin','super_admin') $$;
create or replace function public.is_workspace_owner(_uid uuid,_workspace uuid) returns boolean language sql stable as $$ select false $$;
create policy "Workspace owners and admins can manage vault refs" on public.vault_secret_refs for all to authenticated
using(public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin') or (workspace_id is not null and public.is_workspace_owner(auth.uid(),workspace_id)))
with check(public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin') or (workspace_id is not null and public.is_workspace_owner(auth.uid(),workspace_id)));
grant all on public.vault_secret_refs to anon,authenticated,service_role;
grant select,insert on public.vault_secret_refs to sandbox_exec;
alter role service_role bypassrls;
insert into public.vault_secret_refs(workspace_id,integration_key,vault_secret_name) values(null,'telegram_bot_token','global_provider_reference');
SQL
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -f "$M" >/dev/null
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if exists(select 1 from pg_policies where schemaname='public' and tablename='vault_secret_refs') then raise exception 'browser policy remains'; end if;
 if has_table_privilege('anon','public.vault_secret_refs','SELECT') or has_table_privilege('authenticated','public.vault_secret_refs','SELECT') or has_table_privilege('sandbox_exec','public.vault_secret_refs','SELECT') then raise exception 'browser access remains'; end if;
 if not has_table_privilege('service_role','public.vault_secret_refs','SELECT') or not has_table_privilege('service_role','public.vault_secret_refs','INSERT') or not has_table_privilege('service_role','public.vault_secret_refs','UPDATE') or not has_table_privilege('service_role','public.vault_secret_refs','DELETE') then raise exception 'service role DML missing'; end if;
 if (select count(*) from public.vault_secret_refs where workspace_id is null) <> 1 then raise exception 'global reference not preserved'; end if;
end $$;
SQL
expect_fail(){ if psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; then echo "unexpected success: $2"; exit 1; fi; }
expect_fail "set role authenticated; select * from public.vault_secret_refs;" browser_select
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -c "set role service_role; select count(*) from public.vault_secret_refs;" >/dev/null
echo "Platform reference backend-only verification: PASS"
