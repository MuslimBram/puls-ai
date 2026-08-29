#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829154500_ai_training_data_two_tier_boundary.sql"
TEST_DB="ai_training_two_tier_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"

cleanup() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TEST_DB' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE sandbox_exec NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER ROLE service_role BYPASSRLS;
SQL

createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB"
DB_NAME="$TEST_DB"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('user','admin','super_admin');
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL
);
CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  user_id uuid NOT NULL,
  role text NOT NULL
);
CREATE TABLE public.workspace_access_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  user_id uuid NOT NULL,
  access_role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role public.app_role NOT NULL
);

CREATE FUNCTION public.has_workspace_access(_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = _workspace_id AND wm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_access_assignments waa
      WHERE waa.workspace_id = _workspace_id
        AND waa.user_id = auth.uid()
        AND waa.is_active
        AND (waa.expires_at IS NULL OR waa.expires_at > now())
    )
  )
$$;

CREATE FUNCTION public.has_workspace_role(_workspace_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = _workspace_id
        AND w.owner_id = auth.uid()
        AND 'owner' = ANY(_roles)
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = _workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = ANY(_roles)
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_access_assignments waa
      WHERE waa.workspace_id = _workspace_id
        AND waa.user_id = auth.uid()
        AND waa.is_active
        AND (waa.expires_at IS NULL OR waa.expires_at > now())
        AND (
          (waa.access_role = 'business_admin' AND 'admin' = ANY(_roles))
          OR (waa.access_role IN ('manager','employee','freelancer') AND 'member' = ANY(_roles))
        )
    )
  )
$$;
REVOKE ALL ON FUNCTION public.has_workspace_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_workspace_role(uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_workspace_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid,text[]) TO authenticated, service_role;

CREATE TABLE public.ai_training_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  language text NOT NULL DEFAULT 'en',
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_training_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_read ON public.ai_training_data FOR SELECT TO authenticated
USING (workspace_id IS NULL OR EXISTS (
  SELECT 1 FROM public.workspace_members wm
  WHERE wm.workspace_id = ai_training_data.workspace_id AND wm.user_id = auth.uid()
));
CREATE POLICY training_write ON public.ai_training_data FOR INSERT TO authenticated
WITH CHECK (
  (workspace_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = ai_training_data.workspace_id AND wm.user_id = auth.uid()
  )) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=auth.uid() AND ur.role IN ('admin','super_admin')
  )
);
CREATE POLICY training_update ON public.ai_training_data FOR UPDATE TO authenticated
USING (
  (workspace_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = ai_training_data.workspace_id AND wm.user_id = auth.uid()
  )) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=auth.uid() AND ur.role IN ('admin','super_admin')
  )
);
CREATE POLICY training_delete ON public.ai_training_data FOR DELETE TO authenticated
USING (
  (workspace_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = ai_training_data.workspace_id AND wm.user_id = auth.uid()
  )) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=auth.uid() AND ur.role IN ('admin','super_admin')
  )
);
GRANT ALL PRIVILEGES ON public.ai_training_data TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.ai_training_data TO sandbox_exec;

INSERT INTO public.workspaces(id,owner_id,name) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B');
INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner');
INSERT INTO public.user_roles(user_id,role)
VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff','admin');

