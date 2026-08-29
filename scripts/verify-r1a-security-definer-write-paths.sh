#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829183000_r1a_security_definer_write_paths.sql"
TEST_DB="r1a_secdef_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"

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
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO authenticated, service_role;

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL
);
CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE FUNCTION public.has_workspace_role(_workspace_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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

CREATE TABLE public.media_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  workspace_id uuid,
  usage_date date DEFAULT current_date,
  reset_at timestamptz DEFAULT now(),
  window_started_at timestamptz DEFAULT now(),
  window_ends_at timestamptz DEFAULT now() + interval '24 hours',
  image_count integer DEFAULT 0,
  video_count integer DEFAULT 0,
  video_seconds_used integer DEFAULT 0,
  image_limit integer DEFAULT 0,
  video_limit integer DEFAULT 0,
  video_seconds_limit integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.business_memory (
  business_id uuid NOT NULL,
  memory_key text NOT NULL,
  confidence numeric DEFAULT 0.5,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.call_scripts (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  usage_count integer DEFAULT 0,
  last_used_at timestamptz,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.assignment_rules (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL UNIQUE,
  strategy text NOT NULL,
  fallback_user_id uuid,
  last_assigned_index integer NOT NULL DEFAULT 0,
  max_open_per_agent integer NOT NULL DEFAULT 10,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.team_presence (
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL
);
CREATE TABLE public.conversation_threads (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  assigned_to text,
  status text NOT NULL DEFAULT 'new'
);

-- The fixture grants only the reads needed for post-call assertions. Mutation
-- authorization is still exercised exclusively through the SECURITY DEFINER RPCs.
GRANT SELECT ON public.call_scripts, public.conversation_threads TO authenticated, service_role;

-- Production-shaped vulnerable function identities. The migration must harden
-- these exact signatures rather than silently creating different overloads.
CREATE FUNCTION public.ensure_media_daily_usage(uuid,uuid,integer,integer)
RETURNS public.media_usage_daily LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$ BEGIN RETURN NULL::public.media_usage_daily; END $$;
CREATE FUNCTION public.ensure_media_daily_usage(uuid,uuid,integer,integer,integer DEFAULT 0)
RETURNS public.media_usage_daily LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$ BEGIN RETURN NULL::public.media_usage_daily; END $$;
CREATE FUNCTION public.consume_media_quota(uuid,uuid,text,integer,integer)
RETURNS public.media_usage_daily LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$ BEGIN RETURN NULL::public.media_usage_daily; END $$;
CREATE FUNCTION public.consume_media_quota(uuid,uuid,text,integer,integer,integer DEFAULT 0,integer DEFAULT NULL)
RETURNS public.media_usage_daily LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$ BEGIN RETURN NULL::public.media_usage_daily; END $$;
CREATE FUNCTION public.boost_memory_confidence(uuid,text,numeric DEFAULT 0.05)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$ BEGIN NULL; END $$;
CREATE FUNCTION public.increment_usage_count(_script_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$ BEGIN UPDATE public.call_scripts SET usage_count=COALESCE(usage_count,0)+1 WHERE id=_script_id; END $$;
CREATE FUNCTION public.assign_thread_round_robin(_workspace_id uuid,_thread_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$ BEGIN UPDATE public.conversation_threads SET assigned_to='unsafe' WHERE id=_thread_id; RETURN NULL; END $$;

GRANT EXECUTE ON FUNCTION public.ensure_media_daily_usage(uuid,uuid,integer,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_media_daily_usage(uuid,uuid,integer,integer,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_media_quota(uuid,uuid,text,integer,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_media_quota(uuid,uuid,text,integer,integer,integer,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.boost_memory_confidence(uuid,text,numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_usage_count(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_thread_round_robin(uuid,uuid) TO authenticated, service_role;

INSERT INTO public.workspaces(id,owner_id) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner');

INSERT INTO public.call_scripts(id,workspace_id) VALUES
 ('31111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'),
 ('32222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222');
INSERT INTO public.assignment_rules(id,workspace_id,strategy,last_assigned_index,max_open_per_agent) VALUES
 ('41111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','round_robin',0,10),
 ('42222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','round_robin',0,10);
INSERT INTO public.team_presence(workspace_id,user_id,status) VALUES
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','online'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','online');
INSERT INTO public.conversation_threads(id,workspace_id,status) VALUES
 ('51111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','new'),
 ('52222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','new');
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  _identity text;
BEGIN
  FOREACH _identity IN ARRAY ARRAY[
    'public.consume_media_quota(uuid,uuid,text,integer,integer)',
    'public.consume_media_quota(uuid,uuid,text,integer,integer,integer,integer)',
    'public.ensure_media_daily_usage(uuid,uuid,integer,integer)',
    'public.ensure_media_daily_usage(uuid,uuid,integer,integer,integer)',
    'public.boost_memory_confidence(uuid,text,numeric)'
  ] LOOP
    IF has_function_privilege('authenticated', _identity, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated still executes backend-only %', _identity;
    END IF;
    IF has_function_privilege('anon', _identity, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon still executes backend-only %', _identity;
    END IF;
    IF NOT has_function_privilege('service_role', _identity, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role lost backend-only %', _identity;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('authenticated','public.increment_usage_count(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.assign_thread_round_robin(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated lost required browser RPC execution';
  END IF;
  IF has_function_privilege('anon','public.increment_usage_count(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.assign_thread_round_robin(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'anon unexpectedly executes browser RPCs';
  END IF;
  IF NOT has_function_privilege('service_role','public.increment_usage_count(uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.assign_thread_round_robin(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'service_role lost browser RPC execution';
  END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);

-- Positive own-workspace member cases.
SELECT public.increment_usage_count('31111111-1111-4111-8111-111111111111');
DO $$
BEGIN
  IF (SELECT usage_count FROM public.call_scripts WHERE id='31111111-1111-4111-8111-111111111111') <> 1 THEN
    RAISE EXCEPTION 'own-workspace script usage was not incremented';
  END IF;
END $$;
SELECT public.assign_thread_round_robin(
  '11111111-1111-4111-8111-111111111111',
  '51111111-1111-4111-8111-111111111111'
);
DO $$
BEGIN
  IF (SELECT assigned_to FROM public.conversation_threads WHERE id='51111111-1111-4111-8111-111111111111')
     <> 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' THEN
    RAISE EXCEPTION 'own-workspace thread was not assigned to the available member';
  END IF;
END $$;

-- Cross-workspace script mutation must fail.
DO $$
BEGIN
  BEGIN
    PERFORM public.increment_usage_count('32222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'expected cross-workspace script denial';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

-- Supplying own workspace with another workspace's thread must fail parent binding.
DO $$
BEGIN
  BEGIN
    PERFORM public.assign_thread_round_robin(
      '11111111-1111-4111-8111-111111111111',
      '52222222-2222-4222-8222-222222222222'
    );
    RAISE EXCEPTION 'expected thread/workspace mismatch denial';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

-- Supplying the foreign workspace and its real thread must still fail caller authz.
DO $$
BEGIN
  BEGIN
    PERFORM public.assign_thread_round_robin(
      '22222222-2222-4222-8222-222222222222',
      '52222222-2222-4222-8222-222222222222'
    );
    RAISE EXCEPTION 'expected foreign-workspace assignment denial';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT set_config('request.jwt.claim.sub','',false);

-- Trusted backend execution remains available even without a user subject.
SELECT public.increment_usage_count('32222222-2222-4222-8222-222222222222');
SELECT public.assign_thread_round_robin(
  '22222222-2222-4222-8222-222222222222',
  '52222222-2222-4222-8222-222222222222'
);

RESET ROLE;
DO $$
BEGIN
  IF (SELECT usage_count FROM public.call_scripts WHERE id='32222222-2222-4222-8222-222222222222') <> 1 THEN
    RAISE EXCEPTION 'service_role script usage did not persist';
  END IF;
  IF (SELECT assigned_to FROM public.conversation_threads WHERE id='52222222-2222-4222-8222-222222222222')
     <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' THEN
    RAISE EXCEPTION 'service_role thread assignment did not persist';
  END IF;
END $$;
SQL

echo "R1A SECURITY DEFINER write-path verifier: PASS"
