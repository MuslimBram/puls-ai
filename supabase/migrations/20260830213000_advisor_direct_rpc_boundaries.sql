-- Security Advisor follow-up preparation.
-- Do not blanket-revoke SECURITY DEFINER helpers: preserve intentional RLS/UI
-- surfaces, but make explicit-user/workspace parameters caller-bound.

-- Backend-only audit and duplicate helper boundaries.
REVOKE EXECUTE ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_asset_duplicate(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_asset_duplicate(text, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_freelancer_relation_eligibility(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_freelancer_relation_eligibility(uuid, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)
  IS 'Backend-only audit writer. Browser/client audit events must use the caller-bound record_client_audit_event RPC.';
COMMENT ON FUNCTION public.check_asset_duplicate(text, text)
  IS 'Backend-only duplicate checker invoked through the authenticated check-duplicate-asset Edge Function.';
COMMENT ON FUNCTION public.check_freelancer_relation_eligibility(uuid, uuid, text)
  IS 'Backend-only eligibility helper invoked through a caller-authenticated service boundary.';

-- Explicit-user business limit: self, platform admin, or service-role only.
CREATE OR REPLACE FUNCTION public.check_business_creation_limit(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _is_freelancer boolean := false;
  _is_collaborator boolean := false;
  _sub record;
  _existing_count integer;
  _max_businesses integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (_caller IS NULL OR (
       _user_id IS DISTINCT FROM _caller
       AND NOT public.has_role(_caller, 'admin'::public.app_role)
       AND NOT public.has_role(_caller, 'super_admin'::public.app_role)
     )) THEN
    RAISE EXCEPTION 'BUSINESS_LIMIT_SUBJECT_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('admin','super_admin')) INTO _is_admin;
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='freelancer') INTO _is_freelancer;
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='collaborator') INTO _is_collaborator;

  IF _is_admin THEN RETURN jsonb_build_object('allowed', true, 'reason', 'Admin: unlimited'); END IF;
  IF _is_collaborator AND NOT _is_freelancer THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Collaborators cannot create businesses. You can only access businesses you are assigned to.');
  END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE user_id=_user_id LIMIT 1;
  SELECT count(*) INTO _existing_count FROM public.business_profiles WHERE user_id=_user_id;

  IF _sub IS NOT NULL AND _sub.payment_status='trial' THEN
    IF _existing_count >= 1 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'During trial you can create only 1 business. Please choose a plan to create more.', 'current_count', _existing_count);
    END IF;
    RETURN jsonb_build_object('allowed', true, 'reason', 'Trial: 1 business allowed');
  END IF;

  IF _is_freelancer THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'Freelancer: requires separate package purchase per business', 'requires_package', true);
  END IF;

  IF _sub IS NOT NULL AND _sub.payment_status IN ('active','paid') THEN
    SELECT COALESCE((ps.feature_entitlements->>'maxBusinesses')::int, 1)
    INTO _max_businesses
    FROM public.pricing_settings ps
    WHERE ps.plan_key=COALESCE(_sub.plan,'standard') AND ps.is_donation=false
    LIMIT 1;

    IF _existing_count >= COALESCE(_max_businesses,1) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Business limit reached for your plan. Please upgrade.', 'current_count', _existing_count, 'max_allowed', _max_businesses);
    END IF;
    RETURN jsonb_build_object('allowed', true, 'current_count', _existing_count, 'max_allowed', _max_businesses);
  END IF;

  RETURN jsonb_build_object('allowed', false, 'reason', 'Active subscription required to create a business.');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_business_creation_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_business_creation_limit(uuid) TO authenticated, service_role;

