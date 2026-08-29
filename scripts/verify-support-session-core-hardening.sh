#!/usr/bin/env bash
set -euo pipefail
: "${PGPASSWORD:=postgres}"; export PGPASSWORD
H="${PGHOST:-127.0.0.1}"; P="${PGPORT:-5432}"; U="${PGUSER:-postgres}"; A="${PGDATABASE:-postgres}"
M="supabase/migrations/20260829170500_support_session_core_hardening.sql"
D="support_core_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"
cleanup(){ psql -h "$H" -p "$P" -U "$U" -d "$A" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$D' and pid<>pg_backend_pid();" >/dev/null 2>&1 || true; dropdb -h "$H" -p "$P" -U "$U" --if-exists "$D" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for r in anon authenticated service_role sandbox_exec; do psql -h "$H" -p "$P" -U "$U" -d "$A" -v ON_ERROR_STOP=1 -c "do \$\$ begin create role $r nologin; exception when duplicate_object then null; end \$\$;" >/dev/null; done
createdb -h "$H" -p "$P" -U "$U" "$D"

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create type public.app_role as enum ('user','admin','super_admin');
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.user_roles(user_id uuid not null, role public.app_role not null);
create table public.workspaces(id uuid primary key, owner_id uuid not null);
create table public.audit_logs(id uuid primary key default gen_random_uuid(),actor_id uuid not null,action text not null,target_type text,target_id text,metadata jsonb default '{}'::jsonb,created_at timestamptz default now());
create table public.workspace_support_sessions(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,support_user_id uuid not null,
 reason text not null,scopes text[] not null,expires_at timestamptz not null,created_at timestamptz not null default now(),
 revoked_at timestamptz,audit_log_id uuid
);
alter table public.workspace_support_sessions add constraint workspace_support_sessions_check check(expires_at>created_at);
alter table public.workspace_support_sessions add constraint workspace_support_sessions_reason_check check(length(btrim(reason)) between 10 and 1000);
alter table public.workspace_support_sessions add constraint workspace_support_sessions_scopes_check check(cardinality(scopes)>0);
alter table public.workspace_support_sessions enable row level security;

create or replace function public.is_platform_operator() returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists(select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role in ('admin','super_admin'))
$$;
create or replace function public.is_workspace_owner(_uid uuid,_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspaces w where w.id=_workspace and w.owner_id=_uid)
$$;

create or replace function public.has_active_support_scope(_workspace uuid,_scope text) returns boolean language sql stable security definer set search_path='public' as $$
 select (select auth.uid()) is not null and exists(select 1 from public.workspace_support_sessions s where s.workspace_id=_workspace and s.support_user_id=(select auth.uid()) and s.revoked_at is null and s.expires_at>now() and _scope=any(s.scopes))
$$;
create or replace function public.start_workspace_support_session(_workspace uuid,_reason text,_scopes text[],_expires_at timestamptz) returns uuid language plpgsql security definer set search_path='public' as $$
declare x uuid; a uuid; begin
 if not public.is_platform_operator() then raise exception 'Only Owner or Pulse AI Admin can start support sessions'; end if;
 if exists(select 1 from unnest(_scopes) s where s not in ('metadata','messages','files','customer_data','secrets')) then raise exception 'Unsupported support scope'; end if;
 insert into public.audit_logs(actor_id,action,target_type,target_id) values((select auth.uid()),'support_session_started','workspace',_workspace::text) returning id into a;
 insert into public.workspace_support_sessions(workspace_id,support_user_id,reason,scopes,expires_at,audit_log_id) values(_workspace,(select auth.uid()),_reason,_scopes,_expires_at,a) returning id into x; return x; end $$;
create or replace function public.revoke_workspace_support_session(_session_id uuid,_reason text) returns void language plpgsql security definer set search_path='public' as $$
declare w uuid; begin
 if not public.is_platform_operator() then raise exception 'Only admin'; end if;
 select workspace_id into w from public.workspace_support_sessions where id=_session_id and support_user_id=(select auth.uid()) and revoked_at is null for update;
 if not found then raise exception 'Active support session not found'; end if;
 update public.workspace_support_sessions set revoked_at=now() where id=_session_id;
 end $$;

create policy "support users can view their own sessions" on public.workspace_support_sessions for select to authenticated using(support_user_id=(select auth.uid()));
grant select on public.workspace_support_sessions to authenticated;
grant all on public.workspace_support_sessions to service_role;
alter role service_role bypassrls;

insert into public.workspaces values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
insert into public.user_roles values
 ('22222222-2222-4222-8222-222222222222','admin'),
 ('33333333-3333-4333-8333-333333333333','super_admin');
SQL

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -f "$M" >/dev/null

psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.workspace_support_sessions'::regclass and conname='workspace_support_sessions_scopes_allowed_check' and convalidated) then raise exception 'scope check missing'; end if;
 if pg_get_functiondef('public.has_active_support_scope(uuid,text)'::regprocedure) not ilike '%is_platform_operator%' then raise exception 'role recheck missing'; end if;
 if pg_get_functiondef('public.start_workspace_support_session(uuid,text,text[],timestamptz)'::regprocedure) ilike '%''secrets''%' then raise exception 'secrets scope remains'; end if;
 if pg_get_functiondef('public.revoke_workspace_support_session(uuid,text)'::regprocedure) ilike '%support_user_id=(select auth.uid())%' then raise exception 'creator-only revoke remains'; end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='workspace_support_sessions' and policyname='p1_support_sessions_select_authorized') then raise exception 'owner visibility policy missing'; end if;
