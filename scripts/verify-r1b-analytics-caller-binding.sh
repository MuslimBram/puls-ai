#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829185000_r1b_analytics_caller_binding.sql"
TEST_DB="r1b_analytics_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"

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

CREATE TABLE public.conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  assigned_to text,
  status text NOT NULL DEFAULT 'open',
  sla_breached boolean NOT NULL DEFAULT false,
  first_response_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.chatbot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deal_id uuid
);
CREATE TABLE public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  direction text,
  sender_id text,
  channel_type text,
  is_unread boolean DEFAULT false,
  first_reply_at timestamptz,
  message_timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  is_auto_reply boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.reply_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  is_preferred boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.churn_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  risk_level text NOT NULL
);
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft'
);

-- Production-shaped vulnerable function identities. The corrective migration
-- must replace these exact SECURITY DEFINER signatures.
CREATE FUNCTION public.compute_agent_performance(uuid,timestamptz,timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public'
AS $$ BEGIN RETURN '{}'::jsonb; END $$;
CREATE FUNCTION public.compute_ai_metrics(uuid,timestamptz,timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public'
AS $$ BEGIN RETURN '{}'::jsonb; END $$;
CREATE FUNCTION public.compute_channel_performance(uuid,timestamptz,timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public'
AS $$ BEGIN RETURN '{}'::jsonb; END $$;
CREATE FUNCTION public.compute_funnel_analytics(uuid,timestamptz,timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public'
AS $$ BEGIN RETURN '{}'::jsonb; END $$;
CREATE FUNCTION public.compute_executive_summary(uuid,date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public'
AS $$ BEGIN RETURN '{}'::jsonb; END $$;

GRANT EXECUTE ON FUNCTION public.compute_agent_performance(uuid,timestamptz,timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_ai_metrics(uuid,timestamptz,timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_channel_performance(uuid,timestamptz,timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_funnel_analytics(uuid,timestamptz,timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_executive_summary(uuid,date) TO authenticated, service_role;

-- User B owns visible business data. User A must never be able to name B as
-- the analytics subject after the migration.
INSERT INTO public.leads(user_id,source,status,created_at) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','telegram','converted',now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','email','new',now());
INSERT INTO public.deals(user_id,status,value,created_at,updated_at) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','won',500,now(),now());
INSERT INTO public.conversation_threads(user_id,assigned_to,status,sla_breached,created_at) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','agent-b','open',true,now());
INSERT INTO public.ai_conversations(user_id,is_auto_reply,created_at) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,now());
INSERT INTO public.reply_drafts(user_id,is_preferred,created_at) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false,now());
INSERT INTO public.inbox_messages(user_id,direction,sender_id,channel_type,is_unread,message_timestamp) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','outbound','agent-b','telegram',false,now());
INSERT INTO public.churn_risk_scores(user_id,risk_level) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','high');
INSERT INTO public.campaigns(user_id,status) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active');
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  identity text;
BEGIN
  FOREACH identity IN ARRAY ARRAY[
    'public.compute_agent_performance(uuid,timestamp with time zone,timestamp with time zone)',
    'public.compute_ai_metrics(uuid,timestamp with time zone,timestamp with time zone)',
    'public.compute_channel_performance(uuid,timestamp with time zone,timestamp with time zone)',
    'public.compute_funnel_analytics(uuid,timestamp with time zone,timestamp with time zone)',
    'public.compute_executive_summary(uuid,date)'
  ] LOOP
    IF has_function_privilege('anon', identity, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon still executes %', identity;
    END IF;
    IF NOT has_function_privilege('authenticated', identity, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated lost browser analytics %', identity;
    END IF;
    IF NOT has_function_privilege('service_role', identity, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role lost analytics %', identity;
    END IF;
  END LOOP;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);

-- Own-subject calls remain valid for all five frontend RPCs.
SELECT public.compute_agent_performance('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now()-interval '30 days', now());
SELECT public.compute_ai_metrics('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now()-interval '30 days', now());
SELECT public.compute_channel_performance('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now()-interval '30 days', now());
SELECT public.compute_funnel_analytics('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now()-interval '30 days', now());
SELECT public.compute_executive_summary('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_date);

-- Foreign-subject calls must fail before any SECURITY DEFINER read occurs.
DO $$
BEGIN
  BEGIN
    PERFORM public.compute_agent_performance('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now()-interval '30 days', now());
    RAISE EXCEPTION 'expected compute_agent_performance foreign-subject denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.compute_ai_metrics('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now()-interval '30 days', now());
    RAISE EXCEPTION 'expected compute_ai_metrics foreign-subject denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.compute_channel_performance('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now()-interval '30 days', now());
    RAISE EXCEPTION 'expected compute_channel_performance foreign-subject denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.compute_funnel_analytics('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now()-interval '30 days', now());
    RAISE EXCEPTION 'expected compute_funnel_analytics foreign-subject denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.compute_executive_summary('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_date);
    RAISE EXCEPTION 'expected compute_executive_summary foreign-subject denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT set_config('request.jwt.claim.sub','',false);

-- Trusted backend may intentionally compute another subject.
SELECT public.compute_agent_performance('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now()-interval '30 days', now());
SELECT public.compute_ai_metrics('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now()-interval '30 days', now());
SELECT public.compute_channel_performance('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now()-interval '30 days', now());
SELECT public.compute_funnel_analytics('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now()-interval '30 days', now());
SELECT public.compute_executive_summary('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_date);
RESET ROLE;
SQL

echo "R1B analytics caller-binding verifier: PASS"
