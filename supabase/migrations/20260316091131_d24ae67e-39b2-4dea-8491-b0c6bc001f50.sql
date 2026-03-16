
-- Create scan_insights table for structured scan results
CREATE TABLE public.scan_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES public.scan_sources(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES public.source_scans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  insight_type TEXT NOT NULL DEFAULT 'business_info',
  title TEXT NOT NULL,
  description TEXT,
  raw_value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_score NUMERIC NOT NULL DEFAULT 0.5,
  is_important BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add scan progress fields to source_scans
ALTER TABLE public.source_scans
  ADD COLUMN IF NOT EXISTS pages_scanned INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insights_found INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scan_phase TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

-- Enable RLS
ALTER TABLE public.scan_insights ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can manage own scan_insights"
  ON public.scan_insights FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_scan_insights_source ON public.scan_insights(source_id);
CREATE INDEX idx_scan_insights_scan ON public.scan_insights(scan_id);
CREATE INDEX idx_scan_insights_workspace ON public.scan_insights(workspace_id);
CREATE INDEX idx_scan_insights_type ON public.scan_insights(insight_type);
