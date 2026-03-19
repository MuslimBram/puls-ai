
-- Reseller client workspaces tracking
CREATE TABLE IF NOT EXISTS public.reseller_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  assigned_plan TEXT DEFAULT 'standard',
  monthly_override_price NUMERIC(10,2),
  is_active BOOLEAN DEFAULT true,
  provisioned_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(partner_id, workspace_id)
);
ALTER TABLE public.reseller_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partners manage own clients" ON public.reseller_clients FOR ALL TO authenticated
  USING (partner_id IN (SELECT id FROM public.partner_accounts WHERE user_id = auth.uid()));

-- Marketing campaigns orchestration
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  campaign_type TEXT DEFAULT 'multi_channel',
  channels TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  target_audience JSONB DEFAULT '{}',
  content_config JSONB DEFAULT '{}',
  performance JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own marketing campaigns" ON public.marketing_campaigns FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- AI generated content library
CREATE TABLE IF NOT EXISTS public.ai_content_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'social_post',
  title TEXT,
  body TEXT NOT NULL,
  tone TEXT DEFAULT 'professional',
  target_audience TEXT,
  channel TEXT,
  status TEXT DEFAULT 'draft',
  performance_score NUMERIC(5,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ai_content_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own content" ON public.ai_content_library FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Autonomous task suggestions
CREATE TABLE IF NOT EXISTS public.autonomous_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  task_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'suggested',
  ai_confidence NUMERIC(5,2) DEFAULT 0.5,
  source_signal TEXT,
  source_entity_id UUID,
  action_payload JSONB DEFAULT '{}',
  accepted_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.autonomous_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own autonomous tasks" ON public.autonomous_tasks FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Autonomous automation suggestions
CREATE TABLE IF NOT EXISTS public.automation_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  suggestion_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  trigger_config JSONB DEFAULT '{}',
  action_config JSONB DEFAULT '{}',
  confidence NUMERIC(5,2) DEFAULT 0.5,
  status TEXT DEFAULT 'pending',
  adopted_at TIMESTAMPTZ,
  workflow_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.automation_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own suggestions" ON public.automation_suggestions FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Revenue opportunities
CREATE TABLE IF NOT EXISTS public.revenue_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  opportunity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  estimated_value NUMERIC(12,2) DEFAULT 0,
  confidence NUMERIC(5,2) DEFAULT 0.5,
  urgency TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'detected',
  source_entity_type TEXT,
  source_entity_id UUID,
  suggested_action TEXT,
  action_taken_at TIMESTAMPTZ,
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.revenue_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own opportunities" ON public.revenue_opportunities FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Revenue trend snapshots
CREATE TABLE IF NOT EXISTS public.revenue_trend_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  ai_attributed_revenue NUMERIC(12,2) DEFAULT 0,
  upsell_revenue NUMERIC(12,2) DEFAULT 0,
  new_deal_revenue NUMERIC(12,2) DEFAULT 0,
  trend_signal TEXT DEFAULT 'stable',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.revenue_trend_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own trends" ON public.revenue_trend_snapshots FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Operational intelligence log
CREATE TABLE IF NOT EXISTS public.operational_intelligence_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  signal_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  action_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.operational_intelligence_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own signals" ON public.operational_intelligence_log FOR ALL TO authenticated
  USING (user_id = auth.uid());
