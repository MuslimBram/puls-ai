
-- Competitive Intelligence Engine
CREATE TABLE public.competitive_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  signal_type TEXT NOT NULL DEFAULT 'positioning_shift',
  title TEXT NOT NULL,
  description TEXT,
  competitor_id UUID REFERENCES public.competitors(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  is_read BOOLEAN DEFAULT false,
  is_actioned BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  detected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.competitive_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own competitive signals" ON public.competitive_signals FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.competitive_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  signal_id UUID REFERENCES public.competitive_signals(id) ON DELETE CASCADE,
  action_text TEXT NOT NULL,
  action_type TEXT DEFAULT 'messaging_adjustment',
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.competitive_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own competitive actions" ON public.competitive_actions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Brand & Reputation Engine
CREATE TABLE public.brand_sentiment_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  score_date DATE NOT NULL DEFAULT CURRENT_DATE,
  positive_pct NUMERIC DEFAULT 0,
  neutral_pct NUMERIC DEFAULT 0,
  negative_pct NUMERIC DEFAULT 0,
  overall_score NUMERIC DEFAULT 50,
  data_points INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.brand_sentiment_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own brand sentiment" ON public.brand_sentiment_scores FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.brand_risk_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  alert_type TEXT NOT NULL DEFAULT 'complaint_spike',
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.brand_risk_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own brand risk alerts" ON public.brand_risk_alerts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.brand_improvement_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  alert_id UUID REFERENCES public.brand_risk_alerts(id) ON DELETE CASCADE,
  action_text TEXT NOT NULL,
  action_type TEXT DEFAULT 'tone_adjustment',
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.brand_improvement_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own brand improvement actions" ON public.brand_improvement_actions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Customer Experience Engine
CREATE TABLE public.cx_journey_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  contact_identifier TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'first_contact',
  event_type TEXT NOT NULL,
  sentiment TEXT DEFAULT 'neutral',
  friction_score NUMERIC DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.cx_journey_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cx journey events" ON public.cx_journey_events FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.cx_risk_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  alert_type TEXT NOT NULL DEFAULT 'slow_response',
  title TEXT NOT NULL,
  description TEXT,
  contact_identifier TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.cx_risk_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cx risk alerts" ON public.cx_risk_alerts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.cx_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  score_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cx_score NUMERIC DEFAULT 50,
  response_speed_score NUMERIC DEFAULT 50,
  resolution_score NUMERIC DEFAULT 50,
  engagement_score NUMERIC DEFAULT 50,
  data_points INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.cx_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cx scores" ON public.cx_scores FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
