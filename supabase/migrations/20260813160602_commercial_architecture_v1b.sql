
-- A. FIXED PRICING MATRIX
UPDATE pricing_settings SET monthly_price_all=9900,  monthly_price_eur=109, monthly_price_usd=125,
  annual_price_all=100980, annual_price_eur=1068, annual_price_usd=1224 WHERE plan_key='standard';
UPDATE pricing_settings SET monthly_price_all=19900, monthly_price_eur=219, monthly_price_usd=249,
  annual_price_all=202980, annual_price_eur=2232, annual_price_usd=2540 WHERE plan_key IN ('professional','growth');
UPDATE pricing_settings SET monthly_price_all=39900, monthly_price_eur=439, monthly_price_usd=499,
  annual_price_all=406980, annual_price_eur=4474, annual_price_usd=5090 WHERE plan_key='advanced';
UPDATE pricing_settings SET monthly_price_all=79900, monthly_price_eur=879, monthly_price_usd=999,
  annual_price_all=814980, annual_price_eur=8960, annual_price_usd=10190 WHERE plan_key='enterprise';

-- E. ACCOUNTING TRANSACTIONS
CREATE TABLE IF NOT EXISTS accounting_transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref          text,
  accounting_category   text NOT NULL,
  gross_amount          numeric NOT NULL,
  currency              text NOT NULL,
  payment_provider      text,
  provider_fees         numeric DEFAULT 0,
  net_received          numeric GENERATED ALWAYS AS (gross_amount - COALESCE(provider_fees,0)) STORED,
  transaction_date      timestamptz NOT NULL DEFAULT now(),
  payer_user_id         uuid REFERENCES auth.users(id),
  payer_label           text,
  beneficiary_user_id   uuid REFERENCES auth.users(id),
  beneficiary_label     text,
  workspace_id          uuid,
  invoice_ref           text,
  source_table          text,
  source_id             uuid,
  accountant_review_status text NOT NULL DEFAULT 'pending',
  accountant_notes      text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  CONSTRAINT acct_category_check CHECK (accounting_category IN (
    'subscription_revenue','white_label_license_revenue','business_donation',
    'promotional_subscription_gift','personal_gift','salary','owner_distribution','refund','other'
  )),
  CONSTRAINT acct_review_check CHECK (accountant_review_status IN ('pending','reviewed','flagged','approved'))
);
COMMENT ON TABLE accounting_transactions IS 'personal_gift and salary are never inferred from payment destination — must be explicitly classified.';
ALTER TABLE accounting_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accountant_admin_read" ON accounting_transactions FOR SELECT USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin','accountant'))
);
CREATE POLICY "admin_manage_acct" ON accounting_transactions FOR ALL USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin'))
);

-- D. DONATIONS
CREATE TABLE IF NOT EXISTS donation_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL, currency text NOT NULL, label text,
  is_active boolean DEFAULT true, sort_order integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(), updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE donation_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_presets" ON donation_presets FOR SELECT USING (is_active=true);
CREATE POLICY "admin_manage_presets" ON donation_presets FOR ALL USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin'))
);

CREATE TABLE IF NOT EXISTS donation_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  workspace_id uuid,
  amount numeric NOT NULL,
  currency text NOT NULL,
  payment_method text NOT NULL,
  payment_provider text,
  provider_reference text,
  manual_reference_id text,
  status text NOT NULL DEFAULT 'pending',
  donor_message text,
  is_anonymous boolean DEFAULT false,
  accounting_tx_id uuid REFERENCES accounting_transactions(id),
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT don_status_check CHECK (status IN ('pending','completed','failed','refunded'))
);
COMMENT ON TABLE donation_transactions IS 'No app-imposed maximum donation amount. Regulatory/provider limits apply.';
ALTER TABLE donation_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_donations" ON donation_transactions FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "users_create_donations" ON donation_transactions FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "admin_manage_donations" ON donation_transactions FOR ALL USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin'))
);

