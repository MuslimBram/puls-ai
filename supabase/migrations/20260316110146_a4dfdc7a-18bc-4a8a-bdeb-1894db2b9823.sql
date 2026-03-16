
-- PART 1: Commission Tracking
CREATE TABLE public.partner_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_id text,
  plan_name text NOT NULL DEFAULT 'standard',
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  gross_amount numeric(10,2) NOT NULL DEFAULT 0,
  commission_percent numeric(5,2) NOT NULL DEFAULT 10,
  commission_amount numeric(10,2) NOT NULL DEFAULT 0,
  commission_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own commissions"
  ON public.partner_commissions FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.partner_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Admin full access commissions"
  ON public.partner_commissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- PART 2: Wallet System
CREATE TABLE public.partner_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL UNIQUE REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  current_balance numeric(10,2) NOT NULL DEFAULT 0,
  lifetime_earnings numeric(10,2) NOT NULL DEFAULT 0,
  pending_amount numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own wallet"
  ON public.partner_wallets FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.partner_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Admin full access wallets"
  ON public.partner_wallets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.partner_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'commission_credit',
  amount numeric(10,2) NOT NULL DEFAULT 0,
  reference_id uuid,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own transactions"
  ON public.partner_wallet_transactions FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.partner_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Admin full access transactions"
  ON public.partner_wallet_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- PART 6: Payout Requests
CREATE TABLE public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  requested_amount numeric(10,2) NOT NULL,
  payout_status text NOT NULL DEFAULT 'requested',
  payout_method text NOT NULL DEFAULT 'manual',
  admin_note text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own payouts"
  ON public.payout_requests FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.partner_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Partners create payout requests"
  ON public.payout_requests FOR INSERT TO authenticated
  WITH CHECK (partner_id IN (SELECT id FROM public.partner_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Admin full access payouts"
  ON public.payout_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- PART 3: Billing mode on workspaces
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'direct_client_payment';

-- Auto-create wallet when partner is created
CREATE OR REPLACE FUNCTION public.create_partner_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.partner_wallets (partner_id)
  VALUES (NEW.id)
  ON CONFLICT (partner_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_partner_wallet
  AFTER INSERT ON public.partner_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.create_partner_wallet();

-- Backfill wallets for existing partners
INSERT INTO public.partner_wallets (partner_id)
SELECT id FROM public.partner_accounts
ON CONFLICT (partner_id) DO NOTHING;

-- PART 4: Referral discount config on partner_accounts
ALTER TABLE public.partner_accounts
  ADD COLUMN IF NOT EXISTS referral_discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_duration_months integer NOT NULL DEFAULT 0;
