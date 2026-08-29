#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829150000_critical_rls_public_tenant_bypass_closure.sql"
TEST_DB="critical_rls_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"

cleanup() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" -v ON_ERROR_STOP=1 \
    -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$TEST_DB' and pid<>pg_backend_pid();" \
    >/dev/null 2>&1 || true
  dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  begin create role anon nologin; exception when duplicate_object then null; end;
  begin create role authenticated nologin; exception when duplicate_object then null; end;
  begin create role sandbox_exec nologin; exception when duplicate_object then null; end;
  begin create role service_role nologin; exception when duplicate_object then null; end;
end $$;
alter role service_role bypassrls;
SQL

createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB"
DB_NAME="$TEST_DB"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;

create type public.app_role as enum ('user','admin','super_admin','business_owner');
create table public.workspaces(id uuid primary key, owner_id uuid not null);
create table public.workspace_members(workspace_id uuid not null references public.workspaces(id), user_id uuid not null, role text not null);
create table public.user_roles(user_id uuid not null, role public.app_role not null);

create function public.has_workspace_access(_workspace uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.workspaces w where w.id=_workspace and w.owner_id=auth.uid())
    or exists(select 1 from public.workspace_members wm where wm.workspace_id=_workspace and wm.user_id=auth.uid())
  )
$$;
create function public.has_workspace_role(_workspace_id uuid,_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.workspaces w where w.id=_workspace_id and w.owner_id=auth.uid() and 'owner'=any(_roles))
    or exists(select 1 from public.workspace_members wm where wm.workspace_id=_workspace_id and wm.user_id=auth.uid() and wm.role=any(_roles))
  )
$$;
revoke all on function public.has_workspace_access(uuid) from public, anon;
revoke all on function public.has_workspace_role(uuid,text[]) from public, anon;
grant execute on function public.has_workspace_access(uuid) to authenticated, service_role;
grant execute on function public.has_workspace_role(uuid,text[]) to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'ai_campaign_segments','business_rules','contact_consent','conversion_events',
    'customer_referral_events','customer_referral_programs','frequency_cap_log',
    'lifecycle_trigger_log','lifecycle_triggers','next_best_actions',
    'processed_webhook_events','voice_ai_sessions'
  ] loop
    execute format('create table public.%I(id uuid primary key default gen_random_uuid(),workspace_id uuid references public.workspaces(id),payload text)',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('grant all privileges on public.%I to anon,authenticated,service_role',t);
    execute format('grant select,insert on public.%I to sandbox_exec',t);
  end loop;
end $$;

create policy "service_manage_consent" on public.contact_consent for all to public using(auth.uid() is null);
create policy "service_manage_conversions" on public.conversion_events for all to public using(auth.uid() is null);
create policy "service_manage_ref_events" on public.customer_referral_events for all to public using(auth.uid() is null);
create policy "service_manage_freq_log" on public.frequency_cap_log for all to public using(auth.uid() is null);
create policy "service_manage_trigger_log" on public.lifecycle_trigger_log for all to public using(auth.uid() is null);
create policy "service_manage_nba" on public.next_best_actions for all to public using(auth.uid() is null);
create policy "service_only_webhooks" on public.processed_webhook_events for all to public using(auth.uid() is null);
create policy "service_manage_sessions" on public.voice_ai_sessions for all to public using(auth.uid() is null);

create policy "workspace_manage_segments" on public.ai_campaign_segments for all to public using(
 workspace_id in(select ai_campaign_segments.workspace_id from public.user_roles where user_roles.user_id=auth.uid())
 or workspace_id in(select id from public.workspaces where owner_id=auth.uid()));
create policy "workspace_manage_ref_programs" on public.customer_referral_programs for all to public using(
 workspace_id in(select customer_referral_programs.workspace_id from public.user_roles where user_roles.user_id=auth.uid())
 or workspace_id in(select id from public.workspaces where owner_id=auth.uid()));
create policy "workspace_manage_triggers" on public.lifecycle_triggers for all to public using(
 workspace_id in(select lifecycle_triggers.workspace_id from public.user_roles where user_roles.user_id=auth.uid())
 or workspace_id in(select id from public.workspaces where owner_id=auth.uid()));
create policy "workspace_read_rules" on public.business_rules for select to public using(
 workspace_id in(select business_rules.workspace_id from public.user_roles where user_roles.user_id=auth.uid())
 or workspace_id in(select id from public.workspaces where owner_id=auth.uid()));
create policy "workspace_read_consent" on public.contact_consent for select to public using(
 workspace_id in(select contact_consent.workspace_id from public.user_roles where user_roles.user_id=auth.uid())
 or workspace_id in(select id from public.workspaces where owner_id=auth.uid()));
create policy "workspace_read_conversions" on public.conversion_events for select to public using(
 workspace_id in(select conversion_events.workspace_id from public.user_roles where user_roles.user_id=auth.uid())
 or workspace_id in(select id from public.workspaces where owner_id=auth.uid()));
create policy "workspace_read_ref_events" on public.customer_referral_events for select to public using(
 workspace_id in(select customer_referral_events.workspace_id from public.user_roles where user_roles.user_id=auth.uid())
 or workspace_id in(select id from public.workspaces where owner_id=auth.uid()));
create policy "workspace_read_nba" on public.next_best_actions for select to public using(
 workspace_id in(select next_best_actions.workspace_id from public.user_roles where user_roles.user_id=auth.uid())
 or workspace_id in(select id from public.workspaces where owner_id=auth.uid()));
create policy "admin_manage_rules" on public.business_rules for all to public using(
 exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role in('admin','super_admin','business_owner')));
