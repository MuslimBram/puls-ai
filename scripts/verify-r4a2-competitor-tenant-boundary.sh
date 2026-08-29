#!/usr/bin/env bash
set -euo pipefail
: "${PGPASSWORD:=postgres}"; export PGPASSWORD
H="${PGHOST:-127.0.0.1}"; P="${PGPORT:-5432}"; A="${PGDATABASE:-postgres}"; U="${PGUSER:-postgres}"; DB="r4a2_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"; M="supabase/migrations/20260829194000_r4a2_competitor_tenant_boundary.sql"
cleanup(){ psql -h "$H" -p "$P" -U "$U" -d "$A" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$DB' and pid<>pg_backend_pid()" >/dev/null 2>&1||true; dropdb -h "$H" -p "$P" -U "$U" --if-exists "$DB" >/dev/null 2>&1||true; }; trap cleanup EXIT
psql -h "$H" -p "$P" -U "$U" -d "$A" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END; BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END; BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END; END $$;
SQL
createdb -h "$H" -p "$P" -U "$U" "$DB"
psql -h "$H" -p "$P" -U "$U" -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TABLE workspaces(id uuid primary key,owner_id uuid not null); CREATE TABLE workspace_members(workspace_id uuid,user_id uuid,role text,primary key(workspace_id,user_id)); CREATE TABLE workspace_access_assignments(workspace_id uuid,user_id uuid,access_role text,is_active boolean,expires_at timestamptz);
CREATE FUNCTION has_workspace_access(_w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$select auth.uid() is not null and exists(select 1 from public.workspace_members m where m.workspace_id=_w and m.user_id=auth.uid())$$;
CREATE FUNCTION has_workspace_role(_w uuid,_r text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$select auth.uid() is not null and (exists(select 1 from public.workspaces w where w.id=_w and w.owner_id=auth.uid() and 'owner'=any(_r)) or exists(select 1 from public.workspace_members m where m.workspace_id=_w and m.user_id=auth.uid() and m.role=any(_r)))$$;
CREATE TABLE competitors(id uuid primary key,user_id uuid not null,workspace_id uuid references workspaces(id),name text not null); CREATE TABLE competitor_alerts(id uuid primary key,user_id uuid not null,workspace_id uuid references workspaces(id),competitor_id uuid not null references competitors(id) on delete cascade,title text not null);
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY; ALTER TABLE competitor_alerts ENABLE ROW LEVEL SECURITY; CREATE POLICY legacy_c ON competitors FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id); CREATE POLICY legacy_a ON competitor_alerts FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id); GRANT ALL ON competitors,competitor_alerts TO anon,authenticated,service_role;
INSERT INTO workspaces VALUES('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'); INSERT INTO workspace_members VALUES('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner'); INSERT INTO competitors VALUES('31111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','A'),('32222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','B'); INSERT INTO competitor_alerts VALUES('41111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','31111111-1111-4111-8111-111111111111','A');
SQL
psql -h "$H" -p "$P" -U "$U" -d "$DB" -v ON_ERROR_STOP=1 -f "$M" >/dev/null
psql -h "$H" -p "$P" -U "$U" -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN IF EXISTS(select 1 from information_schema.columns where table_schema='public' and table_name in('competitors','competitor_alerts') and column_name='workspace_id' and is_nullable<>'NO') THEN RAISE EXCEPTION 'nullable remains'; END IF; IF has_table_privilege('anon','public.competitors','SELECT') OR has_table_privilege('anon','public.competitor_alerts','SELECT') THEN RAISE EXCEPTION 'anon access'; END IF; END $$;
SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false); INSERT INTO competitors VALUES('33333333-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','member');
DO $$ BEGIN
 BEGIN INSERT INTO competitors VALUES('34444444-4444-4444-8444-444444444444','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','foreign'); RAISE EXCEPTION 'foreign insert accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE competitors SET workspace_id='22222222-2222-4222-8222-222222222222' WHERE id='33333333-3333-4333-8333-333333333333'; RAISE EXCEPTION 'move accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM competitors WHERE id='33333333-3333-4333-8333-333333333333'; RAISE EXCEPTION 'member delete accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO competitor_alerts VALUES('42222222-2222-4222-8222-222222222222','cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','32222222-2222-4222-8222-222222222222','foreign parent'); RAISE EXCEPTION 'foreign parent accepted'; EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END;
END $$;
UPDATE competitors SET name='member-tampered-owner-row' WHERE id='31111111-1111-4111-8111-111111111111';
RESET ROLE;
DO $$ BEGIN IF (SELECT name FROM competitors WHERE id='31111111-1111-4111-8111-111111111111')<>'A' THEN RAISE EXCEPTION 'member updated another author row'; END IF; END $$;
SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false); DELETE FROM competitors WHERE id='31111111-1111-4111-8111-111111111111'; RESET ROLE;
SQL
echo "R4a2 competitor tenant verifier: PASS"
