
-- Competitor alerts table
CREATE TABLE public.competitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  competitor_id UUID REFERENCES public.competitors(id) ON DELETE CASCADE NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.competitor_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own competitor_alerts"
  ON public.competitor_alerts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own competitor_alerts"
  ON public.competitor_alerts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own competitor_alerts"
  ON public.competitor_alerts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own competitor_alerts"
  ON public.competitor_alerts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Add previous_scan_data column to competitors for change detection
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS previous_scan_data JSONB DEFAULT '{}'::jsonb;

-- Add posting_frequency and pricing_snapshot columns
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS posting_frequency JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB DEFAULT '{}'::jsonb;
