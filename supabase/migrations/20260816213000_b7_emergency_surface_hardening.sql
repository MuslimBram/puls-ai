-- Migration: 20260816213000_b7_emergency_surface_hardening.sql
-- B7 Emergency Surface Hardening - Wave 1 V2
-- Hardens 10 backend/cron/trigger-only functions by revoking access from PUBLIC, anon, and authenticated
-- Fixes search_path for 4 sensitive functions while preserving email_queue search_path="" and verify_white_label_license public grant contract.

-- ============================================================================
-- 1. HARDENING 10 BACKEND / CRON / TRIGGER-ONLY FUNCTIONS
-- ============================================================================

-- 1. cleanup_expired_unpaid_accounts()
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_unpaid_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_unpaid_accounts() TO service_role;
ALTER FUNCTION public.cleanup_expired_unpaid_accounts() SET search_path = public, pg_temp;

-- 2. enqueue_email(text, jsonb)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pg_temp;

-- 3. read_email_batch(text, integer, integer)
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pg_temp;

-- 4. delete_email(text, bigint)
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pg_temp;

-- 5. move_to_dlq(text, text, bigint, jsonb)
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pg_temp;

-- 6. email_queue_dispatch() (Preserving intentional search_path="" for secure isolation)
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;

-- 7. email_queue_wake() (Preserving intentional search_path="" for secure isolation)
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;

-- 8. reset_daily_ai_replies()
REVOKE EXECUTE ON FUNCTION public.reset_daily_ai_replies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_daily_ai_replies() TO service_role;
ALTER FUNCTION public.reset_daily_ai_replies() SET search_path = public, pg_temp;

-- 9. reset_monthly_usage()
REVOKE EXECUTE ON FUNCTION public.reset_monthly_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_monthly_usage() TO service_role;
ALTER FUNCTION public.reset_monthly_usage() SET search_path = public, pg_temp;

-- 10. reset_expired_media_daily_usage()
REVOKE EXECUTE ON FUNCTION public.reset_expired_media_daily_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_expired_media_daily_usage() TO service_role;
ALTER FUNCTION public.reset_expired_media_daily_usage() SET search_path = public, pg_temp;


-- ============================================================================
-- 2. FIXING MUTABLE SEARCH_PATH ON 4 SENSITIVE FUNCTIONS (FULL LIVE SIGNATURES)
-- ============================================================================

DO $$
BEGIN
  -- 11. evaluate_contact_policy(uuid,uuid,text,text)
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'evaluate_contact_policy'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.evaluate_contact_policy(uuid,uuid,text,text) SET search_path = public, pg_temp';
  END IF;

  -- 12. validate_nba_against_rules(uuid,text,numeric,text,uuid)
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'validate_nba_against_rules'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.validate_nba_against_rules(uuid,text,numeric,text,uuid) SET search_path = public, pg_temp';
  END IF;

  -- 13. verify_white_label_license(text) (Preserving intentional PUBLIC grant contract)
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'verify_white_label_license'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.verify_white_label_license(text) SET search_path = public, pg_temp';
  END IF;

  -- 14. notify_admin_on_payment_submission()
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'notify_admin_on_payment_submission'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.notify_admin_on_payment_submission() SET search_path = public, pg_temp';
  END IF;
END $$;