INSERT INTO public.ai_training_data(id,workspace_id,type,question,answer,priority,is_active,language,category) VALUES
 ('30000000-0000-4000-8000-000000000001',NULL,'policy','Global Q','Global A',100,true,'en','legal'),
 ('30000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','faq','Tenant A Q','Tenant A A',10,true,'en',NULL),
 ('30000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','faq','Tenant B Q','Tenant B A',10,true,'en',NULL);
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  role_name text;
  privilege_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ai_training_data'
      AND column_name='workspace_id' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION 'global training tier was destroyed: workspace_id must remain nullable';
  END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='ai_training_data') <> 4 THEN
    RAISE EXCEPTION 'expected four tenant-only training policies';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ai_training_data'
      AND (
        coalesce(qual,'') LIKE '%has_role%'
        OR coalesce(with_check,'') LIKE '%has_role%'
        OR coalesce(qual,'') LIKE '%workspace_id IS NULL%'
        OR coalesce(with_check,'') LIKE '%workspace_id IS NULL%'
      )
  ) THEN
    RAISE EXCEPTION 'global browser access or platform-role bypass remains';
  END IF;

  FOREACH role_name IN ARRAY ARRAY['anon','sandbox_exec'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(role_name,'public.ai_training_data',privilege_name) THEN
        RAISE EXCEPTION '% retains % on ai_training_data', role_name, privilege_name;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY['authenticated','service_role'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF NOT has_table_privilege(role_name,'public.ai_training_data',privilege_name) THEN
        RAISE EXCEPTION '% missing % on ai_training_data', role_name, privilege_name;
      END IF;
    END LOOP;
    FOREACH privilege_name IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(role_name,'public.ai_training_data',privilege_name) THEN
        RAISE EXCEPTION '% retains excessive % on ai_training_data', role_name, privilege_name;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE c.relname='ai_training_data'
      AND t.tgname='trg_ai_training_data_scope_immutability'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'training scope immutability trigger missing';
  END IF;
END $$;
SQL

as_user() {
  local uid="$1"
  local sql="$2"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt \
    -c "SET ROLE authenticated; SET request.jwt.claim.sub = '$uid'; $sql"
}
expect_value() {
  local uid="$1" sql="$2" expected="$3" label="$4" out
  out="$(as_user "$uid" "$sql")"
  if [[ "$out" != "$expected" ]]; then
    echo "ERROR: $label expected '$expected', got '$out'"
    exit 1
  fi
}
expect_fail() {
  local uid="$1" sql="$2" label="$3"
  if as_user "$uid" "$sql" >/dev/null 2>&1; then
    echo "ERROR: $label unexpectedly succeeded"
    exit 1
  fi
}

OWNER_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
MEMBER_A='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
VIEWER_A='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
OWNER_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
PLATFORM_ADMIN='ffffffff-ffff-4fff-8fff-ffffffffffff'
WA='11111111-1111-4111-8111-111111111111'
WB='22222222-2222-4222-8222-222222222222'

expect_value "$OWNER_A" "SELECT count(*) FROM public.ai_training_data;" "1" "owner sees tenant only"
expect_value "$MEMBER_A" "SELECT count(*) FROM public.ai_training_data;" "1" "member sees tenant only"
expect_value "$VIEWER_A" "SELECT count(*) FROM public.ai_training_data;" "1" "viewer read"
expect_value "$OWNER_B" "SELECT count(*) FROM public.ai_training_data;" "1" "cross-tenant isolation"
expect_value "$PLATFORM_ADMIN" "SELECT count(*) FROM public.ai_training_data;" "0" "platform admin automatic read"

as_user "$MEMBER_A" "INSERT INTO public.ai_training_data(workspace_id,type,question,answer,priority,is_active,language) VALUES ('$WA','faq','Member Q','Member A',1,true,'en');" >/dev/null
expect_value "$MEMBER_A" "SELECT count(*) FROM public.ai_training_data;" "2" "member insert"
expect_fail "$MEMBER_A" "INSERT INTO public.ai_training_data(workspace_id,type,question,answer,priority,is_active,language) VALUES ('$WB','faq','Foreign Q','Foreign A',1,true,'en');" "foreign tenant insert"
expect_fail "$MEMBER_A" "INSERT INTO public.ai_training_data(workspace_id,type,question,answer,priority,is_active,language) VALUES (NULL,'policy','Global write','No',1,true,'en');" "browser global insert"
expect_fail "$VIEWER_A" "INSERT INTO public.ai_training_data(workspace_id,type,question,answer,priority,is_active,language) VALUES ('$WA','faq','Viewer Q','Viewer A',1,true,'en');" "viewer insert"

as_user "$MEMBER_A" "UPDATE public.ai_training_data SET answer='Updated' WHERE question='Member Q';" >/dev/null
expect_fail "$MEMBER_A" "UPDATE public.ai_training_data SET workspace_id='$WB' WHERE question='Member Q';" "workspace-moving update"
expect_fail "$MEMBER_A" "UPDATE public.ai_training_data SET workspace_id=NULL WHERE question='Member Q';" "tenant-to-global update"

expect_value "$MEMBER_A" "WITH d AS (DELETE FROM public.ai_training_data WHERE workspace_id='$WA' RETURNING 1) SELECT count(*) FROM d;" "0" "member delete denied"
expect_value "$VIEWER_A" "WITH u AS (UPDATE public.ai_training_data SET answer='viewer' WHERE workspace_id='$WA' RETURNING 1) SELECT count(*) FROM u;" "0" "viewer update denied"

as_user "$OWNER_A" "DELETE FROM public.ai_training_data WHERE question='Member Q';" >/dev/null
expect_value "$OWNER_A" "SELECT count(*) FROM public.ai_training_data;" "1" "owner delete"

SERVICE_VISIBLE="$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt -c "SET ROLE service_role; SELECT count(*) FROM public.ai_training_data;")"
if [[ "$SERVICE_VISIBLE" != "3" ]]; then
  echo "ERROR: service_role expected 3 rows, got '$SERVICE_VISIBLE'"
  exit 1
fi
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt \
  -c "SET ROLE service_role; INSERT INTO public.ai_training_data(workspace_id,type,question,answer,priority,is_active,language,category) VALUES (NULL,'policy','Backend global','Allowed',1,true,'en','legal');" >/dev/null
GLOBAL_COUNT="$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -qAt -c "SET ROLE service_role; SELECT count(*) FROM public.ai_training_data WHERE workspace_id IS NULL;")"
if [[ "$GLOBAL_COUNT" != "2" ]]; then
  echo "ERROR: backend global tier expected 2 rows, got '$GLOBAL_COUNT'"
  exit 1
fi

echo "AI training data two-tier boundary: PASS"
