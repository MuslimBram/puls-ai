
-- Supabase auto-grants EXECUTE to anon/authenticated/service_role via pg_default_acl.
-- We must explicitly revoke AFTER every CREATE FUNCTION.
-- Do NOT drop+recreate (that would just trigger the defaults again).
-- Instead: keep existing function, only update security properties.

-- 1. Explicit revokes (must be done after the function exists)
REVOKE ALL ON FUNCTION public.get_cron_secret() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM service_role;

-- 2. Ensure postgres retains access for pg_cron
GRANT EXECUTE ON FUNCTION public.get_cron_secret() TO postgres;

-- 3. Rebuild the function in-place with hardened search_path
--    (ALTER FUNCTION preserves ACL; CREATE OR REPLACE resets it via pg_default_acl)
--    Use a workaround: update the function body via CREATE OR REPLACE,
--    then immediately re-revoke before the transaction commits.
CREATE OR REPLACE FUNCTION public.get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT value FROM public.internal_config WHERE key = 'cron_secret' LIMIT 1;
$$;

-- Re-revoke immediately after CREATE OR REPLACE (same transaction)
REVOKE ALL ON FUNCTION public.get_cron_secret() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_cron_secret() TO postgres;

-- 4. Verify function ACL within same transaction
-- (will show the final state after all revokes)
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  array_to_string(p.proacl, ', ') AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_cron_secret';
;