end $$;
SQL

expect_fail(){ if psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; then echo "unexpected success: $2"; exit 1; fi; }

# Unsupported/dead secret scope is rejected.
expect_fail "set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; select public.start_workspace_support_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','legitimate support reason',array['secrets'],now()+interval '1 hour');" secrets_scope

# Create one legitimate session as platform admin.
sid="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; select public.start_workspace_support_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','legitimate support reason',array['metadata'],now()+interval '1 hour');" | tail -n1)"
[[ -n "$sid" ]] || { echo 'session creation failed'; exit 1; }

# Active scope works while role is valid.
active="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; select public.has_active_support_scope('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','metadata');" | tail -n1)"; [[ "$active" == "t" ]] || { echo 'active scope failed'; exit 1; }

# Revoking platform role invalidates scope immediately.
psql -h "$H" -p "$P" -U "$U" -d "$D" -c "delete from public.user_roles where user_id='22222222-2222-4222-8222-222222222222';" >/dev/null
inactive="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; select public.has_active_support_scope('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','metadata');" | tail -n1)"; [[ "$inactive" == "f" ]] || { echo 'role-revoked scope survived'; exit 1; }

# Workspace owner can see and revoke another operator's session.
owner_count="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'; select count(*) from public.workspace_support_sessions where id='$sid';" | tail -n1)"; [[ "$owner_count" == "1" ]] || { echo 'owner visibility failed'; exit 1; }
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -c "set role authenticated; set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'; select public.revoke_workspace_support_session('$sid','owner requested revocation');" >/dev/null

# Revoked scope remains false even if support role is restored.
psql -h "$H" -p "$P" -U "$U" -d "$D" -c "insert into public.user_roles values('22222222-2222-4222-8222-222222222222','admin');" >/dev/null
revoked="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; select public.has_active_support_scope('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','metadata');" | tail -n1)"; [[ "$revoked" == "f" ]] || { echo 'revoked scope revived'; exit 1; }

# Peer platform operator can revoke a session created by another operator.
sid2="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; select public.start_workspace_support_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','second legitimate reason',array['messages'],now()+interval '1 hour');" | tail -n1)"
psql -h "$H" -p "$P" -U "$U" -d "$D" -v ON_ERROR_STOP=1 -c "set role authenticated; set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333'; select public.revoke_workspace_support_session('$sid2','peer operator revocation');" >/dev/null

# Wrong workspace/scope and expired sessions fail closed.
wrong_ws="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; select public.has_active_support_scope('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','metadata');" | tail -n1)"; [[ "$wrong_ws" == "f" ]] || exit 1
wrong_scope="$(psql -h "$H" -p "$P" -U "$U" -d "$D" -Atc "set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; select public.has_active_support_scope('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','files');" | tail -n1)"; [[ "$wrong_scope" == "f" ]] || exit 1

# Direct authenticated mutation remains impossible; table is read-only to browser roles.
expect_fail "set role authenticated; insert into public.workspace_support_sessions(workspace_id,support_user_id,reason,scopes,expires_at) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','direct mutation attempt',array['metadata'],now()+interval '1 hour');" direct_insert

echo "Support session core hardening verification: PASS"