-- UI-facing storage quota: the requested workspace must be one the caller can access.
CREATE OR REPLACE FUNCTION public.check_storage_quota(_workspace_id uuid, _resource_type text DEFAULT 'messages')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _quota record;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_workspace_access(_workspace_id) THEN
    RAISE EXCEPTION 'STORAGE_QUOTA_WORKSPACE_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT * INTO _quota FROM public.workspace_storage_quotas WHERE workspace_id=_workspace_id;
  IF _quota IS NULL THEN RETURN true; END IF;

  CASE _resource_type
    WHEN 'messages' THEN RETURN _quota.messages_count < _quota.max_messages;
    WHEN 'documents' THEN RETURN _quota.documents_count < _quota.max_documents;
    WHEN 'media' THEN RETURN _quota.media_size_mb < _quota.max_media_mb;
    ELSE RAISE EXCEPTION 'INVALID_STORAGE_RESOURCE_TYPE' USING ERRCODE='22023';
  END CASE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_storage_quota(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_storage_quota(uuid, text) TO authenticated, service_role;

-- Contact-policy checks are tenant-bound and the supplied lead must belong to it.
CREATE OR REPLACE FUNCTION public.evaluate_contact_policy(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_channel text,
  p_message_type text DEFAULT 'marketing'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_consent public.contact_consent%ROWTYPE;
  v_freq public.business_rules%ROWTYPE;
  v_cnt integer;
  v_max_day numeric;
  v_max_week numeric;
  v_suppr boolean;
  v_identifier text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_workspace_access(p_workspace_id) THEN
    RAISE EXCEPTION 'CONTACT_POLICY_WORKSPACE_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT contact_identifier INTO v_identifier
  FROM public.leads
  WHERE id=p_lead_id AND workspace_id=p_workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTACT_POLICY_LEAD_WORKSPACE_MISMATCH' USING ERRCODE='42501';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.global_suppression_list WHERE identifier=v_identifier
  ) INTO v_suppr;
  IF v_suppr THEN RETURN jsonb_build_object('allowed',false,'reason','globally_suppressed'); END IF;

  IF p_message_type='marketing' THEN
    SELECT * INTO v_consent
    FROM public.contact_consent
    WHERE workspace_id=p_workspace_id AND lead_id=p_lead_id AND channel=p_channel;
    IF FOUND AND (NOT v_consent.consented OR v_consent.opt_out_date IS NOT NULL OR v_consent.is_suppressed) THEN
      RETURN jsonb_build_object('allowed',false,'reason','no_channel_consent');
    END IF;

    SELECT * INTO v_freq
    FROM public.business_rules
    WHERE workspace_id=p_workspace_id AND rule_type='frequency_cap' AND is_enabled=true
    LIMIT 1;
    IF FOUND THEN
      v_max_day:=COALESCE((v_freq.config->>'max_marketing_per_day')::numeric,1);
      v_max_week:=COALESCE((v_freq.config->>'max_marketing_per_week')::numeric,3);
      SELECT count(*) INTO v_cnt FROM public.frequency_cap_log
      WHERE workspace_id=p_workspace_id AND lead_id=p_lead_id AND message_type='marketing' AND sent_at>now()-interval '24 hours';
      IF v_cnt>=v_max_day THEN RETURN jsonb_build_object('allowed',false,'reason','daily_cap_reached'); END IF;
      SELECT count(*) INTO v_cnt FROM public.frequency_cap_log
      WHERE workspace_id=p_workspace_id AND lead_id=p_lead_id AND message_type='marketing' AND sent_at>now()-interval '7 days';
      IF v_cnt>=v_max_week THEN RETURN jsonb_build_object('allowed',false,'reason','weekly_cap_reached'); END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('allowed',true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.evaluate_contact_policy(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_contact_policy(uuid, uuid, text, text) TO authenticated, service_role;

-- NBA validation can inspect only caller-accessible tenant rules/leads.
CREATE OR REPLACE FUNCTION public.validate_nba_against_rules(
  p_workspace_id uuid,
  p_action_type text,
  p_offer_value numeric,
  p_offer_unit text,
  p_lead_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rule public.business_rules%ROWTYPE;
  v_max numeric;
  v_inst_enabled boolean;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_workspace_access(p_workspace_id) THEN
    RAISE EXCEPTION 'NBA_WORKSPACE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_lead_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.leads WHERE id=p_lead_id AND workspace_id=p_workspace_id
  ) THEN
    RAISE EXCEPTION 'NBA_LEAD_WORKSPACE_MISMATCH' USING ERRCODE='42501';
  END IF;

  IF p_action_type IN ('personalized_offer','vip_reward','birthday_offer','anniversary_reward','nth_purchase_reward','high_basket_reward','win_back')
     AND p_offer_unit='pct' THEN
    SELECT * INTO v_rule FROM public.business_rules
    WHERE workspace_id=p_workspace_id AND rule_type='discount' AND is_enabled=true
      AND (valid_until IS NULL OR valid_until>=current_date)
    ORDER BY priority DESC LIMIT 1;
    v_max:=COALESCE((v_rule.config->>'max_pct')::numeric,100);
    IF p_offer_value>v_max THEN
      RETURN jsonb_build_object('allowed',false,'reason',format('Discount %.1f%% exceeds maximum %.1f%%',p_offer_value,v_max),'clamped_value',v_max,'rule_id',v_rule.id);
    END IF;
  END IF;

  IF p_action_type='installment_option' THEN
    SELECT (config->>'enabled')::boolean INTO v_inst_enabled
    FROM public.business_rules
    WHERE workspace_id=p_workspace_id AND rule_type='installment' AND is_enabled=true LIMIT 1;
    IF NOT COALESCE(v_inst_enabled,false) THEN
      RETURN jsonb_build_object('allowed',false,'reason','Installments not enabled');
    END IF;
  END IF;

  SELECT * INTO v_rule FROM public.business_rules
  WHERE workspace_id=p_workspace_id AND rule_type='discount' AND is_enabled=true LIMIT 1;
  RETURN jsonb_build_object('allowed',true,'rule_id',v_rule.id,'clamped_value',p_offer_value);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_nba_against_rules(uuid, text, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_nba_against_rules(uuid, text, numeric, text, uuid) TO authenticated, service_role;

-- Referral counts: self, platform admin, or service-role only.
CREATE OR REPLACE FUNCTION public.get_active_referral_count(_referrer_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_count integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (v_caller IS NULL OR (
       _referrer_user_id IS DISTINCT FROM v_caller
       AND NOT public.has_role(v_caller, 'admin'::public.app_role)
       AND NOT public.has_role(v_caller, 'super_admin'::public.app_role)
     )) THEN
    RAISE EXCEPTION 'REFERRAL_COUNT_SUBJECT_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.business_referrals
  WHERE referrer_user_id=_referrer_user_id AND status='active';
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_active_referral_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_referral_count(uuid) TO authenticated, service_role;
