
-- Part 5: Call Records
CREATE TABLE public.call_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id),
  user_id UUID NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  deal_id UUID REFERENCES public.deals(id),
  channel_provider TEXT NOT NULL DEFAULT 'manual',
  call_direction TEXT NOT NULL DEFAULT 'outbound',
  call_status TEXT NOT NULL DEFAULT 'completed',
  call_duration INTEGER DEFAULT 0,
  call_outcome TEXT DEFAULT 'no_answer',
  ai_transcription TEXT,
  ai_call_summary TEXT,
  follow_up_recommendation TEXT,
  recording_url TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own call_records" ON public.call_records
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_call_records_user_id ON public.call_records(user_id);
CREATE INDEX idx_call_records_workspace ON public.call_records(workspace_id);
CREATE INDEX idx_call_records_created ON public.call_records(created_at DESC);

-- Part 7: Contact timeline tags
CREATE TABLE public.contact_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  contact_identifier TEXT NOT NULL,
  contact_name TEXT,
  tag_type TEXT NOT NULL DEFAULT 'project',
  tag_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contact_tags" ON public.contact_tags
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_contact_tags_user ON public.contact_tags(user_id);
CREATE INDEX idx_contact_tags_contact ON public.contact_tags(contact_identifier);

-- Part 8: Analytics aggregation cache
CREATE TABLE public.analytics_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  cache_key TEXT NOT NULL,
  cache_data JSONB NOT NULL DEFAULT '{}',
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '1 hour')
);

ALTER TABLE public.analytics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own analytics_cache" ON public.analytics_cache
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_analytics_cache_key ON public.analytics_cache(user_id, cache_key);

-- Background job queue placeholder
CREATE TABLE public.job_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  job_type TEXT NOT NULL,
  job_payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own job_queue" ON public.job_queue
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_job_queue_status ON public.job_queue(status, scheduled_for);
