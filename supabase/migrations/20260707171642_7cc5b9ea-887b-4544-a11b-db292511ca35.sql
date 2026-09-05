
-- ============================================================
-- credit_transactions: read-only for users
-- ============================================================
DROP POLICY IF EXISTS "Users view own credit transactions" ON public.credit_transactions;
CREATE POLICY "Users view own credit transactions"
  ON public.credit_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- user_wallet_transactions: drop client INSERT
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.user_wallet_transactions;

-- ============================================================
-- user_wallets: drop client INSERT/UPDATE (backend only)
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own wallets" ON public.user_wallets;
DROP POLICY IF EXISTS "Users can update own wallets" ON public.user_wallets;

-- ============================================================
-- media_addons: split into SELECT-only for users
-- ============================================================
DROP POLICY IF EXISTS "Users can manage own media_addons" ON public.media_addons;
CREATE POLICY "Users can view own media_addons"
  ON public.media_addons
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- media_usage_daily: remove client-side INSERT/UPDATE
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own media daily usage" ON public.media_usage_daily;
DROP POLICY IF EXISTS "Users can update own media daily usage" ON public.media_usage_daily;

-- ============================================================
-- business_scan_submissions: tie inserts to submitting user
-- ============================================================
-- Add submitter_id column if missing (nullable to allow legacy rows)
ALTER TABLE public.business_scan_submissions
  ADD COLUMN IF NOT EXISTS submitter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Authenticated users can submit a scan" ON public.business_scan_submissions;
CREATE POLICY "Authenticated users submit their own scan"
  ON public.business_scan_submissions
  FOR INSERT TO authenticated
  WITH CHECK (submitter_id = auth.uid());

CREATE POLICY "Users view their own submissions"
  ON public.business_scan_submissions
  FOR SELECT TO authenticated
  USING (submitter_id = auth.uid());

-- ============================================================
-- api_keys: prevent privilege escalation via permissions column
-- ============================================================
DROP POLICY IF EXISTS "Users manage own API keys" ON public.api_keys;

CREATE POLICY "Users view own API keys"
  ON public.api_keys
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own API keys"
  ON public.api_keys
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Users may create their own API key rows only when permissions is either NULL
-- or the safe default ['read']; higher-privilege scopes must be granted server-side.
CREATE POLICY "Users insert own API keys with default permissions"
  ON public.api_keys
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      permissions IS NULL
      OR permissions = ARRAY['read']::text[]
    )
    AND (rate_limit_per_minute IS NULL OR rate_limit_per_minute <= 60)
  );

-- Users may update non-privilege metadata on their own keys (e.g. name, revoked flag).
-- Trigger below prevents privilege-escalation column changes.
CREATE POLICY "Users update own API keys metadata"
  ON public.api_keys
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.api_keys_block_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce for non-service-role, authenticated callers
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    RAISE EXCEPTION 'permissions column may only be modified by server-side logic';
  END IF;
  IF NEW.rate_limit_per_minute IS DISTINCT FROM OLD.rate_limit_per_minute THEN
    RAISE EXCEPTION 'rate_limit_per_minute may only be modified by server-side logic';
  END IF;
  IF NEW.key_hash IS DISTINCT FROM OLD.key_hash THEN
    RAISE EXCEPTION 'key_hash may only be modified by server-side logic';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id may not be reassigned';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS api_keys_block_privilege_escalation ON public.api_keys;
CREATE TRIGGER api_keys_block_privilege_escalation
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.api_keys_block_privilege_escalation();

-- ============================================================
-- Revoke public execute on internal SECURITY DEFINER helpers
-- ============================================================
DO $
BEGIN
  IF to_regprocedure('public.email_queue_dispatch()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.email_queue_wake()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
  END IF;
END $;
