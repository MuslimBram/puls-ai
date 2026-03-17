
-- 1. Broadcast compliance: add spam_score, approval, unsubscribe tracking
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS spam_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS unsubscribe_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounce_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compliance_notes text;

-- Broadcast opt-outs table
CREATE TABLE IF NOT EXISTS public.broadcast_optouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id),
  contact_identifier text NOT NULL,
  channel_type text NOT NULL DEFAULT 'all',
  reason text,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_identifier, channel_type)
);
ALTER TABLE public.broadcast_optouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own optouts" ON public.broadcast_optouts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_optouts_lookup ON public.broadcast_optouts(user_id, contact_identifier, channel_type);

-- 2. Dead letter retry: add next_retry_at and backoff tracking
ALTER TABLE public.dead_letter_queue
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_dlq_retry ON public.dead_letter_queue(status, next_retry_at) WHERE status = 'pending';

-- 3. Churn risk detection table
CREATE TABLE IF NOT EXISTS public.churn_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id),
  risk_level text NOT NULL DEFAULT 'low',
  risk_score numeric DEFAULT 0,
  signals jsonb DEFAULT '[]'::jsonb,
  last_active_at timestamptz,
  days_inactive integer DEFAULT 0,
  usage_trend text DEFAULT 'stable',
  leads_trend numeric DEFAULT 0,
  inbox_trend numeric DEFAULT 0,
  login_count_30d integer DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.churn_risk_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own churn risk" ON public.churn_risk_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin view all churn" ON public.churn_risk_scores FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_churn_risk_user ON public.churn_risk_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_churn_risk_level ON public.churn_risk_scores(risk_level) WHERE risk_level IN ('high', 'critical');

-- 4. Customer enriched profiles
CREATE TABLE IF NOT EXISTS public.enriched_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id),
  contact_identifier text NOT NULL,
  contact_name text,
  channel_types text[] DEFAULT '{}',
  total_messages integer DEFAULT 0,
  total_leads integer DEFAULT 0,
  total_deals integer DEFAULT 0,
  total_deal_value numeric DEFAULT 0,
  avg_intent_score numeric DEFAULT 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  last_channel text,
  tags text[] DEFAULT '{}',
  sentiment_summary text,
  ai_profile_summary text,
  campaign_interactions integer DEFAULT 0,
  broadcast_interactions integer DEFAULT 0,
  is_opted_out boolean DEFAULT false,
  enriched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_identifier)
);
ALTER TABLE public.enriched_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own enriched contacts" ON public.enriched_contacts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_enriched_contacts_lookup ON public.enriched_contacts(user_id, contact_identifier);
CREATE INDEX IF NOT EXISTS idx_enriched_contacts_workspace ON public.enriched_contacts(workspace_id);
