
-- Community Growth Engine
CREATE TABLE public.community_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  group_type TEXT NOT NULL DEFAULT 'discussion',
  member_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.community_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own community groups" ON public.community_groups FOR ALL TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.community_groups(id) ON DELETE CASCADE NOT NULL,
  contact_identifier TEXT NOT NULL,
  contact_name TEXT,
  role TEXT DEFAULT 'member',
  points INT DEFAULT 0,
  badges JSONB DEFAULT '[]',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own community members" ON public.community_members FOR ALL TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.community_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_members INT DEFAULT 0,
  active_members INT DEFAULT 0,
  new_members INT DEFAULT 0,
  engagement_rate NUMERIC DEFAULT 0,
  ambassador_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.community_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own community analytics" ON public.community_analytics FOR ALL TO authenticated USING (user_id = auth.uid());

-- Lead Magnet & Funnel Capture
CREATE TABLE public.lead_magnets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  magnet_type TEXT NOT NULL DEFAULT 'landing_page',
  content_config JSONB DEFAULT '{}',
  capture_fields JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft',
  views_count INT DEFAULT 0,
  captures_count INT DEFAULT 0,
  conversion_rate NUMERIC DEFAULT 0,
  nurture_sequence_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_magnets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own lead magnets" ON public.lead_magnets FOR ALL TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.lead_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  magnet_id UUID REFERENCES public.lead_magnets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  contact_data JSONB DEFAULT '{}',
  source_url TEXT,
  segment_tags TEXT[] DEFAULT '{}',
  nurture_status TEXT DEFAULT 'new',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own lead captures" ON public.lead_captures FOR ALL TO authenticated USING (user_id = auth.uid());

-- Gamification Growth Engine
CREATE TABLE public.gamification_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  achievement_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  points INT DEFAULT 0,
  criteria JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gamification_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own achievements" ON public.gamification_achievements FOR ALL TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.gamification_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_user_id UUID,
  total_points INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  level INT DEFAULT 1,
  badges_earned JSONB DEFAULT '[]',
  missions_completed INT DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gamification_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own gamification progress" ON public.gamification_progress FOR ALL TO authenticated USING (user_id = auth.uid());

-- AI Decision Automation
CREATE TABLE public.ai_suggested_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  confidence NUMERIC DEFAULT 0,
  impact_estimate TEXT,
  auto_executable BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending',
  executed_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  action_payload JSONB DEFAULT '{}',
  source_signal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_suggested_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ai actions" ON public.ai_suggested_actions FOR ALL TO authenticated USING (user_id = auth.uid());

-- Global Benchmark Engine
CREATE TABLE public.benchmark_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  business_value NUMERIC DEFAULT 0,
  industry_avg NUMERIC DEFAULT 0,
  top_performer NUMERIC DEFAULT 0,
  percentile_rank INT DEFAULT 50,
  score_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.benchmark_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own benchmarks" ON public.benchmark_scores FOR ALL TO authenticated USING (user_id = auth.uid());

-- Autonomous Growth Loop
CREATE TABLE public.growth_loop_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  referral_count INT DEFAULT 0,
  onboarding_completions INT DEFAULT 0,
  activations INT DEFAULT 0,
  upgrades INT DEFAULT 0,
  advocates INT DEFAULT 0,
  viral_coefficient NUMERIC DEFAULT 0,
  loop_velocity_days NUMERIC DEFAULT 0,
  optimization_suggestions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.growth_loop_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own growth loops" ON public.growth_loop_metrics FOR ALL TO authenticated USING (user_id = auth.uid());

-- Usage Credit Economy
CREATE TABLE public.credit_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  credits INT NOT NULL,
  price_cents INT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view credit packs" ON public.credit_packs FOR SELECT TO authenticated USING (true);

CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount INT NOT NULL,
  balance_after INT DEFAULT 0,
  transaction_type TEXT NOT NULL DEFAULT 'usage',
  description TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own credit transactions" ON public.credit_transactions FOR ALL TO authenticated USING (user_id = auth.uid());

-- Operational Stability
CREATE TABLE public.ops_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  check_type TEXT NOT NULL,
  component TEXT NOT NULL,
  status TEXT DEFAULT 'healthy',
  latency_ms INT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ops_health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own ops health" ON public.ops_health_checks FOR ALL TO authenticated USING (user_id = auth.uid());

-- Industry onboarding templates
CREATE TABLE public.industry_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  default_automations JSONB DEFAULT '[]',
  default_channels TEXT[] DEFAULT '{}',
  onboarding_steps JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.industry_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view industry templates" ON public.industry_templates FOR SELECT TO authenticated USING (true);
