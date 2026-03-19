
-- Personalization Engine
CREATE TABLE public.personalization_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  contact_identifier TEXT NOT NULL,
  contact_name TEXT,
  browsing_patterns JSONB DEFAULT '[]',
  campaign_interactions JSONB DEFAULT '[]',
  conversation_topics JSONB DEFAULT '[]',
  purchase_signals JSONB DEFAULT '[]',
  preferred_channel TEXT,
  preferred_timing TEXT,
  segment TEXT,
  engagement_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.personalization_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own personalization profiles" ON public.personalization_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.personalization_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'content',
  conditions JSONB DEFAULT '{}',
  actions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.personalization_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own personalization rules" ON public.personalization_rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.personalization_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  engagement_lift NUMERIC DEFAULT 0,
  conversion_change NUMERIC DEFAULT 0,
  message_resonance NUMERIC DEFAULT 0,
  segment_performance JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.personalization_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own personalization analytics" ON public.personalization_analytics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Demand Forecasting Engine
CREATE TABLE public.demand_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  forecast_type TEXT NOT NULL DEFAULT 'lead_volume',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  predicted_value NUMERIC DEFAULT 0,
  actual_value NUMERIC,
  confidence NUMERIC DEFAULT 0.5,
  factors JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.demand_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own demand forecasts" ON public.demand_forecasts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.resource_planning_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  suggestion_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.resource_planning_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own resource planning" ON public.resource_planning_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.forecast_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  forecast_accuracy NUMERIC DEFAULT 0,
  workload_adjustment_score NUMERIC DEFAULT 0,
  demand_trend JSONB DEFAULT '{}',
  efficiency_signals JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.forecast_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own forecast analytics" ON public.forecast_analytics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Workforce Optimization Engine
CREATE TABLE public.agent_utilization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  agent_user_id UUID NOT NULL,
  agent_name TEXT,
  active_conversation_minutes NUMERIC DEFAULT 0,
  call_handling_minutes NUMERIC DEFAULT 0,
  idle_minutes NUMERIC DEFAULT 0,
  automation_coverage_pct NUMERIC DEFAULT 0,
  efficiency_score NUMERIC DEFAULT 0,
  measurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_utilization ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own agent utilization" ON public.agent_utilization FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.capacity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  alert_type TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  affected_agent_id UUID,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.capacity_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own capacity alerts" ON public.capacity_alerts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.workforce_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  avg_utilization NUMERIC DEFAULT 0,
  efficiency_trend NUMERIC DEFAULT 0,
  staffing_score NUMERIC DEFAULT 0,
  queue_performance JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workforce_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own workforce analytics" ON public.workforce_analytics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
