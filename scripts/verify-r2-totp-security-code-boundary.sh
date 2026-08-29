#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829191000_r2_totp_security_code_boundary.sql"
TEST_DB="r2_mfa_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"

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
  BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
SQL

createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB"
DB_NAME="$TEST_DB"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.totp_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  encrypted_secret text NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_security_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.totp_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own TOTP" ON public.totp_secrets
FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY "Users manage own security code" ON public.user_security_codes
FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

GRANT ALL PRIVILEGES ON public.totp_secrets, public.user_security_codes TO anon, authenticated, service_role;
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  tbl text;
  privilege_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['totp_secrets','user_security_codes'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=format('public.%I',tbl)::regclass) THEN
      RAISE EXCEPTION 'RLS disabled on %', tbl;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=tbl AND 'authenticated'=ANY(roles)
    ) THEN
      RAISE EXCEPTION 'authenticated policy remains on %', tbl;
    END IF;

    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('anon', format('public.%I',tbl), privilege_name) THEN
        RAISE EXCEPTION 'anon retains % on %', privilege_name, tbl;
      END IF;
      IF has_table_privilege('authenticated', format('public.%I',tbl), privilege_name) THEN
        RAISE EXCEPTION 'authenticated retains % on %', privilege_name, tbl;
      END IF;
    END LOOP;

    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF NOT has_table_privilege('service_role', format('public.%I',tbl), privilege_name) THEN
        RAISE EXCEPTION 'service_role missing % on %', privilege_name, tbl;
      END IF;
    END LOOP;
    FOREACH privilege_name IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('service_role', format('public.%I',tbl), privilege_name) THEN
        RAISE EXCEPTION 'service_role retains unnecessary % on %', privilege_name, tbl;
      END IF;
    END LOOP;
  END LOOP;
END $$;

SET ROLE service_role;
INSERT INTO public.totp_secrets(user_id,encrypted_secret,is_verified)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ciphertext',false);
INSERT INTO public.user_security_codes(user_id,code_hash)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','hash');
UPDATE public.totp_secrets SET is_verified=true WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE public.user_security_codes SET code_hash='hash2' WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DELETE FROM public.totp_secrets WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DELETE FROM public.user_security_codes WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.totp_secrets) <> 0 OR (SELECT count(*) FROM public.user_security_codes) <> 0 THEN
    RAISE EXCEPTION 'service-role CRUD did not cleanly round-trip';
  END IF;
END $$;
SQL

echo "R2 TOTP/security-code boundary verifier: PASS"
