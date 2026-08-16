-- Migration: 20260816210709_b7_rpc_hardening.sql
-- B7 RPC Security Hardening V4 for bootstrap_user_account_for and claim_community_ai_request

-- ============================================================================
-- 1. Hardening public.bootstrap_user_account_for(_user_id uuid)
-- Direct ACL: service_role ONLY. Body: Allows service_role OR authenticated-self (auth.uid() = _user_id)
-- Scope creep removed: super_admin auto-grant for designated emails removed.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bootstrap_user_account_for(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_workspace_id uuid;
  v_full_name text;
  v_avatar_url text;
  v_workspace_name text;
  v_ref_code text;
  v_ref_partner_id uuid;
BEGIN
  -- Body Guard: Allow service_role OR authenticated-self (calls via ensure_current_user_bootstrap)
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    NULL;
  ELSIF auth.uid() IS NOT NULL AND auth.uid() = _user_id THEN
    NULL;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permission denied';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  SELECT
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', '')), ''),
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'referral_code', '')), ''),
    COALESCE(NULLIF(SPLIT_PART(u.email, '@', 1), ''), 'My Workspace')
  INTO v_full_name, v_avatar_url, v_ref_code, v_workspace_name
  FROM auth.users u
  WHERE u.id = _user_id;

  IF v_full_name IS NULL THEN
    v_full_name := v_workspace_name;
  END IF;

  IF v_ref_code IS NOT NULL THEN
    SELECT id
    INTO v_ref_partner_id
    FROM public.partner_accounts
    WHERE referral_code = v_ref_code
      AND status = 'active'
    LIMIT 1;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (_user_id, v_full_name, v_avatar_url)
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
      avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url);

  SELECT id
  INTO v_workspace_id
  FROM public.workspaces
  WHERE owner_id = _user_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    INSERT INTO public.workspaces (name, owner_id, referred_by_partner_id)
    VALUES (COALESCE(v_full_name, 'My Workspace'), _user_id, v_ref_partner_id)
    RETURNING id INTO v_workspace_id;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, _user_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO UPDATE
  SET role = 'owner';

  INSERT INTO public.subscriptions (user_id, workspace_id, referred_by_partner_id)
  VALUES (_user_id, v_workspace_id, v_ref_partner_id)
  ON CONFLICT (user_id) DO UPDATE
  SET workspace_id = COALESCE(public.subscriptions.workspace_id, EXCLUDED.workspace_id),
      referred_by_partner_id = COALESCE(public.subscriptions.referred_by_partner_id, EXCLUDED.referred_by_partner_id);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'user'), (_user_id, 'business_owner')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_user_account_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_user_account_for(uuid) TO service_role;


-- ============================================================================
-- 2. Hardening public.claim_community_ai_request(...) -> service_role ONLY
-- Full signature: public.claim_community_ai_request(uuid,text,integer,text,text,uuid)
-- p_via closed set ('system', 'workspace')
-- Daily limit semantics: -1 = unlimited, 0 = capped/disabled, >0 = metered
-- Subscription entitlement: user_id UNIQUE check, free/basic mapped to standard (supabase/functions/ai-router/index.ts:554)
-- ============================================================================
DROP FUNCTION IF EXISTS public.claim_community_ai_request(uuid,text,integer,text,text,uuid);

