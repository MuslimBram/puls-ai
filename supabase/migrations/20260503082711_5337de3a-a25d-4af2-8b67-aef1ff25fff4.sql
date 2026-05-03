
-- Phase 3: Referral lifecycle statuses
-- Drop existing default to widen status set
ALTER TABLE public.business_referrals
  ALTER COLUMN status SET DEFAULT 'invited';

-- Backfill legacy values to new lifecycle
UPDATE public.business_referrals SET status = 'invited'
  WHERE status IS NULL OR status IN ('pending');
UPDATE public.business_referrals SET status = 'registered'
  WHERE status IN ('signed_up','converted') AND referred_user_id IS NOT NULL;

-- Enforce allowed values
ALTER TABLE public.business_referrals
  DROP CONSTRAINT IF EXISTS business_referrals_status_check;
ALTER TABLE public.business_referrals
  ADD CONSTRAINT business_referrals_status_check
  CHECK (status IN ('invited','registered','trial','active','expired','canceled'));

-- Lifecycle timestamps
ALTER TABLE public.business_referrals
  ADD COLUMN IF NOT EXISTS registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_check_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_business_referrals_status
  ON public.business_referrals(status);
CREATE INDEX IF NOT EXISTS idx_business_referrals_referred_user
  ON public.business_referrals(referred_user_id);

-- Helper: count of currently 'active' referrals for a user (paying)
CREATE OR REPLACE FUNCTION public.get_active_referral_count(_referrer_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.business_referrals
  WHERE referrer_user_id = _referrer_user_id AND status = 'active';
$$;

-- Sync function: derive referral status from subscription lifecycle
CREATE OR REPLACE FUNCTION public.sync_referral_statuses()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD;
  s RECORD;
  v_new_status text;
  v_updated int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.business_referrals
    WHERE referred_user_id IS NOT NULL
      AND status NOT IN ('canceled')
  LOOP
    SELECT subscription_status, payment_status, plan, package_end_at, trial_ends_at
      INTO s
    FROM public.subscriptions
    WHERE user_id = r.referred_user_id
    LIMIT 1;

    IF NOT FOUND THEN
      v_new_status := 'registered';
    ELSIF COALESCE(s.payment_status,'') IN ('active','paid')
       AND COALESCE(s.plan,'free') <> 'free'
       AND (s.package_end_at IS NULL OR s.package_end_at > now()) THEN
      v_new_status := 'active';
    ELSIF COALESCE(s.subscription_status,'') = 'trialing'
       OR COALESCE(s.payment_status,'') = 'trial' THEN
      v_new_status := 'trial';
    ELSIF COALESCE(s.payment_status,'') IN ('expired','canceled','unpaid') THEN
      v_new_status := CASE WHEN s.payment_status = 'canceled' THEN 'canceled' ELSE 'expired' END;
    ELSE
      v_new_status := 'registered';
    END IF;

    IF v_new_status <> r.status THEN
      UPDATE public.business_referrals SET
        status = v_new_status,
        registered_at    = COALESCE(registered_at, CASE WHEN v_new_status IN ('registered','trial','active','expired','canceled') THEN now() END),
        trial_started_at = COALESCE(trial_started_at, CASE WHEN v_new_status = 'trial' THEN now() END),
        activated_at     = COALESCE(activated_at,    CASE WHEN v_new_status = 'active' THEN now() END),
        expired_at       = CASE WHEN v_new_status = 'expired' THEN now() ELSE expired_at END,
        canceled_at      = CASE WHEN v_new_status = 'canceled' THEN now() ELSE canceled_at END,
        converted_at     = COALESCE(converted_at, CASE WHEN v_new_status = 'active' THEN now() END),
        last_status_check_at = now()
      WHERE id = r.id;
      v_updated := v_updated + 1;
    ELSE
      UPDATE public.business_referrals
      SET last_status_check_at = now()
      WHERE id = r.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated, 'ran_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.sync_referral_statuses() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_referral_statuses() TO service_role;
