#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
DB_NAME="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829081527_p0_5_b1_media_provider_credentials_backend_only.sql"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN CREATE ROLE sandbox_exec NOLOGIN; END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.media_provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE,
  encrypted_secret text NOT NULL,
  secret_hint text,
  credential_type text,
  credential_label text,
  is_valid boolean NOT NULL DEFAULT false,
  last_validated_at timestamptz,
  last_validation_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.media_provider_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view media provider credentials" ON public.media_provider_credentials;
DROP POLICY IF EXISTS "Admins can insert media provider credentials" ON public.media_provider_credentials;
DROP POLICY IF EXISTS "Admins can update media provider credentials" ON public.media_provider_credentials;
DROP POLICY IF EXISTS "Admins can delete media provider credentials" ON public.media_provider_credentials;
CREATE POLICY "Admins can view media provider credentials" ON public.media_provider_credentials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert media provider credentials" ON public.media_provider_credentials FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update media provider credentials" ON public.media_provider_credentials FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete media provider credentials" ON public.media_provider_credentials FOR DELETE TO authenticated USING (true);

GRANT ALL PRIVILEGES ON TABLE public.media_provider_credentials TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.media_provider_credentials TO sandbox_exec;
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  blocked_role text;
  blocked_priv text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.media_provider_credentials'::regclass) THEN
    RAISE EXCEPTION 'RLS is not enabled on media_provider_credentials';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'media_provider_credentials'
  ) THEN
    RAISE EXCEPTION 'browser RLS policies remain on backend-only credential table';
  END IF;

  FOREACH blocked_role IN ARRAY ARRAY['anon','authenticated','sandbox_exec'] LOOP
    FOREACH blocked_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(blocked_role, 'public.media_provider_credentials', blocked_priv) THEN
        RAISE EXCEPTION '% still has % on media_provider_credentials', blocked_role, blocked_priv;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH blocked_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    IF NOT has_table_privilege('service_role', 'public.media_provider_credentials', blocked_priv) THEN
      RAISE EXCEPTION 'service_role missing required % privilege', blocked_priv;
    END IF;
  END LOOP;

  FOREACH blocked_priv IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('service_role', 'public.media_provider_credentials', blocked_priv) THEN
      RAISE EXCEPTION 'service_role retains unnecessary % privilege', blocked_priv;
    END IF;
  END LOOP;
END $$;
SQL

echo "P0.5-B1 media provider credential boundary: PASS"
