
-- 1. subscription_refunds table
CREATE TABLE public.subscription_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  subscription_id TEXT,
  payment_intent_id TEXT,
  refund_reason TEXT,
  refund_status TEXT NOT NULL DEFAULT 'requested',
  refund_window_expires_at TIMESTAMPTZ,
  usage_snapshot_json JSONB DEFAULT '{}'::jsonb,
  refund_amount NUMERIC DEFAULT 0,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.subscription_refunds ENABLE ROW LEVEL SECURITY;

-- Users can view their own refund requests
CREATE POLICY "Users can view own refunds" ON public.subscription_refunds
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can create refund requests
CREATE POLICY "Users can request refunds" ON public.subscription_refunds
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admins full access
CREATE POLICY "Admins manage refunds" ON public.subscription_refunds
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. partner_risk_flags table
CREATE TABLE public.partner_risk_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES public.partner_accounts(id) ON DELETE CASCADE NOT NULL,
  flag_type TEXT NOT NULL DEFAULT 'suspicious_activity',
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'low',
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.partner_risk_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage risk flags" ON public.partner_risk_flags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Add refund_window_days config to partner_accounts
ALTER TABLE public.partner_accounts
  ADD COLUMN IF NOT EXISTS refund_window_days INTEGER DEFAULT 7;

-- 4. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscription_refunds_workspace ON public.subscription_refunds(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subscription_refunds_status ON public.subscription_refunds(refund_status);
CREATE INDEX IF NOT EXISTS idx_partner_risk_flags_partner ON public.partner_risk_flags(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_status ON public.partner_commissions(commission_status);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_user_status ON public.inbox_messages(user_id, status);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_channel_ts ON public.inbox_messages(channel_id, message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_leads_user_status ON public.leads(user_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_workspace_date ON public.leads(workspace_id, message_date DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_sender ON public.inbox_messages(sender_identifier);
