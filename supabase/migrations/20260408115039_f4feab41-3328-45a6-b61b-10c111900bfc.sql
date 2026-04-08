
CREATE TABLE public.webhook_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  channel_id UUID,
  event_type TEXT NOT NULL DEFAULT 'incoming_message',
  source TEXT NOT NULL DEFAULT 'unknown',
  method TEXT NOT NULL DEFAULT 'POST',
  endpoint TEXT,
  payload_preview TEXT,
  sender_id TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  ip_address TEXT,
  processing_time_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_activity_logs_user ON public.webhook_activity_logs(user_id, created_at DESC);
CREATE INDEX idx_webhook_activity_logs_source ON public.webhook_activity_logs(source, created_at DESC);
CREATE INDEX idx_webhook_activity_logs_status ON public.webhook_activity_logs(status);

ALTER TABLE public.webhook_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own webhook logs"
  ON public.webhook_activity_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all webhook logs"
  ON public.webhook_activity_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Service role can insert webhook logs"
  ON public.webhook_activity_logs FOR INSERT
  WITH CHECK (true);
