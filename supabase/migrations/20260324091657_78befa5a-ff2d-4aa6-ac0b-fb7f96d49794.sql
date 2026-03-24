
-- Revenue split configuration table (admin-managed)
CREATE TABLE public.revenue_split_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL UNIQUE DEFAULT 'default',
  platform_percent NUMERIC NOT NULL DEFAULT 30,
  owner_percent NUMERIC NOT NULL DEFAULT 50,
  freelancer_percent NUMERIC NOT NULL DEFAULT 20,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Owner/platform wallet (separate from partner_wallets which are for freelancers)
CREATE TABLE public.owner_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  wallet_type TEXT NOT NULL DEFAULT 'owner' CHECK (wallet_type IN ('owner', 'platform')),
  current_balance NUMERIC NOT NULL DEFAULT 0,
  lifetime_earnings NUMERIC NOT NULL DEFAULT 0,
  pending_amount NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Universal revenue transactions (for all roles)
CREATE TABLE public.revenue_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  wallet_type TEXT NOT NULL DEFAULT 'freelancer' CHECK (wallet_type IN ('owner', 'platform', 'freelancer', 'business')),
  transaction_type TEXT NOT NULL DEFAULT 'commission' CHECK (transaction_type IN ('commission', 'subscription_share', 'payout', 'adjustment', 'referral_bonus')),
  amount NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id TEXT,
  description TEXT,
  source_payment_amount NUMERIC,
  commission_percent NUMERIC,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default revenue split config
INSERT INTO public.revenue_split_config (config_key, platform_percent, owner_percent, freelancer_percent)
VALUES ('default', 30, 50, 20);

-- RLS
ALTER TABLE public.revenue_split_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_transactions ENABLE ROW LEVEL SECURITY;

-- Revenue split config: only admins can read/write
CREATE POLICY "Admins can manage revenue config" ON public.revenue_split_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'business_owner'));

-- Owner wallets: owner can see their own
CREATE POLICY "Users see own owner wallet" ON public.owner_wallets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can manage owner wallets" ON public.owner_wallets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Revenue transactions: users see their own
CREATE POLICY "Users see own revenue transactions" ON public.revenue_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins see all revenue transactions" ON public.revenue_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Function to process revenue split when a payment comes in
CREATE OR REPLACE FUNCTION public.process_revenue_split(
  _payment_amount NUMERIC,
  _business_workspace_id UUID,
  _payment_reference TEXT DEFAULT NULL,
  _description TEXT DEFAULT 'Subscription payment'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _config RECORD;
  _partner RECORD;
  _owner RECORD;
  _platform_share NUMERIC;
  _owner_share NUMERIC;
  _freelancer_share NUMERIC;
  _workspace RECORD;
  _result JSONB;
BEGIN
  -- Get active config
  SELECT * INTO _config FROM public.revenue_split_config WHERE config_key = 'default' AND is_active = true;
  IF _config IS NULL THEN
    RAISE EXCEPTION 'No active revenue split configuration found';
  END IF;

  -- Get workspace to find referral partner
  SELECT * INTO _workspace FROM public.workspaces WHERE id = _business_workspace_id;
  
  -- Calculate shares
  _platform_share := ROUND(_payment_amount * (_config.platform_percent / 100.0), 2);
  _owner_share := ROUND(_payment_amount * (_config.owner_percent / 100.0), 2);
  
  -- Check if there's a referring freelancer/partner
  IF _workspace.referred_by_partner_id IS NOT NULL THEN
    _freelancer_share := ROUND(_payment_amount * (_config.freelancer_percent / 100.0), 2);
    
    -- Get partner account
    SELECT * INTO _partner FROM public.partner_accounts WHERE id = _workspace.referred_by_partner_id;
    
    IF _partner IS NOT NULL THEN
      -- Credit freelancer wallet
      UPDATE public.partner_wallets
      SET current_balance = current_balance + _freelancer_share,
          lifetime_earnings = lifetime_earnings + _freelancer_share,
          updated_at = now()
      WHERE partner_id = _partner.id;
      
      -- Record freelancer transaction
      INSERT INTO public.revenue_transactions (user_id, wallet_type, transaction_type, amount, balance_after, reference_type, reference_id, description, source_payment_amount, commission_percent)
      SELECT _partner.user_id, 'freelancer', 'commission', _freelancer_share,
             pw.current_balance, 'subscription', _payment_reference, _description || ' - Freelancer commission',
             _payment_amount, _config.freelancer_percent
      FROM public.partner_wallets pw WHERE pw.partner_id = _partner.id;
      
      -- Record partner commission
      INSERT INTO public.partner_commissions (partner_id, workspace_id, plan_name, billing_period_start, billing_period_end, gross_amount, commission_percent, commission_amount, commission_status)
      VALUES (_partner.id, _business_workspace_id, 'subscription', now(), now() + interval '1 month', _payment_amount, _config.freelancer_percent, _freelancer_share, 'approved');
    END IF;
  ELSE
    -- No referrer, platform gets freelancer share too
    _platform_share := _platform_share + ROUND(_payment_amount * (_config.freelancer_percent / 100.0), 2);
    _freelancer_share := 0;
  END IF;
  
  -- Credit owner wallet (workspace owner gets their share too if they're the platform owner)
  -- For now, record as platform revenue transaction
  INSERT INTO public.revenue_transactions (user_id, wallet_type, transaction_type, amount, balance_after, reference_type, reference_id, description, source_payment_amount, commission_percent)
  VALUES (_workspace.owner_id, 'platform', 'subscription_share', _platform_share, 0, 'subscription', _payment_reference, _description || ' - Platform share', _payment_amount, _config.platform_percent);

  -- Owner share transaction
  INSERT INTO public.revenue_transactions (user_id, wallet_type, transaction_type, amount, balance_after, reference_type, reference_id, description, source_payment_amount, commission_percent)
  VALUES (_workspace.owner_id, 'owner', 'subscription_share', _owner_share, 0, 'subscription', _payment_reference, _description || ' - Owner share', _payment_amount, _config.owner_percent);

  _result := jsonb_build_object(
    'payment_amount', _payment_amount,
    'platform_share', _platform_share,
    'owner_share', _owner_share,
    'freelancer_share', _freelancer_share,
    'has_referrer', _workspace.referred_by_partner_id IS NOT NULL
  );

  RETURN _result;
END;
$$;
