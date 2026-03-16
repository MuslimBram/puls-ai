
-- Business referral codes table for non-partner businesses
CREATE TABLE IF NOT EXISTS public.business_referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  referral_code text NOT NULL UNIQUE,
  referred_count integer DEFAULT 0,
  reward_type text DEFAULT 'discount',
  reward_value numeric DEFAULT 10,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.business_referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own referral codes" ON public.business_referral_codes
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Business referrals tracking
CREATE TABLE IF NOT EXISTS public.business_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL,
  referred_user_id uuid,
  referred_email text,
  referral_code text NOT NULL,
  status text DEFAULT 'pending',
  reward_status text DEFAULT 'pending',
  reward_amount numeric DEFAULT 0,
  subscription_plan text,
  created_at timestamptz DEFAULT now(),
  converted_at timestamptz
);

ALTER TABLE public.business_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referrals" ON public.business_referrals
  FOR SELECT TO authenticated USING (auth.uid() = referrer_user_id);

CREATE POLICY "Users can insert own referrals" ON public.business_referrals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = referrer_user_id);

-- Payment notifications table for failed payment alerts
CREATE TABLE IF NOT EXISTS public.payment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id),
  notification_type text NOT NULL DEFAULT 'payment_failed',
  title text NOT NULL,
  message text NOT NULL,
  severity text DEFAULT 'warning',
  is_read boolean DEFAULT false,
  is_dismissed boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payment_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own payment notifications" ON public.payment_notifications
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Billing history view table (caches Stripe invoice data)
CREATE TABLE IF NOT EXISTS public.billing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id),
  stripe_invoice_id text,
  amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'usd',
  status text DEFAULT 'paid',
  description text,
  plan_name text,
  discount_amount numeric DEFAULT 0,
  refund_amount numeric DEFAULT 0,
  invoice_url text,
  invoice_pdf text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own billing history" ON public.billing_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all billing history" ON public.billing_history
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Index for fast billing history lookups
CREATE INDEX IF NOT EXISTS idx_billing_history_user ON public.billing_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_notifications_user ON public.payment_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_referrals_code ON public.business_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_business_referral_codes_user ON public.business_referral_codes(user_id);
