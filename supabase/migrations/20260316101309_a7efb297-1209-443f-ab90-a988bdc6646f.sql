
-- Config version tracking
CREATE TABLE public.config_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  change_type TEXT NOT NULL DEFAULT 'edit',
  previous_snapshot JSONB NOT NULL DEFAULT '{}',
  current_snapshot JSONB NOT NULL DEFAULT '{}',
  change_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.config_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own config_versions" ON public.config_versions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_config_versions_entity ON public.config_versions(entity_type, entity_id);
CREATE INDEX idx_config_versions_user ON public.config_versions(user_id, created_at DESC);

-- Business notifications
CREATE TABLE public.business_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  notification_type TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  action_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.business_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own business_notifications" ON public.business_notifications
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_biz_notif_user ON public.business_notifications(user_id, is_read, created_at DESC);

-- Health scores
CREATE TABLE public.health_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  overall_score INTEGER NOT NULL DEFAULT 50,
  lead_volume_score INTEGER DEFAULT 50,
  channel_activity_score INTEGER DEFAULT 50,
  response_speed_score INTEGER DEFAULT 50,
  campaign_engagement_score INTEGER DEFAULT 50,
  automation_usage_score INTEGER DEFAULT 50,
  breakdown JSONB DEFAULT '{}',
  suggestions JSONB DEFAULT '[]',
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own health_scores" ON public.health_scores
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_health_scores_user ON public.health_scores(user_id, computed_at DESC);
