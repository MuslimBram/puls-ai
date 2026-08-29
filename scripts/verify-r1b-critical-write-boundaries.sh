#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829184200_r1b_critical_write_boundaries.sql"
TEST_DB="r1b_write_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"

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
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL
);

CREATE TABLE public.rate_limit_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key text NOT NULL UNIQUE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  endpoint text,
  tokens_remaining integer NOT NULL DEFAULT 100,
  max_tokens integer NOT NULL DEFAULT 100,
  refill_rate integer NOT NULL DEFAULT 10,
  refill_interval_sec integer NOT NULL DEFAULT 60,
  last_refill_at timestamptz NOT NULL DEFAULT now(),
  abuse_flag boolean NOT NULL DEFAULT false,
  abuse_reason text,
  suspended_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sla_configs (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id),
  first_response_minutes integer NOT NULL,
  next_response_minutes integer NOT NULL,
  resolution_minutes integer NOT NULL
);

CREATE TABLE public.conversation_threads (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  first_response_at timestamptz,
  status text NOT NULL DEFAULT 'new',
  sla_response_due timestamptz,
  next_response_due timestamptz,
  resolution_due timestamptz,
  sla_breached boolean NOT NULL DEFAULT false
);

CREATE FUNCTION public.check_rate_limit(
  _bucket_key text,
  _workspace_id uuid,
  _endpoint text DEFAULT NULL::text,
  _max_tokens integer DEFAULT 100,
  _refill_rate integer DEFAULT 10,
  _refill_sec integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.rate_limit_buckets(bucket_key, workspace_id, endpoint, max_tokens, refill_rate, refill_interval_sec)
  VALUES (_bucket_key, _workspace_id, _endpoint, _max_tokens, _refill_rate, _refill_sec)
  ON CONFLICT (bucket_key) DO NOTHING;
  UPDATE public.rate_limit_buckets SET tokens_remaining=tokens_remaining-1 WHERE bucket_key=_bucket_key;
  RETURN true;
END;
$$;

CREATE FUNCTION public.compute_thread_sla(_thread_id uuid, _workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.conversation_threads SET sla_breached=true WHERE id=_thread_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text,uuid,text,integer,integer,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_thread_sla(uuid,uuid) TO authenticated, service_role;
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.rate_limit_buckets'::regclass
      AND conname='rate_limit_buckets_bucket_key_key'
  ) THEN
    RAISE EXCEPTION 'legacy global bucket_key uniqueness remains';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.rate_limit_buckets'::regclass
      AND conname='rate_limit_buckets_workspace_bucket_key_key'
      AND pg_get_constraintdef(oid) ILIKE 'UNIQUE NULLS NOT DISTINCT (workspace_id, bucket_key)%'
  ) THEN
    RAISE EXCEPTION 'workspace-scoped rate-limit uniqueness missing';
  END IF;

  IF has_function_privilege('authenticated','public.check_rate_limit(text,uuid,text,integer,integer,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.compute_thread_sla(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated still executes R1B critical write RPCs';
  END IF;

  IF has_function_privilege('anon','public.check_rate_limit(text,uuid,text,integer,integer,integer)','EXECUTE')
     OR has_function_privilege('anon','public.compute_thread_sla(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'anon executes R1B critical write RPCs';
  END IF;

  IF NOT has_function_privilege('service_role','public.check_rate_limit(text,uuid,text,integer,integer,integer)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.compute_thread_sla(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'service_role lost R1B critical write RPCs';
  END IF;
END $$;

INSERT INTO public.workspaces(id,owner_id) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.sla_configs(workspace_id,first_response_minutes,next_response_minutes,resolution_minutes) VALUES
 ('11111111-1111-4111-8111-111111111111',10,20,60),
 ('22222222-2222-4222-8222-222222222222',30,40,120);
INSERT INTO public.conversation_threads(id,workspace_id,created_at,last_message_at,status) VALUES
 ('31111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',now()-interval '15 minutes',now()-interval '5 minutes','open'),
 ('32222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222',now()-interval '15 minutes',now()-interval '5 minutes','open');

SET ROLE service_role;

-- Same logical bucket key in two workspaces must produce independent rows.
SELECT public.check_rate_limit('shared-key','11111111-1111-4111-8111-111111111111','/api/test',3,1,60);
SELECT public.check_rate_limit('shared-key','22222222-2222-4222-8222-222222222222','/api/test',3,1,60);

-- Correct parent binding succeeds.
SELECT public.compute_thread_sla('31111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111');

-- Foreign/mismatched workspace input must fail even for trusted backend callers.
DO $$
BEGIN
  BEGIN
    PERFORM public.compute_thread_sla('32222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'expected thread/workspace mismatch denial';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.rate_limit_buckets WHERE bucket_key='shared-key') <> 2 THEN
    RAISE EXCEPTION 'same bucket key did not remain workspace-isolated';
  END IF;
  IF (SELECT count(DISTINCT workspace_id) FROM public.rate_limit_buckets WHERE bucket_key='shared-key') <> 2 THEN
    RAISE EXCEPTION 'workspace-scoped rate limit rows collapsed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_threads
    WHERE id='31111111-1111-4111-8111-111111111111'
      AND sla_response_due IS NOT NULL
      AND next_response_due IS NOT NULL
      AND resolution_due IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'matching-workspace SLA computation did not persist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.conversation_threads
    WHERE id='32222222-2222-4222-8222-222222222222'
      AND (sla_response_due IS NOT NULL OR next_response_due IS NOT NULL OR resolution_due IS NOT NULL OR sla_breached)
  ) THEN
    RAISE EXCEPTION 'mismatched SLA call mutated foreign thread';
  END IF;
END $$;
SQL

echo "R1B critical write boundary verifier: PASS"