-- B. WHITE-LABEL LICENSES
CREATE TABLE IF NOT EXISTS white_label_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id text UNIQUE NOT NULL DEFAULT ('WLL-'||UPPER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR 8))),
  license_key_hash text,
  licensee_user_id uuid REFERENCES auth.users(id),
  licensee_workspace_id uuid,
  legal_business_name text NOT NULL,
  custom_brand_name text NOT NULL,
  custom_domains text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  start_date date NOT NULL,
  expiration_date date,
  duration_type text NOT NULL,
  allowed_features jsonb DEFAULT '{}',
  max_workspaces integer DEFAULT 1, max_users integer DEFAULT 5,
  white_label_ui boolean DEFAULT true,
  reseller_permitted boolean DEFAULT false,
  price numeric, currency text, payment_method text, payment_reference text,
  accounting_tx_id uuid REFERENCES accounting_transactions(id),
  terms_version text, terms_accepted_at timestamptz, terms_accepted_by uuid REFERENCES auth.users(id),
  issued_by uuid NOT NULL REFERENCES auth.users(id),
  certificate_generated_at timestamptz, certificate_url text,
  revoked_at timestamptz, revoked_by uuid REFERENCES auth.users(id), revocation_reason text,
  suspended_at timestamptz, suspended_by uuid REFERENCES auth.users(id), suspension_reason text,
  notes text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT wl_status CHECK (status IN ('pending','active','suspended','expired','revoked')),
  CONSTRAINT wl_duration CHECK (duration_type IN ('monthly','quarterly','biannual','yearly','custom'))
);
COMMENT ON TABLE white_label_licenses IS 'White-label permission does NOT transfer Pulse AI source code, copyright, trademark, or ownership.';
COMMENT ON COLUMN white_label_licenses.reseller_permitted IS 'Separately configurable from white-label UI permission.';
COMMENT ON COLUMN white_label_licenses.price IS 'Owner-configurable. No hardcoded license prices.';

CREATE TABLE IF NOT EXISTS license_audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES white_label_licenses(id),
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}',
  performed_by uuid REFERENCES auth.users(id),
  performed_at timestamptz DEFAULT now()
);
COMMENT ON TABLE license_audit_trail IS 'Immutable. No DELETE or UPDATE permitted by design.';

ALTER TABLE white_label_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "licensee_read_own" ON white_label_licenses FOR SELECT USING (licensee_user_id=auth.uid());
CREATE POLICY "admin_manage_licenses" ON white_label_licenses FOR ALL USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin'))
);
ALTER TABLE license_audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read_lic_audit" ON license_audit_trail FOR SELECT USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin'))
);

-- C. GIFT SUBSCRIPTIONS — 7/7 ADMIN APPROVAL
CREATE TABLE IF NOT EXISTS gift_approval_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  role_label text, is_active boolean DEFAULT true,
  added_by uuid REFERENCES auth.users(id), added_at timestamptz DEFAULT now()
);
ALTER TABLE gift_approval_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_manage_registry" ON gift_approval_registry FOR ALL USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role='super_admin')
);
CREATE POLICY "admins_read_registry" ON gift_approval_registry FOR SELECT USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin'))
);

CREATE TABLE IF NOT EXISTS gift_subscription_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_ref text UNIQUE NOT NULL DEFAULT ('GIFT-'||UPPER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR 8))),
  initiated_by uuid NOT NULL REFERENCES auth.users(id),
  recipient_user_id uuid REFERENCES auth.users(id),
  recipient_workspace_id uuid,
  recipient_email text,
  plan_key text NOT NULL,
  duration_months integer NOT NULL,
  custom_expiry_date date,
  commercial_value numeric, commercial_currency text,
  amount_paid numeric NOT NULL DEFAULT 0,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending_ai_check',
  ai_risk_score numeric, ai_risk_summary text, ai_check_at timestamptz, ai_approved boolean,
  approvals_required integer NOT NULL DEFAULT 7,
  approvals_received integer NOT NULL DEFAULT 0,
  activated_at timestamptz, start_date date, end_date date,
  accounting_tx_id uuid REFERENCES accounting_transactions(id),
  notes text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT gift_status CHECK (status IN (
    'pending_ai_check','pending_approval','approved','activated','rejected','cancelled'
  )),
  CONSTRAINT gift_zero_cost CHECK (amount_paid=0)
);
COMMENT ON TABLE gift_subscription_requests IS 'amount_paid always 0. ai_approved informational only — AI alone cannot activate.';

CREATE TABLE IF NOT EXISTS gift_subscription_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id uuid NOT NULL REFERENCES gift_subscription_requests(id),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  admin_notes text, ip_address inet,
  UNIQUE(gift_id, admin_user_id)
);
COMMENT ON TABLE gift_subscription_approvals IS 'Unique per admin per gift. Owner excluded server-side. 7/7 required.';

CREATE TABLE IF NOT EXISTS gift_subscription_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id uuid NOT NULL REFERENCES gift_subscription_requests(id),
  event_type text NOT NULL, event_data jsonb DEFAULT '{}',
  actor_id uuid REFERENCES auth.users(id), recorded_at timestamptz DEFAULT now()
);

