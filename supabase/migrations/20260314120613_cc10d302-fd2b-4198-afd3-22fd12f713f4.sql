
-- scan_sources: the main source registry
CREATE TABLE public.scan_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  source_type TEXT NOT NULL DEFAULT 'website',
  url_or_identifier TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  scan_status TEXT NOT NULL DEFAULT 'pending',
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scan_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own scan_sources" ON public.scan_sources
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all scan_sources" ON public.scan_sources
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- source_scans: individual scan runs
CREATE TABLE public.source_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID REFERENCES public.scan_sources(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  items_found INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.source_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own source_scans" ON public.source_scans
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- discovered_items: content found during scans
CREATE TABLE public.discovered_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID REFERENCES public.scan_sources(id) ON DELETE CASCADE NOT NULL,
  scan_id UUID REFERENCES public.source_scans(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  external_id TEXT,
  author_name TEXT,
  content_text TEXT,
  content_url TEXT,
  engagement JSONB DEFAULT '{}'::jsonb,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.discovered_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own discovered_items" ON public.discovered_items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- lead_matches: keyword matches on discovered items
CREATE TABLE public.lead_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  discovered_item_id UUID REFERENCES public.discovered_items(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  matched_keyword TEXT NOT NULL,
  intent_score NUMERIC DEFAULT 0,
  ai_summary TEXT,
  suggested_reply TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own lead_matches" ON public.lead_matches
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
