
-- Update DB functions to use English messages

CREATE OR REPLACE FUNCTION public.check_freelancer_discount_eligibility(_freelancer_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _active_paid_count INT := 0;
  _required INT := 3;
  _eligible BOOLEAN := false;
  _details jsonb;
BEGIN
  SELECT COUNT(*) INTO _active_paid_count
  FROM public.freelancer_business_relations fbr
  JOIN public.subscriptions s ON s.workspace_id = fbr.business_workspace_id
  WHERE fbr.freelancer_user_id = _freelancer_user_id
    AND fbr.status = 'active'
    AND fbr.relation_type = 'referral'
    AND s.payment_status IN ('active', 'paid')
    AND (
      (s.package_type = 'monthly' AND (s.package_end_at IS NULL OR s.package_end_at > now()))
      OR
      (s.package_type IN ('3-month', '6-month', 'yearly') AND (s.package_end_at IS NULL OR s.package_end_at > now()))
      OR
      (s.package_type IS NULL AND s.payment_status IN ('active', 'paid'))
    );

  _eligible := _active_paid_count >= _required;

  _details := jsonb_build_object(
    'eligible', _eligible,
    'active_paid_referrals', _active_paid_count,
    'required', _required,
    'discount_percent', CASE WHEN _eligible THEN 40 ELSE 0 END,
    'message', CASE 
      WHEN _eligible THEN 'You qualify for the 40% discount with ' || _active_paid_count || ' active referrals.'
      ELSE 'You need ' || _required || ' active paid referral businesses. You currently have ' || _active_paid_count || '.'
    END
  );

  RETURN _details;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_freelancer_relation_eligibility(_freelancer_id uuid, _business_workspace_id uuid, _requested_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _existing RECORD;
BEGIN
  SELECT * INTO _existing
  FROM public.freelancer_business_relations
  WHERE freelancer_user_id = _freelancer_id
    AND business_workspace_id = _business_workspace_id
    AND status IN ('active', 'pending');

  IF _existing IS NOT NULL THEN
    IF _existing.relation_type = 'referral' AND _requested_type = 'management' THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'This business was referred by you. You cannot manage a business you referred.'
      );
    ELSIF _existing.relation_type = 'management' AND _requested_type = 'referral' THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'You already manage this business. You cannot earn a referral commission.'
      );
    ELSE
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'You already have a ' || _existing.relation_type || ' relationship with this business.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_asset_duplicate(_asset_type text, _asset_identifier text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _existing RECORD;
BEGIN
  SELECT ra.*, w.name as workspace_name
  INTO _existing
  FROM public.registered_assets ra
  JOIN public.workspaces w ON w.id = ra.workspace_id
  WHERE ra.asset_type = _asset_type
    AND LOWER(ra.asset_identifier) = LOWER(_asset_identifier)
    AND ra.is_active = true;

  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'is_duplicate', true,
      'existing_asset_id', _existing.id,
      'registered_to', _existing.workspace_name,
      'message', 'This ' || _asset_type || ' is already registered. Contact Admin for deactivation if you have a valid reason.'
    );
  END IF;

  RETURN jsonb_build_object('is_duplicate', false);
END;
$function$;
