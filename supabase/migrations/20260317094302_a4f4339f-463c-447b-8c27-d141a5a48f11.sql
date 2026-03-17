
-- =============================================
-- PERFORMANCE INDEXES for high-frequency queries
-- =============================================

-- Inbox messages: user_id + timestamp (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_inbox_messages_user_timestamp 
ON public.inbox_messages (user_id, message_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_user_status 
ON public.inbox_messages (user_id, status);

-- Leads: user_id + date (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_leads_user_date 
ON public.leads (user_id, message_date DESC);

CREATE INDEX IF NOT EXISTS idx_leads_user_status 
ON public.leads (user_id, status);

CREATE INDEX IF NOT EXISTS idx_leads_user_keyword 
ON public.leads (user_id, detected_keyword);

-- Keywords: user_id + active status
CREATE INDEX IF NOT EXISTS idx_keywords_user_active 
ON public.keywords (user_id, is_active);

-- Conversation threads: user_id + last_message
CREATE INDEX IF NOT EXISTS idx_threads_user_last_msg 
ON public.conversation_threads (user_id, last_message_at DESC);

-- AI conversations: user_id + created_at
CREATE INDEX IF NOT EXISTS idx_ai_convos_user_created 
ON public.ai_conversations (user_id, created_at DESC);

-- Subscriptions: workspace lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace 
ON public.subscriptions (workspace_id);

-- Audit logs: actor + timestamp
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time 
ON public.audit_logs (actor_id, created_at DESC);

-- Partner clients: partner_id lookup
CREATE INDEX IF NOT EXISTS idx_partner_clients_partner 
ON public.partner_clients (partner_id);

-- Broadcasts: user_id + status
CREATE INDEX IF NOT EXISTS idx_broadcasts_user_status 
ON public.broadcasts (user_id, status);

-- =============================================
-- DEAD LETTER QUEUE for failed background jobs
-- =============================================

CREATE TABLE IF NOT EXISTS public.dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  error_stack TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  original_queue TEXT,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  status TEXT NOT NULL DEFAULT 'failed' CHECK (status IN ('failed', 'retrying', 'resolved', 'discarded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dead_letter_queue ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage dead letter queue
CREATE POLICY "Admins can manage dead letter queue"
ON public.dead_letter_queue FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_dlq_status ON public.dead_letter_queue (status, failed_at DESC);

-- =============================================
-- AI CONVERSATION MEMORY
-- =============================================

CREATE TABLE IF NOT EXISTS public.ai_conversation_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_identifier TEXT NOT NULL,
  contact_name TEXT,
  memory_type TEXT NOT NULL DEFAULT 'conversation' CHECK (memory_type IN ('conversation', 'profile', 'preference', 'deal_context')),
  summary TEXT,
  key_facts JSONB DEFAULT '[]',
  sentiment_trend TEXT,
  last_interaction_at TIMESTAMPTZ,
  interaction_count INTEGER DEFAULT 0,
  embedding_vector TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_conversation_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their workspace memory"
ON public.ai_conversation_memory FOR ALL
TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_ai_memory_workspace_contact 
ON public.ai_conversation_memory (workspace_id, contact_identifier);

CREATE INDEX idx_ai_memory_type 
ON public.ai_conversation_memory (memory_type, last_interaction_at DESC);

-- =============================================
-- LEAD SCORING & CHURN PREDICTION
-- =============================================

CREATE TABLE IF NOT EXISTS public.lead_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_factors JSONB DEFAULT '{}',
  predicted_value NUMERIC(12,2),
  churn_risk NUMERIC(5,2) DEFAULT 0,
  churn_factors JSONB DEFAULT '{}',
  last_scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their workspace lead scores"
ON public.lead_scores FOR ALL
TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_lead_scores_workspace ON public.lead_scores (workspace_id, score DESC);
CREATE INDEX idx_lead_scores_churn ON public.lead_scores (workspace_id, churn_risk DESC);

-- Trigger for updated_at
CREATE TRIGGER update_ai_memory_updated_at
BEFORE UPDATE ON public.ai_conversation_memory
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lead_scores_updated_at
BEFORE UPDATE ON public.lead_scores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
