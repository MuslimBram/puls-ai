
-- Growth strategies
CREATE TABLE IF NOT EXISTS public.growth_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  strategy_type TEXT DEFAULT 'monthly',
  status TEXT DEFAULT 'draft',
  ai_analysis JSONB DEFAULT '{}',
  action_items JSONB DEFAULT '[]',
  competitive_signals JSONB DEFAULT '{}',
  experiments JSONB DEFAULT '[]',
  impact_metrics JSONB DEFAULT '{}',
  period_start DATE,
  period_end DATE,
  adopted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.growth_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own strategies" ON public.growth_strategies FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Growth action items tracking
CREATE TABLE IF NOT EXISTS public.growth_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.growth_strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  due_date DATE,
  completed_at TIMESTAMPTZ,
  outcome_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.growth_action_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own action items" ON public.growth_action_items FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Market expansion opportunities
CREATE TABLE IF NOT EXISTS public.market_expansion_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  opportunity_type TEXT NOT NULL DEFAULT 'region',
  title TEXT NOT NULL,
  description TEXT,
  region TEXT,
  segment TEXT,
  readiness_score NUMERIC(5,2) DEFAULT 0,
  confidence NUMERIC(5,2) DEFAULT 0.5,
  status TEXT DEFAULT 'detected',
  signals JSONB DEFAULT '{}',
  action_checklist JSONB DEFAULT '[]',
  performance JSONB DEFAULT '{}',
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.market_expansion_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own expansion opps" ON public.market_expansion_opportunities FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Pricing optimization suggestions
CREATE TABLE IF NOT EXISTS public.pricing_optimization_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  suggestion_type TEXT NOT NULL DEFAULT 'discount',
  title TEXT NOT NULL,
  description TEXT,
  current_state JSONB DEFAULT '{}',
  recommended_action JSONB DEFAULT '{}',
  predicted_impact JSONB DEFAULT '{}',
  confidence NUMERIC(5,2) DEFAULT 0.5,
  status TEXT DEFAULT 'pending',
  adopted_at TIMESTAMPTZ,
  outcome JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.pricing_optimization_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pricing suggestions" ON public.pricing_optimization_suggestions FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Pricing analytics snapshots
CREATE TABLE IF NOT EXISTS public.pricing_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  conversion_rate NUMERIC(5,2) DEFAULT 0,
  avg_revenue_per_user NUMERIC(10,2) DEFAULT 0,
  churn_rate NUMERIC(5,2) DEFAULT 0,
  upgrade_rate NUMERIC(5,2) DEFAULT 0,
  trial_conversion_rate NUMERIC(5,2) DEFAULT 0,
  offer_adoption_rate NUMERIC(5,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.pricing_analytics_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own pricing analytics" ON public.pricing_analytics_snapshots FOR ALL TO authenticated
  USING (user_id = auth.uid());
