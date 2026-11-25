-- Migration: 20260817014500_cleanup_unpaid_accounts_acl.sql
-- Emergency Runtime Security: Guarded REVOKE/GRANT for cleanup_expired_unpaid_accounts()
-- Ensures migration completes cleanly if function is absent, and restricts access strictly to service_role when present.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cleanup_expired_unpaid_accounts'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.cleanup_expired_unpaid_accounts() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.cleanup_expired_unpaid_accounts() TO service_role;
  END IF;
END $$;
