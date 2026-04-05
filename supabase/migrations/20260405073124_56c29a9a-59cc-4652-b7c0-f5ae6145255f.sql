
-- 1. Add business_id to channels for business-level ownership
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.business_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_channels_business_id ON public.channels(business_id);

-- 2. Add credentials_encrypted column (vault reference, not plaintext)
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS credentials_encrypted jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. Add business_id to custom_channel_adapters
ALTER TABLE public.custom_channel_adapters ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.business_profiles(id) ON DELETE SET NULL;

-- 4. Business creation limit enforcement function
CREATE OR REPLACE FUNCTION public.check_business_creation_limit(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _role_record RECORD;
  _is_admin BOOLEAN := false;
  _is_freelancer BOOLEAN := false;
  _is_collaborator BOOLEAN := false;
  _sub RECORD;
  _existing_count INT;
  _max_businesses INT;
BEGIN
  -- Check roles
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'super_admin')) INTO _is_admin;
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'freelancer') INTO _is_freelancer;
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'collaborator') INTO _is_collaborator;
  
  -- Admins: unlimited
  IF _is_admin THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'Admin: unlimited');
  END IF;
  
  -- Collaborators: cannot create businesses
  IF _is_collaborator AND NOT _is_freelancer THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Collaborators cannot create businesses. You can only access businesses you are assigned to.');
  END IF;
  
  -- Get subscription
  SELECT * INTO _sub FROM public.subscriptions WHERE user_id = _user_id LIMIT 1;
  
  -- Count existing businesses
  SELECT COUNT(*) INTO _existing_count FROM public.business_profiles WHERE user_id = _user_id;
  
  -- Trial users: max 1 business
  IF _sub IS NOT NULL AND _sub.payment_status = 'trial' THEN
    IF _existing_count >= 1 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'During trial you can create only 1 business. Please choose a plan to create more.', 'current_count', _existing_count);
    END IF;
    RETURN jsonb_build_object('allowed', true, 'reason', 'Trial: 1 business allowed');
  END IF;
  
  -- Freelancers: must have paid subscription per business
  IF _is_freelancer THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'Freelancer: requires separate package purchase per business', 'requires_package', true);
  END IF;
  
  -- Paid business owners: check plan limits
  IF _sub IS NOT NULL AND _sub.payment_status IN ('active', 'paid') THEN
    -- Get max businesses from pricing_settings
    SELECT COALESCE((ps.feature_entitlements->>'maxBusinesses')::int, 1) INTO _max_businesses
    FROM public.pricing_settings ps
    WHERE ps.plan_key = COALESCE(_sub.plan, 'standard') AND ps.is_donation = false
    LIMIT 1;
    
    IF _existing_count >= COALESCE(_max_businesses, 1) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Business limit reached for your plan. Please upgrade.', 'current_count', _existing_count, 'max_allowed', _max_businesses);
    END IF;
    RETURN jsonb_build_object('allowed', true, 'current_count', _existing_count, 'max_allowed', _max_businesses);
  END IF;
  
  -- Expired/unpaid: cannot create
  RETURN jsonb_build_object('allowed', false, 'reason', 'Active subscription required to create a business.');
END;
$$;

-- 5. Validate channel-business ownership
CREATE OR REPLACE FUNCTION public.check_channel_business_ownership(_user_id uuid, _business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_profiles
    WHERE id = _business_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'super_admin')
  )
$$;
