-- Migration: 20260821121000_b7_cron_surface_hardening.sql
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_unpaid_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_unpaid_accounts() TO service_role;
ALTER FUNCTION public.cleanup_expired_unpaid_accounts() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;

REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;

REVOKE EXECUTE ON FUNCTION public.reset_daily_ai_replies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_daily_ai_replies() TO service_role;
ALTER FUNCTION public.reset_daily_ai_replies() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.reset_monthly_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_monthly_usage() TO service_role;
ALTER FUNCTION public.reset_monthly_usage() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.reset_expired_media_daily_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_expired_media_daily_usage() TO service_role;
ALTER FUNCTION public.reset_expired_media_daily_usage() SET search_path = public, pg_temp;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname='evaluate_contact_policy') THEN
    EXECUTE 'ALTER FUNCTION public.evaluate_contact_policy(uuid,uuid,text,text) SET search_path = public, pg_temp';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname='validate_nba_against_rules') THEN
    EXECUTE 'ALTER FUNCTION public.validate_nba_against_rules(uuid,text,numeric,text,uuid) SET search_path = public, pg_temp';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname='verify_white_label_license') THEN
    EXECUTE 'ALTER FUNCTION public.verify_white_label_license(text) SET search_path = public, pg_temp';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname='notify_admin_on_payment_submission') THEN
    EXECUTE 'ALTER FUNCTION public.notify_admin_on_payment_submission() SET search_path = public, pg_temp';
  END IF;
END $$;;
