
-- ══════════════════════════════════════════════════════════════════════════════
-- SECURITY HARDENING: get_cron_secret() and internal_config
-- Before any secret is inserted, lock down access completely.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Revoke all existing grants on the function
REVOKE ALL ON FUNCTION public.get_cron_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cron_secret() FROM anon;
REVOKE ALL ON FUNCTION public.get_cron_secret() FROM authenticated;
REVOKE ALL ON FUNCTION public.get_cron_secret() FROM service_role;

-- 2. Recreate with hardened search_path (prevents search_path hijack attacks)
DROP FUNCTION IF EXISTS public.get_cron_secret();

CREATE OR REPLACE FUNCTION public.get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT value FROM public.internal_config WHERE key = 'cron_secret' LIMIT 1;
$$;

-- 3. Grant ONLY to postgres (pg_cron execution role)
REVOKE ALL ON FUNCTION public.get_cron_secret() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cron_secret() TO postgres;

-- 4. Harden internal_config table
-- Drop any existing RLS policies (none should exist but be explicit)
DROP POLICY IF EXISTS "service_role_insert" ON public.internal_config;
DROP POLICY IF EXISTS "postgres_all" ON public.internal_config;

-- Ensure RLS is enabled
ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_config FORCE ROW LEVEL SECURITY;

-- Revoke direct table access from browser-facing roles
REVOKE ALL ON TABLE public.internal_config FROM anon;
REVOKE ALL ON TABLE public.internal_config FROM authenticated;
REVOKE ALL ON TABLE public.internal_config FROM PUBLIC;

-- service_role: management INSERT/UPDATE only — no SELECT (secrets must not be readable via RPC)
REVOKE SELECT ON TABLE public.internal_config FROM service_role;
GRANT INSERT, UPDATE ON TABLE public.internal_config TO service_role;

-- postgres superuser retains full access for pg_cron and migrations
GRANT ALL ON TABLE public.internal_config TO postgres;
;
