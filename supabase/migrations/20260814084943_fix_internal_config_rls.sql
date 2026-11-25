
-- FORCE ROW LEVEL SECURITY was too aggressive:
-- It makes even postgres superuser subject to RLS, so with no policies
-- get_cron_secret() returns NULL even for postgres.
--
-- Correct model:
-- ENABLE ROW LEVEL SECURITY (not FORCE) = anon/authenticated blocked by RLS
-- Postgres superuser (and SECURITY DEFINER functions running as postgres)
-- naturally bypass RLS — no policy needed.
--
-- No table grants to anon/authenticated = they cannot issue any SQL on this table.
-- RLS enabled = even if a future erroneous grant occurred, no rows would be visible
-- without an explicit SELECT policy.

ALTER TABLE public.internal_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
-- Note: this is ENABLE without FORCE — postgres superuser bypasses RLS

-- Confirm table grants (should be empty for anon/authenticated)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'internal_config'
ORDER BY grantee, privilege_type;
;
