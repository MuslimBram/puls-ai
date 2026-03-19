
-- Sales Engine tables
CREATE TABLE public.hot_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID,
  deal_id UUID,
  score NUMERIC NOT NULL DEFAULT 0,
  signals TEXT[] DEFAULT '{}',
  estimated_value NUMERIC DEFAULT 0,
  urgency TEXT DEFAULT 'medium',
  recommended_action TEXT,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.hot_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own opportunities" ON public.hot_opportunities FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.sales_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID,
  deal_id UUID,
  outreach_type TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  content TEXT NOT NULL DEFAULT '',
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  response_at TIMESTAMPTZ,
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.sales_outreach ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own outreach" ON public.sales_outreach FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.sales_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  outreach_sent INT DEFAULT 0,
  outreach_responded INT DEFAULT 0,
  deals_created INT DEFAULT 0,
  deals_won INT DEFAULT 0,
  deals_lost INT DEFAULT 0,
  revenue_won NUMERIC DEFAULT 0,
  avg_deal_velocity_days NUMERIC DEFAULT 0,
  ai_assisted_revenue NUMERIC DEFAULT 0,
  win_loss_reasons JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.sales_performance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own snapshots" ON public.sales_performance_snapshots FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Financial Intelligence tables
CREATE TABLE public.revenue_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'channel',
  source_id TEXT,
  source_name TEXT,
  revenue_amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  deal_id UUID,
  campaign_id UUID,
  attributed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.revenue_attribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own attribution" ON public.revenue_attribution FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.profit_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL DEFAULT 'recommendation',
  title TEXT NOT NULL,
  description TEXT,
  impact_score NUMERIC DEFAULT 0,
  category TEXT DEFAULT 'general',
  recommended_action TEXT,
  is_dismissed BOOLEAN DEFAULT false,
  is_accepted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profit_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own insights" ON public.profit_insights FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.revenue_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  forecast_date DATE NOT NULL,
  predicted_leads INT DEFAULT 0,
  predicted_conversions INT DEFAULT 0,
  predicted_revenue NUMERIC DEFAULT 0,
  confidence NUMERIC DEFAULT 0.5,
  model_version TEXT DEFAULT 'v1',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.revenue_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own forecasts" ON public.revenue_forecasts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- SaaS Health tables
CREATE TABLE public.saas_metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  mrr NUMERIC DEFAULT 0,
  arr NUMERIC DEFAULT 0,
  active_workspaces INT DEFAULT 0,
  paying_users INT DEFAULT 0,
  trial_users INT DEFAULT 0,
  free_users INT DEFAULT 0,
  plan_distribution JSONB DEFAULT '{}',
  expansion_revenue NUMERIC DEFAULT 0,
  churned_revenue NUMERIC DEFAULT 0,
  net_revenue_retention NUMERIC DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.saas_metrics_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view saas metrics" ON public.saas_metrics_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.cohort_retention (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_month TEXT NOT NULL,
  signup_count INT DEFAULT 0,
  month_1_retained INT DEFAULT 0,
  month_2_retained INT DEFAULT 0,
  month_3_retained INT DEFAULT 0,
  month_6_retained INT DEFAULT 0,
  month_12_retained INT DEFAULT 0,
  avg_ltv NUMERIC DEFAULT 0,
  churn_segment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.cohort_retention ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view cohorts" ON public.cohort_retention FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.platform_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  status TEXT DEFAULT 'healthy',
  response_time_ms INT,
  error_count INT DEFAULT 0,
  request_count INT DEFAULT 0,
  cpu_usage NUMERIC,
  memory_usage NUMERIC,
  queue_depth INT DEFAULT 0,
  checked_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);
ALTER TABLE public.platform_health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view health" ON public.platform_health_checks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
