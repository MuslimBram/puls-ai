
-- Call recordings table
CREATE TABLE public.call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  call_record_id UUID REFERENCES public.call_records(id) ON DELETE SET NULL,
  active_call_id UUID REFERENCES public.active_calls(id) ON DELETE SET NULL,
  agent_user_id UUID,
  storage_path TEXT,
  storage_url TEXT,
  duration_seconds INTEGER DEFAULT 0,
  file_size_bytes BIGINT DEFAULT 0,
  format TEXT DEFAULT 'webm',
  transcription TEXT,
  transcription_status TEXT DEFAULT 'pending',
  ai_summary TEXT,
  sentiment_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- IVR flows
CREATE TABLE public.ivr_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  is_default BOOLEAN DEFAULT false,
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  settings JSONB DEFAULT '{}',
  version INTEGER DEFAULT 1,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supervisor monitor sessions
CREATE TABLE public.supervisor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supervisor_user_id UUID NOT NULL,
  agent_user_id UUID NOT NULL,
  active_call_id UUID REFERENCES public.active_calls(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'listen',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dialer campaigns
CREATE TABLE public.dialer_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  dialer_mode TEXT NOT NULL DEFAULT 'preview',
  caller_id TEXT,
  queue_id UUID REFERENCES public.call_queues(id),
  contact_list JSONB NOT NULL DEFAULT '[]',
  total_contacts INTEGER DEFAULT 0,
  contacted INTEGER DEFAULT 0,
  answered INTEGER DEFAULT 0,
  no_answer INTEGER DEFAULT 0,
  busy INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  pacing_ratio NUMERIC DEFAULT 1.0,
  max_attempts INTEGER DEFAULT 3,
  retry_interval_minutes INTEGER DEFAULT 60,
  schedule_start TIME,
  schedule_end TIME,
  schedule_days TEXT[] DEFAULT '{mon,tue,wed,thu,fri}',
  script TEXT,
  disposition_codes JSONB DEFAULT '["interested","not_interested","callback","do_not_call","wrong_number","voicemail"]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dialer campaign contacts (individual call attempts)
CREATE TABLE public.dialer_campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.dialer_campaigns(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  contact_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  disposition TEXT,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  assigned_agent_id UUID,
  call_record_id UUID REFERENCES public.call_records(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ivr_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialer_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialer_campaign_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view recordings in workspace" ON public.call_recordings
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users can manage their own recordings" ON public.call_recordings
  FOR ALL TO authenticated
  USING (agent_user_id = auth.uid() OR public.is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Users can view IVR flows in workspace" ON public.ivr_flows
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Owners can manage IVR flows" ON public.ivr_flows
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Supervisors can view monitor sessions" ON public.supervisor_sessions
  FOR SELECT TO authenticated
  USING (supervisor_user_id = auth.uid() OR public.is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Supervisors can manage monitor sessions" ON public.supervisor_sessions
  FOR ALL TO authenticated
  USING (supervisor_user_id = auth.uid() OR public.is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Users can view dialer campaigns" ON public.dialer_campaigns
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Owners can manage dialer campaigns" ON public.dialer_campaigns
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Users can view campaign contacts" ON public.dialer_campaign_contacts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dialer_campaigns dc
    WHERE dc.id = campaign_id AND public.is_workspace_member(auth.uid(), dc.workspace_id)
  ));

CREATE POLICY "Owners can manage campaign contacts" ON public.dialer_campaign_contacts
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dialer_campaigns dc
    WHERE dc.id = campaign_id AND public.is_workspace_owner(auth.uid(), dc.workspace_id)
  ));

-- Realtime for live monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.supervisor_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dialer_campaign_contacts;
