#!/usr/bin/env bash
set -euo pipefail
: "${PGPASSWORD:=postgres}"; export PGPASSWORD
H="${PGHOST:-127.0.0.1}"; P="${PGPORT:-5432}"; U="${PGUSER:-postgres}"; A="${PGDATABASE:-postgres}"
DB="r4a2_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"; M="supabase/migrations/20260829194000_r4a2_competitor_workspace_boundary.sql"
cleanup(){ dropdb -h "$H" -p "$P" -U "$U" --if-exists "$DB" >/dev/null 2>&1 || true; }; trap cleanup EXIT
psql -h "$H" -p "$P" -U "$U" -d "$A" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
 BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
 BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
SQL
createdb -h "$H" -p "$P" -U "$U" "$DB"
psql -h "$H" -p "$P" -U "$U" -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;
CREATE TABLE workspaces(id uuid PRIMARY KEY,owner_id uuid NOT NULL);
CREATE TABLE workspace_members(workspace_id uuid,user_id uuid,role text,PRIMARY KEY(workspace_id,user_id));
CREATE FUNCTION has_workspace_access(w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.workspaces x WHERE x.id=w AND x.owner_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w AND m.user_id=auth.uid())) $$;
CREATE FUNCTION has_workspace_role(w uuid,r text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.workspaces x WHERE x.id=w AND x.owner_id=auth.uid() AND 'owner'=ANY(r)) OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w AND m.user_id=auth.uid() AND m.role=ANY(r))) $$;
GRANT EXECUTE ON FUNCTION has_workspace_access(uuid),has_workspace_role(uuid,text[]) TO authenticated,service_role;
INSERT INTO workspaces VALUES('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO workspace_members VALUES('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','member');
CREATE TABLE competitors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,workspace_id uuid REFERENCES workspaces(id),name text);
CREATE TABLE competitor_alerts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,workspace_id uuid REFERENCES workspaces(id),competitor_id uuid NOT NULL REFERENCES competitors(id),title text);
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY; ALTER TABLE competitor_alerts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON competitors,competitor_alerts TO anon,authenticated,service_role;
CREATE POLICY "Users can delete own competitors" ON competitors FOR DELETE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can insert own competitors" ON competitors FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can update own competitors" ON competitors FOR UPDATE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can view own competitors" ON competitors FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can delete own competitor_alerts" ON competitor_alerts FOR DELETE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can insert own competitor_alerts" ON competitor_alerts FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can update own competitor_alerts" ON competitor_alerts FOR UPDATE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can view own competitor_alerts" ON competitor_alerts FOR SELECT TO authenticated USING(auth.uid()=user_id);
INSERT INTO competitors(id,user_id,workspace_id,name) VALUES('31111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','A'),('32222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','B');
INSERT INTO competitor_alerts(user_id,workspace_id,competitor_id,title) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','31111111-1111-4111-8111-111111111111','A alert');
SQL
psql -h "$H" -p "$P" -U "$U" -d "$DB" -v ON_ERROR_STOP=1 -f "$M" >/dev/null
psql -h "$H" -p "$P" -U "$U" -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name IN('competitors','competitor_alerts') AND column_name='workspace_id' AND is_nullable<>'NO') THEN RAISE EXCEPTION 'workspace_id nullable'; END IF;
 IF has_table_privilege('anon','public.competitors','SELECT') OR has_table_privilege('anon','public.competitor_alerts','SELECT') THEN RAISE EXCEPTION 'anon retained access'; END IF;
END $$;
SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
INSERT INTO competitors(id,user_id,workspace_id,name) VALUES('33333333-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','member');
INSERT INTO competitor_alerts(user_id,workspace_id,competitor_id,title) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','ok');
DO $$ BEGIN
 BEGIN INSERT INTO competitors(user_id,workspace_id,name) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','foreign'); RAISE EXCEPTION 'expected foreign insert denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO competitor_alerts(user_id,workspace_id,competitor_id,title) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','32222222-2222-4222-8222-222222222222','mismatch'); RAISE EXCEPTION 'expected parent mismatch denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
DELETE FROM competitors WHERE id='33333333-3333-4333-8333-333333333333';
RESET ROLE;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM competitors WHERE id='33333333-3333-4333-8333-333333333333') THEN RAISE EXCEPTION 'member deleted competitor'; END IF; END $$;
SQL
echo "R4a2 competitor boundary verifier: PASS"
