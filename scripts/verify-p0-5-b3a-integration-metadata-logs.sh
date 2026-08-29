#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829130000_p0_5_b3a_integration_metadata_logs.sql"
TEST_DB="p0_5_b3a_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"
GUARD_LOG="/tmp/p0_5_b3a_guard_$$.log"

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
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL
);
CREATE TABLE public.external_integrations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  user_id uuid NOT NULL,
  integration_key text NOT NULL
);
CREATE TABLE public.unified_connections (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  user_id uuid NOT NULL
);
CREATE TABLE public.media_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE,
  provider_name text NOT NULL,
  media_types text[] NOT NULL DEFAULT '{}',
  is_enabled boolean NOT NULL DEFAULT false,
  is_mock boolean NOT NULL DEFAULT false,
  api_secret_name text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE TABLE public.integration_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.external_integrations(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES public.unified_connections(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  event_message text NOT NULL,
  metadata jsonb,
  payload jsonb,
  status text,
  adapter_key text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.connection_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.unified_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  message text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.media_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can delete media provider settings" ON public.media_provider_settings FOR DELETE TO authenticated USING (true);
CREATE POLICY "Admins can insert media provider settings" ON public.media_provider_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update media provider settings" ON public.media_provider_settings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can view media provider settings" ON public.media_provider_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can view all integration_event_logs" ON public.integration_event_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own integration_event_logs" ON public.integration_event_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can view own integration_event_logs" ON public.integration_event_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins view all connection logs" ON public.connection_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own connection logs" ON public.connection_logs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Users view own connection logs" ON public.connection_logs FOR SELECT TO public USING (true);

GRANT ALL PRIVILEGES ON public.media_provider_settings TO anon, authenticated, service_role;
GRANT SELECT ON public.media_provider_settings TO sandbox_exec;
GRANT ALL PRIVILEGES ON public.integration_event_logs TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.integration_event_logs TO sandbox_exec;
GRANT ALL PRIVILEGES ON public.connection_logs TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.connection_logs TO sandbox_exec;

INSERT INTO public.workspaces(id, owner_id, name) VALUES
  ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A'),
  ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B');
INSERT INTO public.external_integrations(id, workspace_id, user_id, integration_key) VALUES
  ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','telegram');
INSERT INTO public.unified_connections(id, workspace_id, user_id) VALUES
  ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- Deliberate conflict: canonical parent says workspace A, metadata says workspace B.
INSERT INTO public.integration_event_logs(integration_id,user_id,event_type,event_message,metadata)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'message','negative fixture',
  '{"workspace_id":"22222222-2222-4222-8222-222222222222"}'::jsonb
);
INSERT INTO public.connection_logs(connection_id,user_id,event_type,message,metadata)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'created','positive fixture',
  '{"workspace_id":"11111111-1111-4111-8111-111111111111"}'::jsonb
);
SQL

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >"$GUARD_LOG" 2>&1; then
  echo "ERROR: B3A migration accepted mismatched integration metadata workspace"
  exit 1
fi
if ! grep -q "metadata workspace mismatch" "$GUARD_LOG"; then
  echo "ERROR: B3A migration failed for an unexpected reason"
  cat "$GUARD_LOG"
  exit 1
fi

# The failed transaction rolled back the added workspace_id column. Correct only
# the legacy metadata fixture, then re-run the exact migration.
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
UPDATE public.integration_event_logs
SET metadata = '{"workspace_id":"11111111-1111-4111-8111-111111111111"}'::jsonb;
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  tbl text;
  role_name text;
  privilege_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['media_provider_settings','integration_event_logs','connection_logs'] LOOP
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=tbl) THEN
      RAISE EXCEPTION 'policies remain on backend-only table %', tbl;
    END IF;

    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','sandbox_exec'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(role_name, format('public.%I',tbl), privilege_name) THEN
          RAISE EXCEPTION '% retains % on %', role_name, privilege_name, tbl;
        END IF;
      END LOOP;
    END LOOP;

    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF NOT has_table_privilege('service_role', format('public.%I',tbl), privilege_name) THEN
        RAISE EXCEPTION 'service_role missing % on %', privilege_name, tbl;
      END IF;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('integration_event_logs','connection_logs')
      AND column_name='workspace_id' AND is_nullable <> 'NO'
  ) THEN
    RAISE EXCEPTION 'workspace_id remains nullable on a B3A log table';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.integration_event_logs
    WHERE workspace_id='11111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'integration_event_logs backfill failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.connection_logs
    WHERE workspace_id='11111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'connection_logs backfill failed';
  END IF;
END $$;
SQL

echo "P0.5-B3A integration metadata/log boundary: PASS"
