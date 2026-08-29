-- R2: legacy local MFA secret/code stores are backend-only.
-- Canonical customer TOTP flow uses Supabase Auth MFA via totp-manage.

DO $$
DECLARE
  totp_rows bigint;
  code_rows bigint;
BEGIN
  IF to_regclass('public.totp_secrets') IS NULL THEN
    RAISE EXCEPTION 'R2 guard: public.totp_secrets missing';
  END IF;
  IF to_regclass('public.user_security_codes') IS NULL THEN
    RAISE EXCEPTION 'R2 guard: public.user_security_codes missing';
  END IF;

  SELECT count(*) INTO totp_rows FROM public.totp_secrets;
  SELECT count(*) INTO code_rows FROM public.user_security_codes;
  IF totp_rows <> 0 OR code_rows <> 0 THEN
    RAISE EXCEPTION 'R2 guard: expected zero legacy security rows, found totp=% codes=%', totp_rows, code_rows;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='totp_secrets'
      AND policyname='Users manage own TOTP' AND cmd='ALL'
      AND 'authenticated' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'R2 guard: expected legacy TOTP browser policy missing or changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_security_codes'
      AND policyname='Users manage own security code' AND cmd='ALL'
      AND 'authenticated' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'R2 guard: expected legacy security-code browser policy missing or changed';
  END IF;
END $$;

DROP POLICY IF EXISTS "Users manage own TOTP" ON public.totp_secrets;
DROP POLICY IF EXISTS "Users manage own security code" ON public.user_security_codes;

ALTER TABLE public.totp_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages TOTP secrets"
ON public.totp_secrets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role manages security codes"
ON public.user_security_codes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.totp_secrets FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.user_security_codes FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.totp_secrets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_security_codes TO service_role;