ALTER TABLE gift_subscription_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_subscription_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_subscription_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_create_gifts" ON gift_subscription_requests FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role='super_admin')
);
CREATE POLICY "admins_read_gifts" ON gift_subscription_requests FOR SELECT USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin'))
  OR recipient_user_id=auth.uid()
);
CREATE POLICY "admin_update_gifts" ON gift_subscription_requests FOR UPDATE USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin'))
);
CREATE POLICY "registered_approvers_approve" ON gift_subscription_approvals FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM gift_approval_registry WHERE admin_user_id=auth.uid() AND is_active=true)
  AND NOT EXISTS(
    SELECT 1 FROM gift_subscription_requests WHERE id=gift_id AND initiated_by=auth.uid()
  )
);
CREATE POLICY "admins_read_gift_approvals" ON gift_subscription_approvals FOR SELECT USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin'))
);
CREATE POLICY "admins_read_gift_audit" ON gift_subscription_audit FOR SELECT USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin'))
);

-- TRIGGER: enforce 7/7 approval + Owner-cannot-approve server-side
CREATE OR REPLACE FUNCTION enforce_gift_approval_requirements()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  SELECT EXISTS(SELECT 1 FROM gift_approval_registry WHERE admin_user_id=NEW.admin_user_id AND is_active=true) INTO v_is_reg;
  IF NOT v_is_reg THEN RAISE EXCEPTION 'Not a designated approver'; END IF;
  IF v_gift.initiated_by=NEW.admin_user_id THEN RAISE EXCEPTION 'Initiator cannot self-approve'; END IF;
  SELECT COUNT(*)+1 INTO v_count FROM gift_subscription_approvals WHERE gift_id=NEW.gift_id;
  UPDATE gift_subscription_requests SET
    approvals_received=v_count,
    status=CASE WHEN v_count>=approvals_required THEN 'approved' ELSE status END,
    updated_at=now()
  WHERE id=NEW.gift_id;
  INSERT INTO gift_subscription_audit(gift_id,event_type,event_data,actor_id)
  VALUES(NEW.gift_id,'admin_approved',
    jsonb_build_object('approval_num',v_count,'admin',NEW.admin_user_id),NEW.admin_user_id);
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_gift_approvals ON gift_subscription_approvals;
CREATE TRIGGER trg_gift_approvals
  BEFORE INSERT ON gift_subscription_approvals
  FOR EACH ROW EXECUTE FUNCTION enforce_gift_approval_requirements();

-- activate_gift_subscription (server-side, 7/7 verified)
CREATE OR REPLACE FUNCTION activate_gift_subscription(p_gift_id uuid, p_activator_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_gift gift_subscription_requests%ROWTYPE;
  v_cnt integer; v_is_admin boolean; v_end date; v_acct_id uuid;
BEGIN
  SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=p_activator_id AND role IN ('admin','super_admin')) INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT * INTO v_gift FROM gift_subscription_requests WHERE id=p_gift_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift not found'; END IF;
  IF v_gift.status!='approved' THEN RAISE EXCEPTION 'Must be approved (current: %)',v_gift.status; END IF;
  SELECT COUNT(*) INTO v_cnt FROM gift_subscription_approvals WHERE gift_id=p_gift_id;
  IF v_cnt < v_gift.approvals_required THEN
    RAISE EXCEPTION 'Insufficient approvals: % of %',v_cnt,v_gift.approvals_required;
  END IF;
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
  VALUES(p_gift_id,'activated',jsonb_build_object('end_date',v_end,'approvals',v_cnt),p_activator_id);
  RETURN jsonb_build_object('ok',true,'end_date',v_end,'approvals_verified',v_cnt);
END;$$;

-- Public license verification
CREATE OR REPLACE FUNCTION verify_white_label_license(p_license_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_lic white_label_licenses%ROWTYPE; BEGIN
  SELECT * INTO v_lic FROM white_label_licenses WHERE license_id=p_license_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','NOT_FOUND','verified',false); END IF;
  IF v_lic.status='active' AND v_lic.expiration_date IS NOT NULL AND v_lic.expiration_date<CURRENT_DATE THEN
    UPDATE white_label_licenses SET status='expired',updated_at=now() WHERE id=v_lic.id;
    v_lic.status:='expired';
  END IF;
  RETURN jsonb_build_object('status',UPPER(v_lic.status),'verified',v_lic.status='active',
    'license_id',v_lic.license_id,'licensee',v_lic.legal_business_name,'brand',v_lic.custom_brand_name,
    'issued',v_lic.start_date,'expires',v_lic.expiration_date,
    'white_label',v_lic.white_label_ui,'reseller',v_lic.reseller_permitted);
END;$$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_wll_license_id ON white_label_licenses(license_id);
CREATE INDEX IF NOT EXISTS idx_wll_status ON white_label_licenses(status);
CREATE INDEX IF NOT EXISTS idx_gift_status ON gift_subscription_requests(status);
CREATE INDEX IF NOT EXISTS idx_acct_category ON accounting_transactions(accounting_category);
CREATE INDEX IF NOT EXISTS idx_acct_date ON accounting_transactions(transaction_date DESC);
;
