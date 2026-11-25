
-- ══════════════════════════════════════════════════════════════
-- PAYMENT ARCHITECTURE v2 — Pulse AI
-- Base currency: EUR | Supported: EUR, USD, ALL
-- Priority: BANK_TRANSFER → PAYONEER → PAYPAL → STRIPE(disabled)
-- ══════════════════════════════════════════════════════════════

-- 1. Fix pricing_settings base currency default
ALTER TABLE pricing_settings
  ALTER COLUMN currency SET DEFAULT 'EUR';

COMMENT ON COLUMN pricing_settings.currency IS
  'Base/canonical currency for plan prices. Default EUR. ALL used for Albanian market display.';

-- 2. Add FX + payment_method tracking to billing_history
ALTER TABLE billing_history
  ADD COLUMN IF NOT EXISTS payment_method     text    DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS charged_currency   text,
  ADD COLUMN IF NOT EXISTS charged_amount     numeric,
  ADD COLUMN IF NOT EXISTS base_currency      text    DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS base_amount        numeric,
  ADD COLUMN IF NOT EXISTS fx_rate_used       numeric,
  ADD COLUMN IF NOT EXISTS reference_id       text;

COMMENT ON COLUMN billing_history.payment_method   IS 'bank_transfer | payoneer | paypal | stripe | wallet';
COMMENT ON COLUMN billing_history.charged_currency IS 'Actual currency charged (EUR, USD, ALL)';
COMMENT ON COLUMN billing_history.charged_amount   IS 'Actual amount charged in charged_currency';
COMMENT ON COLUMN billing_history.base_currency    IS 'Canonical base currency (always EUR)';
COMMENT ON COLUMN billing_history.base_amount      IS 'Amount in EUR (base)';
COMMENT ON COLUMN billing_history.fx_rate_used     IS 'FX rate applied if charged_currency != base_currency';
COMMENT ON COLUMN billing_history.reference_id     IS 'Manual payment reference ID (bank transfer / payoneer)';

-- 3. Add payment_method to subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_method    text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS payment_currency  text DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS pending_reference_id text;

COMMENT ON COLUMN subscriptions.payment_method      IS 'Last payment method used';
COMMENT ON COLUMN subscriptions.payment_currency    IS 'Currency of last payment';
COMMENT ON COLUMN subscriptions.pending_reference_id IS 'Reference ID awaiting admin verification';

-- 4. Admin-managed payment method configuration (IBAN, Payoneer, etc.)
-- Values stored here, NOT hardcoded in frontend
CREATE TABLE IF NOT EXISTS payment_method_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_type     text NOT NULL,  -- bank_transfer_ALL | bank_transfer_EUR | bank_transfer_USD | payoneer_USD | payoneer_EUR
  is_enabled      boolean NOT NULL DEFAULT false,
  display_name    text NOT NULL,
  instructions    text,           -- Human-readable instructions shown to customer
  account_name    text,           -- Beneficiary name
  account_details jsonb DEFAULT '{}', -- IBAN, BIC, account number, routing — SET VIA ADMIN DASHBOARD ONLY
  currency        text NOT NULL,
  country_target  text,           -- 'AL' | 'EU' | 'US' | null = all
  sort_order      integer DEFAULT 0,
  updated_at      timestamptz DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE payment_method_config IS
  'Admin-managed payment method configurations. account_details contains sensitive info — set via Dashboard, never hardcode in frontend.';

-- Seed with disabled placeholder rows (admin enables + fills details via Dashboard)
INSERT INTO payment_method_config (method_type, display_name, instructions, currency, country_target, sort_order, is_enabled)
VALUES
  ('bank_transfer_ALL', 'Transfertë Bankare (ALL)',
   'Bëni transfertën në llogarinë bankare shqiptare. Vendosni referencën e pagesës në fushën "Përshkrim".',
   'ALL', 'AL', 1, false),
  ('bank_transfer_EUR', 'Bank Transfer / SEPA (EUR)',
   'Transfer to our EUR IBAN account. Include your payment reference in the payment description.',
   'EUR', 'EU', 2, false),
  ('bank_transfer_USD', 'Wire Transfer (USD)',
   'Wire transfer to our USD receiving account. Include payment reference in memo field.',
   'USD', 'US', 3, false),
  ('payoneer_EUR', 'Payoneer (EUR)',
   'Send payment via Payoneer to our business account. Include payment reference.',
   'EUR', NULL, 4, false),
  ('payoneer_USD', 'Payoneer (USD)',
   'Send payment via Payoneer to our business account. Include payment reference in notes.',
   'USD', NULL, 5, false)
ON CONFLICT DO NOTHING;

