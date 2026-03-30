
-- Function to check if freelancer qualifies for 40% discount
-- Requires 3+ active referral relations where the referred business has an active paid subscription
CREATE OR REPLACE FUNCTION public.check_freelancer_discount_eligibility(_freelancer_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _active_paid_count INT := 0;
  _required INT := 3;
  _eligible BOOLEAN := false;
  _details jsonb;
BEGIN
  -- Count referral relations where:
  -- 1. relation is active
  -- 2. relation_type = 'referral'
  -- 3. the referred business workspace has an active paid subscription
  SELECT COUNT(*) INTO _active_paid_count
  FROM public.freelancer_business_relations fbr
  JOIN public.subscriptions s ON s.workspace_id = fbr.business_workspace_id
  WHERE fbr.freelancer_user_id = _freelancer_user_id
    AND fbr.status = 'active'
    AND fbr.relation_type = 'referral'
    AND s.payment_status IN ('active', 'paid')
    AND (
      -- For monthly: must still be within package period
      (s.package_type = 'monthly' AND (s.package_end_at IS NULL OR s.package_end_at > now()))
      OR
      -- For longer packages: must be within package period
      (s.package_type IN ('3-month', '6-month', 'yearly') AND (s.package_end_at IS NULL OR s.package_end_at > now()))
      OR
      -- Legacy/no package_type: just check payment_status
      (s.package_type IS NULL AND s.payment_status IN ('active', 'paid'))
    );

  _eligible := _active_paid_count >= _required;

  _details := jsonb_build_object(
    'eligible', _eligible,
    'active_paid_referrals', _active_paid_count,
    'required', _required,
    'discount_percent', CASE WHEN _eligible THEN 40 ELSE 0 END,
    'message', CASE 
      WHEN _eligible THEN 'Kualifikoheni për zbritjen 40% me ' || _active_paid_count || ' referale aktive.'
      ELSE 'Nevojiten ' || _required || ' biznese referale aktive të paguara. Aktualisht keni ' || _active_paid_count || '.'
    END
  );

  RETURN _details;
END;
$$;
