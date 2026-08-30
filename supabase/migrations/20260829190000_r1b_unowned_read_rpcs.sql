-- R1B: no-runtime-caller read RPCs are backend-only.

DO $$
DECLARE
  identities text[] := ARRAY[
    'public.get_media_usage_policy_for_user(uuid)',
    'public.is_contact_suppressed(uuid,text,text)',
    'public.check_freelancer_discount_eligibility(uuid)',
    'public.generate_daily_kpi(uuid)'
  ];
  identity text;
  proc_oid oid;
BEGIN
  FOREACH identity IN ARRAY identities LOOP
    proc_oid := to_regprocedure(identity);
    IF proc_oid IS NULL THEN
      RAISE EXCEPTION 'R1B read guard: missing function %', identity;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = proc_oid) THEN
      RAISE EXCEPTION 'R1B read guard: % is no longer SECURITY DEFINER', identity;
    END IF;
  END LOOP;
END $$;

ALTER FUNCTION public.get_media_usage_policy_for_user(uuid)
  SET search_path TO 'pg_catalog', 'public';
ALTER FUNCTION public.is_contact_suppressed(uuid,text,text)
  SET search_path TO 'pg_catalog', 'public';
ALTER FUNCTION public.check_freelancer_discount_eligibility(uuid)
  SET search_path TO 'pg_catalog', 'public';
ALTER FUNCTION public.generate_daily_kpi(uuid)
  SET search_path TO 'pg_catalog', 'public';
ALTER FUNCTION public.generate_daily_kpi(uuid) STABLE;

REVOKE ALL ON FUNCTION public.get_media_usage_policy_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_contact_suppressed(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_freelancer_discount_eligibility(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_daily_kpi(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_media_usage_policy_for_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_contact_suppressed(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_freelancer_discount_eligibility(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_daily_kpi(uuid) TO service_role;
