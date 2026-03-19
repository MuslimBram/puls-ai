
-- ============================================
-- PROCESS OPTIMIZATION ENGINE
-- ============================================
CREATE TABLE public.process_bottlenecks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bottleneck_type TEXT NOT NULL DEFAULT 'slow_deal',
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  affected_entity_id TEXT,
  metric_value NUMERIC,
  metric_unit TEXT,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.process_bottlenecks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bottlenecks" ON public.process_bottlenecks FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.posting_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'general',
  day_of_week INT NOT NULL DEFAULT 0,
  hour_of_day INT NOT NULL DEFAULT 9,
  engagement_score NUMERIC DEFAULT 0,
  recommended BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.posting_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own schedules" ON public.posting_schedules FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.content_style_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tone TEXT NOT NULL DEFAULT 'friendly',
  content_format TEXT DEFAULT 'text',
  engagement_score NUMERIC DEFAULT 0,
  audience_segment TEXT,
  recommendation TEXT,
  is_adopted BOOLEAN DEFAULT false,
  adopted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.content_style_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own style recs" ON public.content_style_recommendations FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.posting_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  engagement_lift NUMERIC DEFAULT 0,
  style_adoption_rate NUMERIC DEFAULT 0,
  reach_count INT DEFAULT 0,
  conversion_count INT DEFAULT 0,
  consistency_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.posting_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own posting analytics" ON public.posting_analytics FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- FUNNEL OPTIMIZATION ENGINE
-- ============================================
CREATE TABLE public.funnel_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  stage_order INT NOT NULL DEFAULT 0,
  entry_count INT DEFAULT 0,
  exit_count INT DEFAULT 0,
  drop_off_rate NUMERIC DEFAULT 0,
  avg_time_in_stage_hours NUMERIC DEFAULT 0,
  friction_points JSONB,
  analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own funnel stages" ON public.funnel_stages FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.funnel_optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES public.funnel_stages(id) ON DELETE SET NULL,
  optimization_type TEXT NOT NULL DEFAULT 'cta_timing',
  title TEXT NOT NULL,
  description TEXT,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  impact_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.funnel_optimizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own funnel opts" ON public.funnel_optimizations FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.funnel_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  experiment_type TEXT NOT NULL DEFAULT 'message',
  variant_a JSONB,
  variant_b JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  winner TEXT,
  conversion_a NUMERIC DEFAULT 0,
  conversion_b NUMERIC DEFAULT 0,
  sample_size INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.funnel_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own funnel experiments" ON public.funnel_experiments FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.funnel_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  overall_conversion_rate NUMERIC DEFAULT 0,
  drop_off_reduction NUMERIC DEFAULT 0,
  campaign_impact_score NUMERIC DEFAULT 0,
  experiment_outcomes JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.funnel_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own funnel analytics" ON public.funnel_analytics FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- OFFER OPTIMIZATION ENGINE
-- ============================================
CREATE TABLE public.offer_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  offer_name TEXT NOT NULL,
  offer_type TEXT NOT NULL DEFAULT 'discount',
  conversion_rate NUMERIC DEFAULT 0,
  engagement_score NUMERIC DEFAULT 0,
  revenue_impact NUMERIC DEFAULT 0,
  audience_segment TEXT,
  channel TEXT,
  characteristics JSONB,
  analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.offer_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own offer analysis" ON public.offer_analysis FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.offer_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL DEFAULT 'discount_timing',
  title TEXT NOT NULL,
  description TEXT,
  target_segment TEXT,
  is_adopted BOOLEAN DEFAULT false,
  adopted_at TIMESTAMPTZ,
  impact_estimate NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.offer_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own offer suggestions" ON public.offer_suggestions FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.offer_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  experiment_type TEXT NOT NULL DEFAULT 'pricing',
  variant_a JSONB,
  variant_b JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  winner TEXT,
  conversion_a NUMERIC DEFAULT 0,
  conversion_b NUMERIC DEFAULT 0,
  revenue_a NUMERIC DEFAULT 0,
  revenue_b NUMERIC DEFAULT 0,
  sample_size INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.offer_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own offer experiments" ON public.offer_experiments FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.offer_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  conversion_lift NUMERIC DEFAULT 0,
  segment_performance JSONB,
  revenue_impact NUMERIC DEFAULT 0,
  experiment_outcomes JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.offer_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own offer analytics" ON public.offer_analytics FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- CUSTOMER VALUE MAXIMIZATION + VIRAL RE-ENGAGEMENT
-- ============================================
CREATE TABLE public.customer_value_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_identifier TEXT NOT NULL,
  contact_name TEXT,
  repeat_interaction_count INT DEFAULT 0,
  upsell_responsiveness NUMERIC DEFAULT 0,
  engagement_depth NUMERIC DEFAULT 0,
  lifetime_value_estimate NUMERIC DEFAULT 0,
  value_trend TEXT DEFAULT 'stable',
  suggested_actions JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.customer_value_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own value signals" ON public.customer_value_signals FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.upsell_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL DEFAULT 'premium_activation',
  title TEXT NOT NULL,
  description TEXT,
  target_segment TEXT,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  revenue_impact NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.upsell_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own upsell actions" ON public.upsell_actions FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.viral_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL DEFAULT 'tag_prompt',
  prompt_text TEXT NOT NULL,
  campaign_id TEXT,
  incentive_type TEXT DEFAULT 'none',
  incentive_value TEXT,
  is_active BOOLEAN DEFAULT true,
  fire_count INT DEFAULT 0,
  conversion_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.viral_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own viral triggers" ON public.viral_triggers FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.viral_engagement_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sharing_rate NUMERIC DEFAULT 0,
  reengagement_lift NUMERIC DEFAULT 0,
  new_referrals INT DEFAULT 0,
  value_growth_indicator NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.viral_engagement_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own viral analytics" ON public.viral_engagement_analytics FOR ALL USING (auth.uid() = user_id);
