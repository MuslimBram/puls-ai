#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829190000_r1b_unowned_read_rpcs.sql"
TEST_DB="r1b_reads_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"

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
CREATE FUNCTION public.get_media_usage_policy_for_user(_user_id uuid)
RETURNS TABLE(plan_key text, daily_image_limit integer, daily_video_limit integer, daily_video_seconds_limit integer, max_video_seconds integer, allow_image_generation boolean, allow_video_generation boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public'
AS $$ SELECT 'standard'::text,1,1,1,1,true,true $$;
CREATE FUNCTION public.is_contact_suppressed(_user_id uuid,_contact_identifier text,_channel_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public'
AS $$ SELECT false $$;
CREATE FUNCTION public.check_freelancer_discount_eligibility(_freelancer_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public'
AS $$ BEGIN RETURN '{}'::jsonb; END $$;
CREATE FUNCTION public.generate_daily_kpi(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='public'
AS $$ BEGIN RETURN '{}'::jsonb; END $$;

GRANT EXECUTE ON FUNCTION public.get_media_usage_policy_for_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_contact_suppressed(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_freelancer_discount_eligibility(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_daily_kpi(uuid) TO authenticated, service_role;
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  identity text;
  proc_oid oid;
BEGIN
  FOREACH identity IN ARRAY ARRAY[
    'public.get_media_usage_policy_for_user(uuid)',
    'public.is_contact_suppressed(uuid,text,text)',
    'public.check_freelancer_discount_eligibility(uuid)',
    'public.generate_daily_kpi(uuid)'
  ] LOOP
    IF has_function_privilege('anon', identity, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon still executes %', identity;
    END IF;
    IF has_function_privilege('authenticated', identity, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated still executes backend-only %', identity;
    END IF;
    IF NOT has_function_privilege('service_role', identity, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role lost %', identity;
    END IF;
    proc_oid := to_regprocedure(identity);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc
      WHERE oid = proc_oid
        AND proconfig @> ARRAY['search_path=pg_catalog, public']
    ) THEN
      RAISE EXCEPTION 'unsafe search_path remains on %', identity;
    END IF;
  END LOOP;

  IF (SELECT provolatile FROM pg_proc WHERE oid='public.generate_daily_kpi(uuid)'::regprocedure) <> 's' THEN
    RAISE EXCEPTION 'generate_daily_kpi was not corrected to STABLE';
  END IF;
END $$;
SQL

echo "R1B backend-only read RPC verifier: PASS"
