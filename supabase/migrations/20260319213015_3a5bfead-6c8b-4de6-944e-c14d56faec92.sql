
-- Retention Maximization Engine
CREATE TABLE public.retention_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  contact_identifier TEXT NOT NULL,
  contact_name TEXT,
  risk_score NUMERIC DEFAULT 0,
  risk_level TEXT DEFAULT 'low',
  declining_engagement BOOLEAN DEFAULT false,
  reduced_campaign_interaction BOOLEAN DEFAULT false,
  slower_response BOOLEAN DEFAULT false,
  drop_in_activity BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  scored_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.retention_risk_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own retention risk scores" ON public.retention_risk_scores FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.retention_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  risk_score_id UUID REFERENCES public.retention_risk_scores(id) ON DELETE CASCADE,
  action_text TEXT NOT NULL,
  action_type TEXT DEFAULT 're_engagement_campaign',
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.retention_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own retention actions" ON public.retention_actions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.retention_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  churn_rate NUMERIC DEFAULT 0,
  retention_rate NUMERIC DEFAULT 100,
  avg_lifetime_value NUMERIC DEFAULT 0,
  recovery_count INTEGER DEFAULT 0,
  at_risk_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.retention_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own retention analytics" ON public.retention_analytics FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Partnership & Ecosystem Expansion Engine
CREATE TABLE public.partnership_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  partner_name TEXT NOT NULL,
  match_score NUMERIC DEFAULT 0,
  match_reason TEXT,
  opportunity_type TEXT DEFAULT 'joint_campaign',
  status TEXT DEFAULT 'suggested',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.partnership_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own partnership opportunities" ON public.partnership_opportunities FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.partnership_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  opportunity_id UUID REFERENCES public.partnership_opportunities(id) ON DELETE CASCADE,
  action_text TEXT NOT NULL,
  action_type TEXT DEFAULT 'outreach',
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.partnership_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own partnership actions" ON public.partnership_actions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.ecosystem_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_partners INTEGER DEFAULT 0,
  partner_driven_leads INTEGER DEFAULT 0,
  collaboration_campaigns INTEGER DEFAULT 0,
  ecosystem_revenue NUMERIC DEFAULT 0,
  partner_retention_rate NUMERIC DEFAULT 100,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ecosystem_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ecosystem analytics" ON public.ecosystem_analytics FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Innovation & Visitor Re-Engagement Engine
CREATE TABLE public.growth_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  title TEXT NOT NULL,
  hypothesis TEXT,
  experiment_type TEXT DEFAULT 'messaging_test',
  variant_a TEXT,
  variant_b TEXT,
  status TEXT DEFAULT 'draft',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  result_summary TEXT,
  lift_pct NUMERIC,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.growth_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own growth experiments" ON public.growth_experiments FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.visitor_inactivity_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  contact_identifier TEXT NOT NULL,
  contact_name TEXT,
  inactivity_score NUMERIC DEFAULT 0,
  days_inactive INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  inactivity_type TEXT DEFAULT 'no_engagement',
  recommended_channel TEXT DEFAULT 'email',
  recommended_time TIMESTAMPTZ,
  is_reengaged BOOLEAN DEFAULT false,
  reengaged_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.visitor_inactivity_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own visitor inactivity scores" ON public.visitor_inactivity_scores FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.reengagement_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reactivation_rate NUMERIC DEFAULT 0,
  engagement_recovery_pct NUMERIC DEFAULT 0,
  campaigns_sent INTEGER DEFAULT 0,
  churn_prevented INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.reengagement_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reengagement analytics" ON public.reengagement_analytics FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
