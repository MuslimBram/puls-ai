#!/usr/bin/env bash
set -euo pipefail
: "${PGPASSWORD:=postgres}"; export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"; DB_PORT="${PGPORT:-5432}"; ADMIN_DB="${PGDATABASE:-postgres}"; DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829193000_r4a_populated_tenant_batch_1.sql"
TEST_DB="r4a_b1_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"
cleanup(){ psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$TEST_DB' and pid<>pg_backend_pid()" >/dev/null 2>&1||true; dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$TEST_DB" >/dev/null 2>&1||true; }; trap cleanup EXIT
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
 BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
 BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
SQL
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE workspaces(id uuid primary key,owner_id uuid not null);
CREATE TABLE workspace_members(workspace_id uuid,user_id uuid,role text,primary key(workspace_id,user_id));
CREATE TABLE workspace_access_assignments(workspace_id uuid,user_id uuid,access_role text,is_active boolean default true,expires_at timestamptz);
CREATE FUNCTION has_workspace_access(_w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ select auth.uid() is not null and (exists(select 1 from public.workspace_members m where m.workspace_id=_w and m.user_id=auth.uid()) or exists(select 1 from public.workspace_access_assignments a where a.workspace_id=_w and a.user_id=auth.uid() and a.is_active and (a.expires_at is null or a.expires_at>now()))) $$;
CREATE FUNCTION has_workspace_role(_w uuid,_r text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ select auth.uid() is not null and (exists(select 1 from public.workspaces w where w.id=_w and w.owner_id=auth.uid() and 'owner'=any(_r)) or exists(select 1 from public.workspace_members m where m.workspace_id=_w and m.user_id=auth.uid() and m.role=any(_r))) $$;

CREATE TABLE competitors(id uuid primary key,user_id uuid not null,workspace_id uuid references workspaces(id),name text not null);
CREATE TABLE competitor_alerts(id uuid primary key,user_id uuid not null,workspace_id uuid references workspaces(id),competitor_id uuid not null references competitors(id) on delete cascade,title text not null);
CREATE TABLE market_trends(id uuid primary key,user_id uuid not null,workspace_id uuid references workspaces(id),trend_value text not null);
CREATE TABLE analytics_daily_snapshots(id uuid primary key,user_id uuid not null,workspace_id uuid references workspaces(id) on delete cascade,snapshot_date date not null default current_date);
CREATE TABLE automation_workflows(id uuid primary key,user_id uuid not null,workspace_id uuid references workspaces(id),name text not null);

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['competitors','competitor_alerts','market_trends','automation_workflows'] LOOP
 EXECUTE format('alter table %I enable row level security',t);
 EXECUTE format('create policy %I on %I for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id)','legacy_'||t,t);
END LOOP; END $$;
ALTER TABLE analytics_daily_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_snap_s ON analytics_daily_snapshots FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY legacy_snap_i ON analytics_daily_snapshots FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
GRANT ALL ON competitors,competitor_alerts,market_trends,analytics_daily_snapshots,automation_workflows TO anon,authenticated,service_role;

INSERT INTO workspaces VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO workspace_members VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner');
INSERT INTO competitors VALUES ('31111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','A'),('32222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','B');
INSERT INTO competitor_alerts VALUES ('41111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','31111111-1111-4111-8111-111111111111','A alert');
INSERT INTO market_trends VALUES ('51111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','alpha');
INSERT INTO analytics_daily_snapshots VALUES ('61111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',current_date);
INSERT INTO automation_workflows VALUES ('71111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','A flow');
SQL
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['competitors','competitor_alerts','market_trends','analytics_daily_snapshots','automation_workflows'] LOOP
  IF EXISTS(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='workspace_id' and is_nullable<>'NO') THEN RAISE EXCEPTION '% remains nullable',t; END IF;
  IF has_table_privilege('anon',format('public.%I',t),'SELECT') THEN RAISE EXCEPTION 'anon retains SELECT on %',t; END IF;
 END LOOP;
 IF (select count(*) from pg_policies where schemaname='public' and tablename='analytics_daily_snapshots')<>2 THEN RAISE EXCEPTION 'snapshots browser surface widened'; END IF;
END $$;

SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
-- member can see A and create own A resource
SELECT id FROM competitors WHERE id='31111111-1111-4111-8111-111111111111';
INSERT INTO market_trends VALUES ('52222222-2222-4222-8222-222222222222','cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','member-own');
DO $$ BEGIN
 BEGIN INSERT INTO market_trends VALUES ('53333333-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','foreign'); RAISE EXCEPTION 'foreign insert accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO market_trends VALUES ('54444444-4444-4444-8444-444444444444','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','spoof'); RAISE EXCEPTION 'spoof user accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE market_trends SET workspace_id='22222222-2222-4222-8222-222222222222' WHERE id='52222222-2222-4222-8222-222222222222'; RAISE EXCEPTION 'workspace move accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM market_trends WHERE id='52222222-2222-4222-8222-222222222222'; RAISE EXCEPTION 'member delete accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO competitor_alerts VALUES ('42222222-2222-4222-8222-222222222222','cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','32222222-2222-4222-8222-222222222222','foreign parent'); RAISE EXCEPTION 'foreign parent accepted'; EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DELETE FROM market_trends WHERE id='51111111-1111-4111-8111-111111111111';
RESET ROLE;
SQL
echo "R4a populated tenant batch 1 verifier: PASS"
