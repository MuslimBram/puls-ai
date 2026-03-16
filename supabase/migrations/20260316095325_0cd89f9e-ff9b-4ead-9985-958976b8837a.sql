
-- ============================================
-- PART 1: Advanced Helpdesk Extensions
-- ============================================

-- Conversation threads for grouping messages
CREATE TABLE public.conversation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_to UUID,
  channel_type TEXT NOT NULL DEFAULT 'unknown',
  contact_name TEXT,
  contact_identifier TEXT,
  ai_summary TEXT,
  sla_response_due TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  message_count INTEGER DEFAULT 0,
  is_auto_reply_enabled BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own conversation_threads" ON public.conversation_threads
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_conv_threads_user_status ON public.conversation_threads(user_id, status);
CREATE INDEX idx_conv_threads_assigned ON public.conversation_threads(assigned_to);

-- Internal notes on conversations
CREATE TABLE public.conversation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  is_ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own conversation_notes" ON public.conversation_notes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- PART 2: Lead Qualification Chatbot
-- ============================================

CREATE TABLE public.chatbot_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  target_pipeline_stage_id UUID REFERENCES public.pipeline_stages(id),
  welcome_message TEXT DEFAULT 'Hi! I have a few questions to help us serve you better.',
  completion_message TEXT DEFAULT 'Thank you! Our team will be in touch shortly.',
  questions JSONB NOT NULL DEFAULT '[]',
  scoring_rules JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own chatbot_flows" ON public.chatbot_flows
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  visitor_name TEXT,
  visitor_email TEXT,
  visitor_phone TEXT,
  responses JSONB NOT NULL DEFAULT '[]',
  quality_score NUMERIC DEFAULT 0,
  ai_summary TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  deal_id UUID REFERENCES public.deals(id),
  lead_id UUID REFERENCES public.leads(id),
  channel_type TEXT DEFAULT 'website_chat',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chatbot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own chatbot_sessions" ON public.chatbot_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_chatbot_sessions_flow ON public.chatbot_sessions(flow_id, status);

-- ============================================
-- PART 3: Broadcast Messaging Engine
-- ============================================

CREATE TABLE public.contact_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  filter_criteria JSONB NOT NULL DEFAULT '{}',
  contact_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contact_segments" ON public.contact_segments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  campaign_id UUID REFERENCES public.campaigns(id),
  segment_id UUID REFERENCES public.contact_segments(id),
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  message_content TEXT NOT NULL,
  template_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  throttle_per_minute INTEGER DEFAULT 60,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  response_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own broadcasts" ON public.broadcasts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  contact_name TEXT,
  contact_identifier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own broadcast_recipients" ON public.broadcast_recipients
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_broadcast_recipients_broadcast ON public.broadcast_recipients(broadcast_id, status);

-- ============================================
-- PART 4: Automation Engine
-- ============================================

CREATE TABLE public.automation_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  conditions JSONB DEFAULT '{}',
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own automation_workflows" ON public.automation_workflows
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  trigger_event TEXT,
  actions_executed JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own automation_logs" ON public.automation_logs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_automation_logs_workflow ON public.automation_logs(workflow_id, created_at DESC);

-- Add thread_id to inbox_messages for linking
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.conversation_threads(id);
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS sla_response_due TIMESTAMPTZ;
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS internal_notes_count INTEGER DEFAULT 0;
