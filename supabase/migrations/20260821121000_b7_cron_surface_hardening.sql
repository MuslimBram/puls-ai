-- Migration: 20260821121000_b7_cron_surface_hardening.sql
-- B7 Reconciliation: Close REVOKE gaps and fix mutable search_path on cron/backend functions.
--
-- Prior state on main (gaps this migration closes):
--   enqueue_email, read_email_batch, delete_email:
--     20260325090953_email_infra.sql revoked FROM PUBLIC only — anon and authenticated still missing.
--   cleanup_expired_unpaid_accounts, reset_daily_ai_replies, reset_monthly_usage,
--   reset_expired_media_daily_usage:
--     20260618070424 revoked FROM PUBLIC, anon only — authenticated still missing.
--   move_to_dlq, email_queue_dispatch, email_queue_wake:
--     Already fully covered (PUBLIC, anon, authenticated) — REVOKE below is idempotent, safe.
--   search_path for evaluate_contact_policy, validate_nba_against_rules,
--   verify_white_label_license, notify_admin_on_payment_submission: not set on main.
--
-- SOURCE/CANONICAL SECURITY HARDENING ONLY.
-- DO NOT APPLY TO PRODUCTION DATABASE YET.
-- Production DB rollout remains blocked pending migration baseline/history reconciliation.

-- ============================================================================
-- 1. COMPLETE REVOKE FROM authenticated FOR CRON/BACKEND-ONLY FUNCTIONS
--    (REVOKE is idempotent — safe even where partial revokes already exist)
-- ============================================================================

-- enqueue_email(text, jsonb)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pg_temp;

-- read_email_batch(text, integer, integer)
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pg_temp;

-- delete_email(text, bigint)
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pg_temp;

-- cleanup_expired_unpaid_accounts()
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_unpaid_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_unpaid_accounts() TO service_role;
ALTER FUNCTION public.cleanup_expired_unpaid_accounts() SET search_path = public, pg_temp;

-- move_to_dlq(text, text, bigint, jsonb) — already fully revoked; REVOKE idempotent
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pg_temp;

-- email_queue_dispatch() — already fully revoked; REVOKE idempotent; preserving intentional search_path=""
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;

-- email_queue_wake() — already fully revoked; REVOKE idempotent; preserving intentional search_path=""
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;

-- reset_daily_ai_replies()
REVOKE EXECUTE ON FUNCTION public.reset_daily_ai_replies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_daily_ai_replies() TO service_role;
ALTER FUNCTION public.reset_daily_ai_replies() SET search_path = public, pg_temp;

-- reset_monthly_usage()
REVOKE EXECUTE ON FUNCTION public.reset_monthly_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_monthly_usage() TO service_role;
ALTER FUNCTION public.reset_monthly_usage() SET search_path = public, pg_temp;

-- reset_expired_media_daily_usage()
REVOKE EXECUTE ON FUNCTION public.reset_expired_media_daily_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_expired_media_daily_usage() TO service_role;
ALTER FUNCTION public.reset_expired_media_daily_usage() SET search_path = public, pg_temp;


-- ============================================================================
-- 2. FIX MUTABLE SEARCH_PATH ON SENSITIVE FUNCTIONS
--    Using IF EXISTS guards — safe to run even if functions are not yet deployed.
-- ============================================================================

DO $$
BEGIN
  -- evaluate_contact_policy(uuid,uuid,text,text)
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'evaluate_contact_policy'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.evaluate_contact_policy(uuid,uuid,text,text) SET search_path = public, pg_temp';
  END IF;

  -- validate_nba_against_rules(uuid,text,numeric,text,uuid)
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'validate_nba_against_rules'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.validate_nba_against_rules(uuid,text,numeric,text,uuid) SET search_path = public, pg_temp';
  END IF;

  -- verify_white_label_license(text) — search_path only; preserving intentional PUBLIC execute grant
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'verify_white_label_license'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.verify_white_label_license(text) SET search_path = public, pg_temp';
  END IF;

  -- notify_admin_on_payment_submission()
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'notify_admin_on_payment_submission'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.notify_admin_on_payment_submission() SET search_path = public, pg_temp';
  END IF;
END $$;
