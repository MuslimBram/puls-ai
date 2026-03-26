
-- Add payment_status to subscriptions (trial = free trial active, pending = needs payment, paid = paid)
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'trial';

-- Platform wallet for app revenue
CREATE TABLE public.platform_wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  total_revenue numeric NOT NULL DEFAULT 0,
  total_withdrawn numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert single platform wallet row
INSERT INTO public.platform_wallet (id, balance, currency) VALUES (gen_random_uuid(), 0, 'EUR');

-- Platform withdrawal requests
CREATE TABLE public.platform_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  reason text,
  status text NOT NULL DEFAULT 'pending_ai_review',
  ai_risk_score numeric,
  ai_review_notes text,
  ai_reviewed_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  approval_notes text,
  approved_at timestamptz,
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.platform_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Platform wallet: only super_admin can read
CREATE POLICY "super_admin_read_platform_wallet" ON public.platform_wallet
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Withdrawal requests: super_admin and admin can read
CREATE POLICY "admin_read_withdrawals" ON public.platform_withdrawal_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- Only super_admin or admin can insert withdrawal requests
CREATE POLICY "admin_insert_withdrawals" ON public.platform_withdrawal_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- Only super_admin or admin can update (for approvals)
CREATE POLICY "admin_update_withdrawals" ON public.platform_withdrawal_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- Update handle_new_user to set payment_status based on account type
-- All users start with 7-day trial
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_workspace_id UUID;
  ref_code TEXT;
  ref_partner_id UUID;
  v_account_type TEXT;
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  ref_code := NEW.raw_user_meta_data->>'referral_code';
  v_account_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'business');
  
  IF ref_code IS NOT NULL AND ref_code != '' THEN
    SELECT id INTO ref_partner_id
    FROM public.partner_accounts
    WHERE referral_code = ref_code AND status = 'active';
  END IF;
  
  INSERT INTO public.workspaces (name, owner_id, referred_by_partner_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'My Workspace'),
    NEW.id,
    ref_partner_id
  )
  RETURNING id INTO new_workspace_id;
  
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'owner');
  
  -- All users get 7-day trial, payment_status = 'trial'
  INSERT INTO public.subscriptions (user_id, workspace_id, payment_status, trial_start, trial_end, plan)
  VALUES (
    NEW.id, 
    new_workspace_id, 
    'trial',
    now(),
    now() + interval '7 days',
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'billing_plan', ''), 'standard')
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'business_owner');
  
  IF ref_partner_id IS NOT NULL THEN
    UPDATE public.partner_accounts
    SET total_businesses = total_businesses + 1, updated_at = now()
    WHERE id = ref_partner_id;
  END IF;
  
  RETURN NEW;
END;
$$;
