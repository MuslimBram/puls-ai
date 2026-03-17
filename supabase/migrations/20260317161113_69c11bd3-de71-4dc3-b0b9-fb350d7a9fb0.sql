
-- API keys table for public API authentication
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Default',
  permissions TEXT[] NOT NULL DEFAULT ARRAY['read'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  usage_count BIGINT DEFAULT 0,
  rate_limit_per_minute INT DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own API keys"
  ON public.api_keys FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_api_keys_hash ON public.api_keys (key_hash) WHERE is_active = true;
CREATE INDEX idx_api_keys_user ON public.api_keys (user_id);

-- Zapier webhook configs
CREATE TABLE public.zapier_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  webhook_url TEXT NOT NULL,
  event_type TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.zapier_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own webhooks"
  ON public.zapier_webhooks FOR ALL
  USING (auth.uid() = user_id);

-- API request logs
CREATE TABLE public.api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public.api_keys(id),
  workspace_id UUID,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INT,
  response_time_ms INT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own API logs"
  ON public.api_request_logs FOR SELECT
  USING (api_key_id IN (SELECT id FROM public.api_keys WHERE user_id = auth.uid()));

CREATE INDEX idx_api_logs_key ON public.api_request_logs (api_key_id);
CREATE INDEX idx_api_logs_created ON public.api_request_logs (created_at DESC);
