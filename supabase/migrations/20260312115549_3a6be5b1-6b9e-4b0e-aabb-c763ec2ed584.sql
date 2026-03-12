
-- Campaigns table
CREATE TABLE public.campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT 'lead_generation',
  target_audience TEXT,
  budget_min NUMERIC DEFAULT 0,
  budget_max NUMERIC DEFAULT 0,
  duration_start TIMESTAMP WITH TIME ZONE,
  duration_end TIMESTAMP WITH TIME ZONE,
  preferred_channels TEXT[] DEFAULT '{}'::TEXT[],
  status TEXT NOT NULL DEFAULT 'draft',
  positioning_statement TEXT,
  value_proposition TEXT,
  messaging_pillars JSONB DEFAULT '[]'::JSONB,
  cta_strategy TEXT,
  funnel_stages JSONB DEFAULT '[]'::JSONB,
  audience_personas JSONB DEFAULT '[]'::JSONB,
  expected_kpis JSONB DEFAULT '{}'::JSONB,
  ai_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Campaign content items
CREATE TABLE public.campaign_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  funnel_stage TEXT NOT NULL DEFAULT 'awareness',
  content_type TEXT NOT NULL DEFAULT 'ad_headline',
  title TEXT,
  body TEXT NOT NULL,
  hashtags TEXT[] DEFAULT '{}'::TEXT[],
  media_suggestion TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  content_post_id UUID REFERENCES public.content_posts(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_content ENABLE ROW LEVEL SECURITY;

-- RLS for campaigns
CREATE POLICY "Users can view own campaigns" ON public.campaigns FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own campaigns" ON public.campaigns FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS for campaign_content
CREATE POLICY "Users can view own campaign_content" ON public.campaign_content FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own campaign_content" ON public.campaign_content FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own campaign_content" ON public.campaign_content FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own campaign_content" ON public.campaign_content FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Updated_at triggers
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaign_content_updated_at BEFORE UPDATE ON public.campaign_content FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
