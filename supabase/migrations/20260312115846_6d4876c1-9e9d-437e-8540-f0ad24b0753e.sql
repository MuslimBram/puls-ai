
-- Competitors table
CREATE TABLE public.competitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'direct',
  website_url TEXT,
  social_urls JSONB DEFAULT '{}'::JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  last_scanned_at TIMESTAMP WITH TIME ZONE,
  scan_frequency TEXT DEFAULT 'weekly',
  ai_summary TEXT,
  ai_positioning TEXT,
  ai_content_themes JSONB DEFAULT '[]'::JSONB,
  ai_engagement_style TEXT,
  ai_opportunities JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Competitor scans / activity timeline
CREATE TABLE public.competitor_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_id UUID NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  scan_type TEXT NOT NULL DEFAULT 'website',
  source_url TEXT,
  content_summary TEXT,
  detected_topics TEXT[] DEFAULT '{}'::TEXT[],
  promotion_signals TEXT[] DEFAULT '{}'::TEXT[],
  raw_data JSONB DEFAULT '{}'::JSONB,
  scanned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Market trends aggregation
CREATE TABLE public.market_trends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  trend_type TEXT NOT NULL DEFAULT 'keyword',
  trend_value TEXT NOT NULL,
  frequency INTEGER DEFAULT 1,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  source_competitor_ids UUID[] DEFAULT '{}'::UUID[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_trends ENABLE ROW LEVEL SECURITY;

-- RLS for competitors
CREATE POLICY "Users can view own competitors" ON public.competitors FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own competitors" ON public.competitors FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own competitors" ON public.competitors FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own competitors" ON public.competitors FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS for competitor_scans
CREATE POLICY "Users can view own competitor_scans" ON public.competitor_scans FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own competitor_scans" ON public.competitor_scans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own competitor_scans" ON public.competitor_scans FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS for market_trends
CREATE POLICY "Users can view own market_trends" ON public.market_trends FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own market_trends" ON public.market_trends FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own market_trends" ON public.market_trends FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own market_trends" ON public.market_trends FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Triggers
CREATE TRIGGER update_competitors_updated_at BEFORE UPDATE ON public.competitors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
