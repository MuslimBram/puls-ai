-- Enforce the promised AI + 7/7 admin gate server-side and restrict privileged RPC execution.
ALTER TABLE public.gift_subscription_requests
  DROP CONSTRAINT IF EXISTS gift_subscription_requests_approvals_required_check;
ALTER TABLE public.gift_subscription_requests
  ADD CONSTRAINT gift_subscription_requests_approvals_required_check CHECK (approvals_required = 7);

CREATE OR REPLACE FUNCTION public.enforce_gift_approval_requirements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gift gift_subscription_requests%ROWTYPE;
  v_count integer;
  v_is_reg boolean;
BEGIN
  SELECT * INTO v_gift FROM gift_subscription_requests WHERE id=NEW.gift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift not found'; END IF;
  IF v_gift.status != 'pending_approval' THEN
    RAISE EXCEPTION 'Gift not in pending_approval status (current: %)', v_gift.status;
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM gift_approval_registry
    WHERE admin_user_id=NEW.admin_user_id AND is_active=true
  ) INTO v_is_reg;
  IF NOT v_is_reg THEN RAISE EXCEPTION 'Not a designated approver'; END IF;
  IF v_gift.initiated_by=NEW.admin_user_id THEN RAISE EXCEPTION 'Initiator cannot self-approve'; END IF;

  SELECT COUNT(*)+1 INTO v_count FROM gift_subscription_approvals WHERE gift_id=NEW.gift_id;
  UPDATE gift_subscription_requests SET
    approvals_received=v_count,
    status=CASE
      WHEN v_count>=7 AND ai_approved IS TRUE THEN 'approved'
      ELSE 'pending_approval'
    END,
    updated_at=now()
  WHERE id=NEW.gift_id;

  INSERT INTO gift_subscription_audit(gift_id,event_type,event_data,actor_id)
  VALUES(NEW.gift_id,'admin_approved',
    jsonb_build_object('approval_num',v_count,'admin',NEW.admin_user_id,'ai_approved',v_gift.ai_approved),NEW.admin_user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_gift_subscription(p_gift_id uuid, p_activator_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gift gift_subscription_requests%ROWTYPE;
  v_cnt integer; v_is_admin boolean; v_end date; v_acct_id uuid;
BEGIN
  SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=p_activator_id AND role IN ('admin','super_admin')) INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT * INTO v_gift FROM gift_subscription_requests WHERE id=p_gift_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift not found'; END IF;
  IF v_gift.ai_approved IS NOT TRUE OR v_gift.ai_check_at IS NULL THEN
    RAISE EXCEPTION 'AI risk approval required';
  END IF;
  IF v_gift.approvals_required <> 7 THEN RAISE EXCEPTION 'Exactly 7 approvals are required'; END IF;
  SELECT COUNT(DISTINCT admin_user_id) INTO v_cnt FROM gift_subscription_approvals WHERE gift_id=p_gift_id;
  IF v_cnt <> 7 THEN RAISE EXCEPTION 'Exactly 7 independent admin approvals required; found %',v_cnt; END IF;
  IF v_gift.status!='approved' THEN RAISE EXCEPTION 'Must be approved (current: %)',v_gift.status; END IF;

  v_end := COALESCE(v_gift.custom_expiry_date,(CURRENT_DATE+(v_gift.duration_months*INTERVAL '1 month'))::date);
  IF v_gift.recipient_user_id IS NOT NULL THEN
    INSERT INTO subscriptions(user_id,plan,subscription_status,payment_status,payment_method,
      billing_cycle_start,package_start_at,package_end_at,package_type,package_duration_months,updated_at)
    VALUES(v_gift.recipient_user_id,v_gift.plan_key,'active','gift','gift',
      now(),now(),v_end::timestamptz,'gift',v_gift.duration_months,now())
    ON CONFLICT(user_id) DO UPDATE SET plan=EXCLUDED.plan,subscription_status='active',
      payment_status='gift',payment_method='gift',billing_cycle_start=now(),
      package_start_at=now(),package_end_at=EXCLUDED.package_end_at,
      package_duration_months=EXCLUDED.package_duration_months,updated_at=now();
  END IF;

  INSERT INTO accounting_transactions(external_ref,accounting_category,gross_amount,currency,
    payment_provider,provider_fees,payer_user_id,payer_label,beneficiary_user_id,
    source_table,source_id,accountant_review_status)
  VALUES(v_gift.gift_ref,'promotional_subscription_gift',0,COALESCE(v_gift.commercial_currency,'EUR'),
    'none',0,v_gift.initiated_by,'Owner Gift',v_gift.recipient_user_id,
    'gift_subscription_requests',p_gift_id,'pending') RETURNING id INTO v_acct_id;

  UPDATE gift_subscription_requests SET
    status='activated',activated_at=now(),start_date=CURRENT_DATE,end_date=v_end,
    accounting_tx_id=v_acct_id,updated_at=now() WHERE id=p_gift_id;
  INSERT INTO gift_subscription_audit(gift_id,event_type,event_data,actor_id)
  VALUES(p_gift_id,'activated',jsonb_build_object('end_date',v_end,'approvals',v_cnt,'ai_approved',true),p_activator_id);
  RETURN jsonb_build_object('ok',true,'end_date',v_end,'approvals_verified',v_cnt,'ai_verified',true);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_gift_subscription(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_gift_subscription(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.enforce_gift_approval_requirements() FROM PUBLIC, anon, authenticated;;
