#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829143530_p0_5_b3b_n8n_metadata_boundary.sql"
TEST_DB="p0_5_b3b_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"
GUARD_LOG="/tmp/p0_5_b3b_guard_$$.log"

cleanup() {
  rm -f "$GUARD_LOG"
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
  BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE sandbox_exec NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
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
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role public.app_role NOT NULL
);

CREATE FUNCTION public.is_workspace_owner(_user_id uuid, _workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = _workspace_id AND w.owner_id = _user_id
  )
$$;
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
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
  )
$$;
REVOKE ALL ON FUNCTION public.has_workspace_role(uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid,text[]) TO authenticated, service_role;

CREATE TABLE public.n8n_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id),
  user_id uuid,
  base_url text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  last_tested_at timestamptz,
  last_error text,
  event_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.n8n_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace owners manage n8n config"
ON public.n8n_configurations FOR ALL TO authenticated
USING (
  public.is_workspace_owner(auth.uid(), workspace_id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.is_workspace_owner(auth.uid(), workspace_id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
GRANT ALL PRIVILEGES ON public.n8n_configurations TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.n8n_configurations TO sandbox_exec;

INSERT INTO public.workspaces(id,owner_id,name) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B');
INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','admin'),
 ('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','member'),
 ('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','admin'),
 ('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','admin');
INSERT INTO public.user_roles(user_id,role)
VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff','admin');

INSERT INTO public.n8n_configurations(id,workspace_id,user_id,base_url,status)
VALUES
 ('31111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','https://n8n.example.test','connected'),
 ('39999999-9999-4999-8999-999999999999',NULL,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','https://invalid.example.test','disconnected');
SQL

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >"$GUARD_LOG" 2>&1; then
  echo "ERROR: P0.5-B3B migration accepted unresolved workspace ownership"
  exit 1
fi
if ! grep -q "unresolved workspace rows remain" "$GUARD_LOG"; then
  echo "ERROR: P0.5-B3B migration guard failed for an unexpected reason"
  cat "$GUARD_LOG"
  exit 1
fi

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -c "DELETE FROM public.n8n_configurations WHERE id='39999999-9999-4999-8999-999999999999';" >/dev/null
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  role_name text;
  privilege_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='n8n_configurations'
      AND column_name IN ('workspace_id','user_id') AND is_nullable <> 'NO'
  ) THEN
    RAISE EXCEPTION 'n8n tenant identity remains nullable';
  END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='n8n_configurations') <> 4 THEN
    RAISE EXCEPTION 'expected four n8n workspace policies';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='n8n_configurations'
      AND (coalesce(qual,'') LIKE '%has_role%' OR coalesce(with_check,'') LIKE '%has_role%')
  ) THEN
    RAISE EXCEPTION 'platform-role bypass remains in n8n RLS';
  END IF;

  FOREACH role_name IN ARRAY ARRAY['anon','sandbox_exec'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(role_name, 'public.n8n_configurations', privilege_name) THEN
        RAISE EXCEPTION '% retains % on n8n_configurations', role_name, privilege_name;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY['authenticated','service_role'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF NOT has_table_privilege(role_name, 'public.n8n_configurations', privilege_name) THEN
        RAISE EXCEPTION '% missing % on n8n_configurations', role_name, privilege_name;
      END IF;
    END LOOP;
    FOREACH privilege_name IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(role_name, 'public.n8n_configurations', privilege_name) THEN
        RAISE EXCEPTION '% retains excessive % on n8n_configurations', role_name, privilege_name;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    WHERE c.relname='n8n_configurations'
      AND t.tgname='trg_p0_5_b3b_n8n_identity'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'n8n identity immutability trigger missing';
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
ADMIN_A='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
MEMBER_A='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
DUAL_ADMIN='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
PLATFORM_ADMIN='ffffffff-ffff-4fff-8fff-ffffffffffff'
WA='11111111-1111-4111-8111-111111111111'
WB='22222222-2222-4222-8222-222222222222'

expect_value "$OWNER_A" "SELECT count(*) FROM public.n8n_configurations;" "1" "owner read"
expect_value "$ADMIN_A" "SELECT count(*) FROM public.n8n_configurations;" "1" "workspace admin read"
expect_value "$MEMBER_A" "SELECT count(*) FROM public.n8n_configurations;" "0" "member private metadata read"
expect_value "$PLATFORM_ADMIN" "SELECT count(*) FROM public.n8n_configurations;" "0" "platform admin automatic read"

expect_fail "$MEMBER_A" "INSERT INTO public.n8n_configurations(workspace_id,user_id,base_url) VALUES ('$WA','$MEMBER_A','https://member.example.test');" "member insert"
expect_fail "$ADMIN_A" "INSERT INTO public.n8n_configurations(workspace_id,user_id,base_url) VALUES ('$WB','$ADMIN_A','https://foreign.example.test');" "foreign workspace insert"
expect_fail "$ADMIN_A" "INSERT INTO public.n8n_configurations(workspace_id,user_id,base_url) VALUES ('$WA','$OWNER_A','https://spoof.example.test');" "spoofed creator insert"

as_user "$ADMIN_A" "UPDATE public.n8n_configurations SET status='tested' WHERE id='31111111-1111-4111-8111-111111111111';" >/dev/null
expect_value "$ADMIN_A" "SELECT status FROM public.n8n_configurations WHERE id='31111111-1111-4111-8111-111111111111';" "tested" "workspace admin update"

as_user "$DUAL_ADMIN" "INSERT INTO public.n8n_configurations(workspace_id,user_id,base_url) VALUES ('$WA','$DUAL_ADMIN','https://dual.example.test');" >/dev/null
expect_fail "$DUAL_ADMIN" "UPDATE public.n8n_configurations SET workspace_id='$WB' WHERE user_id='$DUAL_ADMIN';" "workspace-moving update"
expect_fail "$DUAL_ADMIN" "UPDATE public.n8n_configurations SET user_id='$OWNER_A' WHERE user_id='$DUAL_ADMIN';" "creator-moving update"

as_user "$ADMIN_A" "DELETE FROM public.n8n_configurations WHERE id='31111111-1111-4111-8111-111111111111';" >/dev/null
expect_value "$ADMIN_A" "SELECT count(*) FROM public.n8n_configurations WHERE id='31111111-1111-4111-8111-111111111111';" "0" "workspace admin delete"

echo "P0.5-B3B n8n metadata boundary: PASS"