CREATE OR REPLACE FUNCTION public.claim_community_ai_request(
  p_user_id uuid,
  p_module text,
  p_daily_limit integer DEFAULT NULL, -- Ignored for quota enforcement; limit resolved server-side
  p_request_id text DEFAULT NULL,
  p_via text DEFAULT 'system',
  p_workspace_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.community_ai_usage;
  v_counter public.community_ai_daily_counters;
  v_usage_id uuid;
  v_user_plan text;
  v_sub_status text;
  v_pay_status text;
  v_resolved_plan text;
  v_daily_limit integer;
BEGIN
  -- 1. Fail-closed Service Role Authorization Check
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permission denied: service_role required';
  END IF;

  -- 2. Closed Set Validation for p_via
  -- 'system': Platform metered quota path
  -- 'workspace': BYOK (Bring Your Own Key) path where workspace key is used; bypasses platform daily quota
  IF p_via NOT IN ('system', 'workspace') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid via parameter: must be system or workspace';
  END IF;

  -- 3. Idempotency Check (Duplicate request_id does NOT increment quota)
  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.community_ai_usage
    WHERE user_id = p_user_id AND module = p_module AND request_id = p_request_id;

    IF FOUND THEN
      IF v_existing.status = 'completed' THEN
        RETURN jsonb_build_object('status', 'completed', 'allowed', false, 'reused', true, 'record_id', v_existing.id);
      ELSIF v_existing.status = 'failed' THEN
        RETURN jsonb_build_object('status', 'failed', 'allowed', false, 'reused', true, 'error', v_existing.error_message);
      ELSIF v_existing.status = 'reserved' THEN
        RETURN jsonb_build_object('status', 'in_progress', 'code', '409_in_progress', 'allowed', false, 'reused', true);
      END IF;
    END IF;
  END IF;

  -- 4. Server-side Subscription & Quota Resolution
  -- Source: supabase/functions/ai-router/index.ts lines 554-555 (free/basic -> standard = 25 replies/day)
  SELECT plan, subscription_status, payment_status
  INTO v_user_plan, v_sub_status, v_pay_status
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  -- Cancelled / expired paid subscriptions fall back to standard plan
  IF LOWER(COALESCE(v_sub_status, '')) IN ('canceled', 'cancelled', 'expired', 'unpaid')
     OR LOWER(COALESCE(v_pay_status, '')) IN ('canceled', 'cancelled', 'unpaid', 'failed') THEN
    v_resolved_plan := 'standard';
  ELSE
    v_resolved_plan := CASE COALESCE(LOWER(v_user_plan), 'standard')
      WHEN 'free' THEN 'standard'
      WHEN 'basic' THEN 'standard'
      ELSE LOWER(COALESCE(v_user_plan, 'standard'))
    END;
  END IF;

  SELECT ai_replies_per_day_limit INTO v_daily_limit
  FROM public.pricing_settings
  WHERE plan_key = v_resolved_plan
  LIMIT 1;

  IF v_daily_limit IS NULL THEN
    SELECT ai_replies_per_day_limit INTO v_daily_limit
    FROM public.pricing_settings
    WHERE plan_key = 'standard'
    LIMIT 1;
  END IF;

  v_daily_limit := COALESCE(v_daily_limit, 25);

  -- 5. Daily Limit Semantics Check BEFORE Insert
  -- -1 = Unlimited (bypasses metering)
  --  0 = Capped / AI Disabled
  -- >0 = Metered Daily Quota
  IF p_via = 'system' AND v_daily_limit = 0 THEN
    RETURN jsonb_build_object('status', 'capped', 'code', 'daily_limit_exceeded', 'allowed', false);
  END IF;

  -- 6. Atomic Reservation Insert FIRST (Prevents race conditions & duplicate increments)
  BEGIN
    INSERT INTO public.community_ai_usage (
      user_id, workspace_id, module, status, request_id
    ) VALUES (
      p_user_id, p_workspace_id, p_module, 'reserved', p_request_id
    )
    RETURNING id INTO v_usage_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.community_ai_usage
    WHERE user_id = p_user_id AND module = p_module AND request_id = p_request_id;
    RETURN jsonb_build_object(
      'status', COALESCE(v_existing.status, 'in_progress'),
      'code', '409_in_progress',
      'allowed', false,
      'reused', true,
      'record_id', v_existing.id
    );
  END;

  -- 7. Quota Enforcement for system path (Counter increment occurs AFTER reservation success)
  -- If v_daily_limit = -1 (unlimited) or p_via = 'workspace' (BYOK), counter is skipped.
  IF p_via = 'system' AND v_daily_limit > 0 THEN
    INSERT INTO public.community_ai_daily_counters (user_id, module, usage_date, count)
    VALUES (p_user_id, p_module, (CURRENT_DATE AT TIME ZONE 'UTC'), 0)
    ON CONFLICT (user_id, module, usage_date) DO NOTHING;

    SELECT * INTO v_counter
    FROM public.community_ai_daily_counters
    WHERE user_id = p_user_id AND module = p_module AND usage_date = (CURRENT_DATE AT TIME ZONE 'UTC')
    FOR UPDATE;

    IF v_counter.count >= v_daily_limit THEN
      DELETE FROM public.community_ai_usage WHERE id = v_usage_id;
      RETURN jsonb_build_object('status', 'capped', 'code', 'daily_limit_exceeded', 'allowed', false);
    END IF;

    UPDATE public.community_ai_daily_counters
    SET count = count + 1,
        updated_at = clock_timestamp()
    WHERE user_id = p_user_id AND module = p_module AND usage_date = (CURRENT_DATE AT TIME ZONE 'UTC');
  END IF;

  RETURN jsonb_build_object(
    'status', 'reserved',
    'allowed', true,
    'usage_id', v_usage_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_community_ai_request FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_community_ai_request TO service_role;
