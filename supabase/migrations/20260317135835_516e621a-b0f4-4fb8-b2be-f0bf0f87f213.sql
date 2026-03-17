
-- Add business_id to scan_insights for direct business linkage
ALTER TABLE public.scan_insights ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.business_profiles(id) ON DELETE SET NULL;

-- Create index for business lookups
CREATE INDEX IF NOT EXISTS idx_scan_insights_business_id ON public.scan_insights(business_id);

-- Create business_scan_history table
CREATE TABLE IF NOT EXISTS public.business_scan_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  triggered_by UUID NOT NULL,
  scanned_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  scan_phase TEXT DEFAULT 'queued',
  pages_scanned INTEGER DEFAULT 0,
  insights_count INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  summary_json JSONB DEFAULT '{}'::jsonb,
  products_found JSONB DEFAULT '[]'::jsonb,
  services_found JSONB DEFAULT '[]'::jsonb,
  contact_methods JSONB DEFAULT '[]'::jsonb,
  social_links JSONB DEFAULT '{}'::jsonb,
  pricing_signals JSONB DEFAULT '[]'::jsonb,
  tone_of_voice TEXT,
  suggested_keywords JSONB DEFAULT '[]'::jsonb,
  cta_signals JSONB DEFAULT '[]'::jsonb,
  competitor_hints JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.business_scan_history ENABLE ROW LEVEL SECURITY;

-- Admin can see all scans
CREATE POLICY "Admins can manage all business scans"
ON public.business_scan_history
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Business owners can view their own workspace scans
CREATE POLICY "Workspace members can view their business scans"
ON public.business_scan_history
FOR SELECT
TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_business_scan_history_business ON public.business_scan_history(business_id);
CREATE INDEX IF NOT EXISTS idx_business_scan_history_workspace ON public.business_scan_history(workspace_id);

-- Create AI content generation results table
CREATE TABLE IF NOT EXISTS public.business_ai_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  scan_history_id UUID REFERENCES public.business_scan_history(id) ON DELETE SET NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  generated_by UUID NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'campaign_ideas',
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'generating',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_ai_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all AI content"
ON public.business_ai_content
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Workspace members can view AI content"
ON public.business_ai_content
FOR SELECT
TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));
