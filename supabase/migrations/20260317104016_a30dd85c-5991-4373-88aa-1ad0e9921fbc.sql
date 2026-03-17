
-- Global suppression list: bounces, complaints, unsubscribes consolidated
CREATE TABLE public.global_suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  contact_identifier TEXT NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'all',
  suppression_type TEXT NOT NULL DEFAULT 'unsubscribe', -- unsubscribe, bounce, complaint, manual
  reason TEXT,
  source TEXT, -- broadcast_id, webhook, manual, system
  source_id TEXT,
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_identifier, channel_type, suppression_type)
);

ALTER TABLE public.global_suppression_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own suppressions"
  ON public.global_suppression_list FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own suppressions"
  ON public.global_suppression_list FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own suppressions"
  ON public.global_suppression_list FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_suppression_lookup
  ON public.global_suppression_list (user_id, contact_identifier, channel_type);

-- Sending reputation per workspace
CREATE TABLE public.sending_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,
  total_sent BIGINT NOT NULL DEFAULT 0,
  total_delivered BIGINT NOT NULL DEFAULT 0,
  total_bounced BIGINT NOT NULL DEFAULT 0,
  total_complained BIGINT NOT NULL DEFAULT 0,
  total_unsubscribed BIGINT NOT NULL DEFAULT 0,
  reputation_score NUMERIC NOT NULL DEFAULT 100, -- 0-100
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, channel_type)
);

ALTER TABLE public.sending_reputation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own reputation"
  ON public.sending_reputation FOR SELECT
  USING (auth.uid() = user_id);

-- Broadcast send queue for retry scheduling
CREATE TABLE public.broadcast_send_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.broadcast_recipients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  contact_identifier TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, sent, failed, bounced, suppressed
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.broadcast_send_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own send queue"
  ON public.broadcast_send_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX idx_send_queue_pending
  ON public.broadcast_send_queue (status, next_retry_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX idx_send_queue_broadcast
  ON public.broadcast_send_queue (broadcast_id, status);

-- Add reputation_score column to broadcasts for per-broadcast scoring
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS sender_reputation NUMERIC DEFAULT 100;

-- Security definer function to check suppression (avoids RLS recursion in edge functions)
CREATE OR REPLACE FUNCTION public.is_contact_suppressed(
  _user_id UUID,
  _contact_identifier TEXT,
  _channel_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.global_suppression_list
    WHERE user_id = _user_id
      AND contact_identifier = _contact_identifier
      AND (channel_type = _channel_type OR channel_type = 'all')
  ) OR EXISTS (
    SELECT 1 FROM public.broadcast_optouts
    WHERE user_id = _user_id
      AND contact_identifier = _contact_identifier
      AND (channel_type = _channel_type OR channel_type = 'all')
  )
$$;

-- Function to compute reputation score
CREATE OR REPLACE FUNCTION public.compute_reputation_score(
  _total_sent BIGINT,
  _total_bounced BIGINT,
  _total_complained BIGINT,
  _total_unsubscribed BIGINT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  score NUMERIC := 100;
  bounce_rate NUMERIC;
  complaint_rate NUMERIC;
  unsub_rate NUMERIC;
BEGIN
  IF _total_sent = 0 THEN RETURN 100; END IF;
  
  bounce_rate := (_total_bounced::NUMERIC / _total_sent) * 100;
  complaint_rate := (_total_complained::NUMERIC / _total_sent) * 100;
  unsub_rate := (_total_unsubscribed::NUMERIC / _total_sent) * 100;
  
  -- Bounce penalty: -2 per percent
  score := score - (bounce_rate * 2);
  -- Complaint penalty: -5 per percent (heavier)
  score := score - (complaint_rate * 5);
  -- Unsubscribe penalty: -1 per percent
  score := score - (unsub_rate * 1);
  
  RETURN GREATEST(0, LEAST(100, score));
END;
$$;
