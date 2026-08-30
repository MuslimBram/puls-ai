#!/usr/bin/env bash
set -euo pipefail
: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829193000_r4a1_populated_tenant_tables.sql"
TEST_DB="r4a1_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"
cleanup(){ psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$TEST_DB' and pid<>pg_backend_pid()" >/dev/null 2>&1 || true; dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

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
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;

CREATE TABLE workspaces(id uuid PRIMARY KEY, owner_id uuid NOT NULL);
CREATE TABLE workspace_members(workspace_id uuid,user_id uuid,role text,PRIMARY KEY(workspace_id,user_id));
CREATE FUNCTION has_workspace_access(_workspace uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=_workspace AND w.owner_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=_workspace AND wm.user_id=auth.uid()))
$$;
CREATE FUNCTION has_workspace_role(_workspace uuid,_roles text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=_workspace AND w.owner_id=auth.uid() AND 'owner'=ANY(_roles)) OR EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=_workspace AND wm.user_id=auth.uid() AND wm.role=ANY(_roles)))
$$;
GRANT EXECUTE ON FUNCTION has_workspace_access(uuid),has_workspace_role(uuid,text[]) TO authenticated,service_role;

INSERT INTO workspaces VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO workspace_members VALUES
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('22222222-2222-4222-8222-222222222222','dddddddd-dddd-4ddd-8ddd-dddddddddddd','member');

CREATE TABLE business_profiles(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id));
INSERT INTO business_profiles VALUES
 ('31111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'),
 ('32222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222');

CREATE TABLE market_trends(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,workspace_id uuid REFERENCES workspaces(id),payload text);
CREATE TABLE analytics_daily_snapshots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,workspace_id uuid REFERENCES workspaces(id),payload text);
CREATE TABLE automation_workflows(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,workspace_id uuid REFERENCES workspaces(id),payload text);
CREATE TABLE knowledge_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,workspace_id uuid REFERENCES workspaces(id),business_id uuid REFERENCES business_profiles(id),payload text);
CREATE TABLE marketing_campaigns(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,workspace_id uuid REFERENCES workspaces(id),payload text);
CREATE TABLE business_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,workspace_id uuid REFERENCES workspaces(id),payload text);
CREATE TABLE demand_forecasts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,workspace_id uuid REFERENCES workspaces(id),payload text);
CREATE TABLE resource_planning_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,workspace_id uuid REFERENCES workspaces(id),payload text);
CREATE TABLE personalization_rules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,workspace_id uuid REFERENCES workspaces(id),payload text);

ALTER TABLE market_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_planning_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE personalization_rules ENABLE ROW LEVEL SECURITY;
GRANT ALL ON market_trends,analytics_daily_snapshots,automation_workflows,knowledge_sources,marketing_campaigns,business_notifications,demand_forecasts,resource_planning_items,personalization_rules TO anon,authenticated,service_role;

CREATE POLICY "Users can delete own market_trends" ON market_trends FOR DELETE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can insert own market_trends" ON market_trends FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can update own market_trends" ON market_trends FOR UPDATE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can view own market_trends" ON market_trends FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Service role can insert snapshots" ON analytics_daily_snapshots FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can view own snapshots" ON analytics_daily_snapshots FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can manage own automation_workflows" ON automation_workflows FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can delete own knowledge_sources" ON knowledge_sources FOR DELETE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can insert own knowledge_sources" ON knowledge_sources FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can update own knowledge_sources" ON knowledge_sources FOR UPDATE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can view own knowledge_sources" ON knowledge_sources FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users manage own marketing campaigns" ON marketing_campaigns FOR ALL TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Users can manage own business_notifications" ON business_notifications FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users manage own demand forecasts" ON demand_forecasts FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users manage own resource planning" ON resource_planning_items FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users manage own personalization rules" ON personalization_rules FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);

INSERT INTO market_trends(user_id,workspace_id,payload) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner-a');
INSERT INTO knowledge_sources(user_id,workspace_id,business_id,payload) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','31111111-1111-4111-8111-111111111111','good');
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['market_trends','analytics_daily_snapshots','automation_workflows','knowledge_sources','marketing_campaigns','business_notifications','demand_forecasts','resource_planning_items','personalization_rules'] LOOP
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='workspace_id' AND is_nullable<>'NO') THEN RAISE EXCEPTION '% workspace_id nullable',t; END IF;
  IF has_table_privilege('anon',format('public.%I',t),'SELECT') THEN RAISE EXCEPTION 'anon retains SELECT on %',t; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='analytics_daily_snapshots')<>2 THEN RAISE EXCEPTION 'analytics policy count wrong'; END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
INSERT INTO market_trends(user_id,workspace_id,payload) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','member-own');
UPDATE market_trends SET payload='member-own-updated' WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $$ BEGIN
 BEGIN
  INSERT INTO market_trends(user_id,workspace_id,payload) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','foreign');
  RAISE EXCEPTION 'expected foreign-workspace insert denial';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE market_trends SET workspace_id='22222222-2222-4222-8222-222222222222' WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  RAISE EXCEPTION 'expected workspace-moving update denial';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE market_trends SET payload='tampered' WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DELETE FROM market_trends WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
RESET ROLE;
DO $$ BEGIN
 IF (SELECT payload FROM market_trends WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>'owner-a' THEN RAISE EXCEPTION 'member changed owner row'; END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$ BEGIN
 BEGIN
  INSERT INTO knowledge_sources(user_id,workspace_id,business_id,payload) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','32222222-2222-4222-8222-222222222222','mismatch');
  RAISE EXCEPTION 'expected knowledge parent mismatch denial';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
DELETE FROM market_trends WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM market_trends WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc') THEN RAISE EXCEPTION 'owner could not delete workspace member row'; END IF;
END $$;
SQL

echo "R4a1 populated tenant verifier: PASS"
