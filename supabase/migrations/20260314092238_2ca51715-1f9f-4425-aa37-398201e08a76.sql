
-- External integrations registry
CREATE TABLE public.external_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id),
  integration_key text NOT NULL,
  integration_name text NOT NULL,
  category text NOT NULL DEFAULT 'analytics',
  description text,
  status text NOT NULL DEFAULT 'planned',
  is_enabled boolean NOT NULL DEFAULT false,
  credentials jsonb DEFAULT '{}'::jsonb,
  config jsonb DEFAULT '{}'::jsonb,
  usage_count integer NOT NULL DEFAULT 0,
  last_used_at timestamp with time zone,
  rate_limit_per_hour integer NOT NULL DEFAULT 2,
  min_scan_interval_minutes integer NOT NULL DEFAULT 30,
  last_scan_at timestamp with time zone,
  keyword_match_threshold numeric NOT NULL DEFAULT 0.6,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, integration_key)
);

ALTER TABLE public.external_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own external_integrations" ON public.external_integrations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own external_integrations" ON public.external_integrations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own external_integrations" ON public.external_integrations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own external_integrations" ON public.external_integrations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all external_integrations" ON public.external_integrations
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Integration event logs
CREATE TABLE public.integration_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.external_integrations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_type text NOT NULL DEFAULT 'info',
  event_message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integration_event_logs" ON public.integration_event_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own integration_event_logs" ON public.integration_event_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all integration_event_logs" ON public.integration_event_logs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
