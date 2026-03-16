
-- 1. Payment mode enum
CREATE TYPE public.payment_mode AS ENUM ('declared_payment', 'undeclared_payment');

-- 2. Add payment columns to workspaces
ALTER TABLE public.workspaces 
  ADD COLUMN IF NOT EXISTS payment_mode public.payment_mode DEFAULT 'undeclared_payment',
  ADD COLUMN IF NOT EXISTS payment_accounts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS workspace_owner_partner_id uuid REFERENCES public.partner_accounts(id) ON DELETE SET NULL;

-- 3. Partner clients table
CREATE TABLE IF NOT EXISTS public.partner_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  relationship_status text NOT NULL DEFAULT 'active' CHECK (relationship_status IN ('active', 'churned', 'trial', 'pending')),
  total_revenue_generated numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (partner_id, workspace_id)
);

ALTER TABLE public.partner_clients ENABLE ROW LEVEL SECURITY;

-- Partners can see their own clients
CREATE POLICY "Partners view own clients" ON public.partner_clients
  FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.partner_accounts WHERE user_id = auth.uid()));

-- Admins full access
CREATE POLICY "Admins manage partner_clients" ON public.partner_clients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Payment account verification log
CREATE TABLE IF NOT EXISTS public.payment_account_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_index int NOT NULL DEFAULT 0,
  verified boolean DEFAULT false,
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  flagged boolean DEFAULT false,
  flag_reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payment_account_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payment verifications" ON public.payment_account_verifications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Payout tracking improvements - add stripe_connect_id and payout_details to partner_accounts
ALTER TABLE public.partner_accounts
  ADD COLUMN IF NOT EXISTS stripe_connect_id text,
  ADD COLUMN IF NOT EXISTS payout_details jsonb DEFAULT '{}'::jsonb;

-- 6. Add payout processing details to payout_requests
ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text,
  ADD COLUMN IF NOT EXISTS payout_details jsonb DEFAULT '{}'::jsonb;

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_partner_clients_partner ON public.partner_clients(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_clients_workspace ON public.partner_clients(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_partner ON public.workspaces(workspace_owner_partner_id);
CREATE INDEX IF NOT EXISTS idx_payment_verifications_workspace ON public.payment_account_verifications(workspace_id);