-- RLS for payment_method_config
ALTER TABLE payment_method_config ENABLE ROW LEVEL SECURITY;

-- Public read for enabled configs (customers need to see bank details)
CREATE POLICY "public_read_enabled_payment_configs" ON payment_method_config
  FOR SELECT USING (is_enabled = true);

-- Admin write
CREATE POLICY "admin_manage_payment_configs" ON payment_method_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- 5. Manual payments table (bank transfer + payoneer flow)
CREATE TABLE IF NOT EXISTS manual_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id      text UNIQUE NOT NULL,  -- e.g. PULSE-2026-XXXXX
  user_id           uuid NOT NULL REFERENCES auth.users(id),
  workspace_id      uuid,
  plan_key          text NOT NULL,
  package_type      text NOT NULL DEFAULT 'monthly',
  payment_method    text NOT NULL,         -- bank_transfer_ALL | bank_transfer_EUR | payoneer_EUR | etc.
  charged_currency  text NOT NULL,
  charged_amount    numeric NOT NULL,
  base_currency     text NOT NULL DEFAULT 'EUR',
  base_amount       numeric NOT NULL,
  fx_rate_used      numeric,               -- null if charged_currency == base_currency
  status            text NOT NULL DEFAULT 'pending_payment',
  -- pending_payment → submitted → admin_verified → paid | rejected
  submitted_at      timestamptz,           -- when customer clicks "I have paid"
  verified_at       timestamptz,
  verified_by       uuid REFERENCES auth.users(id),
  rejection_reason  text,
  customer_note     text,                  -- Optional note from customer
  admin_note        text,
  invoice_id        uuid,                  -- FK to generated invoice
  billing_history_id uuid,
  subscription_activated_at timestamptz,
  metadata          jsonb DEFAULT '{}',
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

COMMENT ON TABLE manual_payments IS
  'Bank transfer and Payoneer payment submissions. Flow: pending_payment → submitted → paid (admin verified) → subscription activated.';
COMMENT ON COLUMN manual_payments.reference_id IS
  'Unique human-readable reference the customer includes in their bank transfer/Payoneer memo.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_manual_payments_user_id    ON manual_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_payments_status     ON manual_payments(status);
CREATE INDEX IF NOT EXISTS idx_manual_payments_reference  ON manual_payments(reference_id);
CREATE INDEX IF NOT EXISTS idx_manual_payments_created_at ON manual_payments(created_at DESC);

-- RLS
ALTER TABLE manual_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_manual_payments" ON manual_payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_create_manual_payments" ON manual_payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_submit_own_payment" ON manual_payments
  FOR UPDATE USING (auth.uid() = user_id AND status = 'pending_payment')
  WITH CHECK (status IN ('pending_payment', 'submitted'));

CREATE POLICY "admin_manage_manual_payments" ON manual_payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- 6. Reference ID generator function
CREATE OR REPLACE FUNCTION generate_payment_reference()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_ref text;
  v_exists boolean;
BEGIN
  LOOP
    v_ref := 'PULSE-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
             UPPER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR 6));
    SELECT EXISTS(SELECT 1 FROM manual_payments WHERE reference_id = v_ref) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_ref;
END;
$$;

-- 7. Auto-set reference_id on insert
CREATE OR REPLACE FUNCTION set_payment_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reference_id IS NULL OR NEW.reference_id = '' THEN
    NEW.reference_id := generate_payment_reference();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_payment_reference ON manual_payments;
CREATE TRIGGER trg_set_payment_reference
  BEFORE INSERT OR UPDATE ON manual_payments
  FOR EACH ROW EXECUTE FUNCTION set_payment_reference();

-- 8. Admin notification on payment submission
CREATE OR REPLACE FUNCTION notify_admin_on_payment_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'submitted' AND (OLD.status IS NULL OR OLD.status = 'pending_payment') THEN
    INSERT INTO business_notifications (user_id, title, message, notification_type, category, action_url)
    SELECT ur.user_id,
           'Manual Payment Submitted: ' || NEW.reference_id,
           'Customer submitted ' || NEW.payment_method || ' payment of ' ||
           NEW.charged_amount || ' ' || NEW.charged_currency ||
           ' for plan ' || NEW.plan_key || '. Reference: ' || NEW.reference_id,
           'info', 'billing', '/admin/payments'
    FROM user_roles ur
    WHERE ur.role IN ('admin', 'super_admin');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_payment ON manual_payments;
CREATE TRIGGER trg_notify_admin_payment
  AFTER INSERT OR UPDATE ON manual_payments
  FOR EACH ROW EXECUTE FUNCTION notify_admin_on_payment_submission();
;