create policy "workspace_read_sessions" on public.voice_ai_sessions for select to public using(
 exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role in('admin','super_admin')));
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare t text; role_name text; privilege_name text; n integer;
begin
  if exists(
    select 1 from pg_policies
    where schemaname='public'
      and tablename=any(array['ai_campaign_segments','business_rules','contact_consent','conversion_events','customer_referral_events','customer_referral_programs','frequency_cap_log','lifecycle_trigger_log','lifecycle_triggers','next_best_actions','processed_webhook_events','voice_ai_sessions'])
      and ('public'=any(roles) or coalesce(qual,'')~*'auth\.uid\(\).*is null' or coalesce(with_check,'')~*'auth\.uid\(\).*is null' or coalesce(qual,'')~*'from (public\.)?user_roles' or coalesce(with_check,'')~*'from (public\.)?user_roles')
  ) then raise exception 'dangerous public/self-correlated RLS remains'; end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename=any(array['ai_campaign_segments','business_rules','contact_consent','conversion_events','customer_referral_events','customer_referral_programs','frequency_cap_log','lifecycle_trigger_log','lifecycle_triggers','next_best_actions','processed_webhook_events','voice_ai_sessions']);
  if n<>21 then raise exception 'expected 21 replacement policies, got %',n; end if;

  foreach t in array array['ai_campaign_segments','business_rules','contact_consent','conversion_events','customer_referral_events','customer_referral_programs','frequency_cap_log','lifecycle_trigger_log','lifecycle_triggers','next_best_actions','processed_webhook_events','voice_ai_sessions'] loop
    foreach role_name in array array['anon','sandbox_exec'] loop
      foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        if has_table_privilege(role_name,'public.'||t,privilege_name) then raise exception '% retains % on %',role_name,privilege_name,t; end if;
      end loop;
    end loop;
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if not has_table_privilege('service_role','public.'||t,privilege_name) then raise exception 'service_role missing % on %',privilege_name,t; end if;
    end loop;
    foreach privilege_name in array array['TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('service_role','public.'||t,privilege_name) then raise exception 'service_role retains excessive % on %',privilege_name,t; end if;
    end loop;
  end loop;

  foreach t in array array['ai_campaign_segments','business_rules','customer_referral_programs','lifecycle_triggers'] loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if not has_table_privilege('authenticated','public.'||t,privilege_name) then raise exception 'authenticated missing % on %',privilege_name,t; end if;
    end loop;
  end loop;
  foreach t in array array['contact_consent','conversion_events','customer_referral_events','next_best_actions','voice_ai_sessions'] loop
    if not has_table_privilege('authenticated','public.'||t,'SELECT') then raise exception 'authenticated missing SELECT on %',t; end if;
    foreach privilege_name in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('authenticated','public.'||t,privilege_name) then raise exception 'authenticated retains excessive % on %',privilege_name,t; end if;
    end loop;
  end loop;
  foreach t in array array['frequency_cap_log','lifecycle_trigger_log','processed_webhook_events'] loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('authenticated','public.'||t,privilege_name) then raise exception 'authenticated retains % on service-only %',privilege_name,t; end if;
    end loop;
  end loop;
end $$;

insert into public.workspaces(id,owner_id) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','admin'),
 ('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','member'),
 ('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','viewer');
insert into public.user_roles(user_id,role) values('ffffffff-ffff-4fff-8fff-ffffffffffff','admin');

insert into public.ai_campaign_segments(workspace_id,payload) values('11111111-1111-4111-8111-111111111111','segment-a');
insert into public.business_rules(workspace_id,payload) values('11111111-1111-4111-8111-111111111111','rule-a');
insert into public.contact_consent(workspace_id,payload) values('11111111-1111-4111-8111-111111111111','consent-a');
insert into public.voice_ai_sessions(workspace_id,payload) values('11111111-1111-4111-8111-111111111111','voice-a');
SQL

as_user(){ local uid="$1" sql="$2"; psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt -c "set role authenticated; set request.jwt.claim.sub='$uid'; $sql"; }
expect_value(){ local uid="$1" sql="$2" expected="$3" label="$4" out; out="$(as_user "$uid" "$sql")"; [[ "$out" == "$expected" ]] || { echo "ERROR: $label expected '$expected', got '$out'"; exit 1; }; }
expect_fail(){ local uid="$1" sql="$2" label="$3"; if as_user "$uid" "$sql" >/dev/null 2>&1; then echo "ERROR: $label unexpectedly succeeded"; exit 1; fi; }

OWNER_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; ADMIN_A='cccccccc-cccc-4ccc-8ccc-cccccccccccc'; MEMBER_A='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; VIEWER_A='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; NON_MEMBER='99999999-9999-4999-8999-999999999999'; PLATFORM_ADMIN='ffffffff-ffff-4fff-8fff-ffffffffffff'; WA='11111111-1111-4111-8111-111111111111'; WB='22222222-2222-4222-8222-222222222222'

expect_value "$VIEWER_A" "select count(*) from public.ai_campaign_segments" "1" "viewer read config"
expect_value "$VIEWER_A" "select count(*) from public.contact_consent" "1" "viewer read event"
expect_value "$MEMBER_A" "select count(*) from public.voice_ai_sessions" "1" "member read voice"
expect_value "$NON_MEMBER" "select count(*) from public.ai_campaign_segments" "0" "non-member read"
expect_value "$PLATFORM_ADMIN" "select count(*) from public.ai_campaign_segments" "0" "platform admin automatic read"
expect_value "$PLATFORM_ADMIN" "select count(*) from public.business_rules" "0" "platform admin automatic rules read"

as_user "$MEMBER_A" "insert into public.ai_campaign_segments(workspace_id,payload) values('$WA','member-ok')" >/dev/null
expect_fail "$MEMBER_A" "insert into public.ai_campaign_segments(workspace_id,payload) values('$WB','foreign')" "foreign workspace insert"
expect_fail "$VIEWER_A" "insert into public.ai_campaign_segments(workspace_id,payload) values('$WA','viewer-write')" "viewer write"
as_user "$MEMBER_A" "delete from public.ai_campaign_segments where payload='segment-a'" >/dev/null
expect_value "$ADMIN_A" "select count(*) from public.ai_campaign_segments where payload='segment-a'" "1" "member delete denied"
as_user "$ADMIN_A" "delete from public.ai_campaign_segments where payload='segment-a'" >/dev/null
expect_value "$ADMIN_A" "select count(*) from public.ai_campaign_segments where payload='segment-a'" "0" "admin delete"

expect_fail "$MEMBER_A" "insert into public.business_rules(workspace_id,payload) values('$WA','member-rule')" "member business-rule write"
as_user "$ADMIN_A" "insert into public.business_rules(workspace_id,payload) values('$WA','admin-rule')" >/dev/null

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt -c "set role anon; select count(*) from public.contact_consent" >/dev/null 2>&1; then echo 'ERROR: anon can still read contact_consent'; exit 1; fi

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt -c "set role service_role; insert into public.frequency_cap_log(workspace_id,payload) values('$WA','service-log'); insert into public.processed_webhook_events(workspace_id,payload) values('$WA','service-webhook');" >/dev/null

echo 'Critical public/self-correlated RLS bypass closure: PASS'
