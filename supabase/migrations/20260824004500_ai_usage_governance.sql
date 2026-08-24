-- AI Provider Governance — logical request and provider-attempt ledger
-- Separates customer-visible request usage from internal provider attempts/cost.
-- Branch-only candidate. Do not apply to production without a separate rollout gate.

CREATE TABLE IF NOT EXISTS public.ai_usage_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id uuid,
  auth_context text NOT NULL
    CHECK (auth_context IN ('user', 'internal', 'public')),
  task_type text NOT NULL,
  explicit_provider_key text,
  request_status text NOT NULL DEFAULT 'pending'
    CHECK (request_status IN ('pending', 'succeeded', 'failed', 'blocked')),
  successful_provider_key text,
  tokens_in integer NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out integer NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  cost_usd numeric(14,8) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  credits_used integer NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  fallback_used boolean NOT NULL DEFAULT false,
  total_provider_attempts integer NOT NULL DEFAULT 0 CHECK (total_provider_attempts >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_requests_workspace_created
  ON public.ai_usage_requests (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_requests_user_created
  ON public.ai_usage_requests (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_requests_status_created
  ON public.ai_usage_requests (request_status, created_at DESC);

ALTER TABLE public.ai_usage_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_usage_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_usage_requests TO service_role;

CREATE TABLE IF NOT EXISTS public.ai_provider_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.ai_usage_requests(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  provider_name text NOT NULL,
  attempt_index integer NOT NULL CHECK (attempt_index >= 1),
  success boolean NOT NULL DEFAULT false,
  failure_category text
    CHECK (
      failure_category IS NULL OR failure_category IN (
        'RATE_LIMITED',
        'PROVIDER_QUOTA_EXHAUSTED',
        'AUTH_OR_CONFIG_FAILURE',
        'TIMEOUT',
        'TRANSIENT_PROVIDER_FAILURE',
        'UNSUPPORTED_REQUEST',
        'PERMANENT_PROVIDER_FAILURE'
      )
    ),
  error_code text,
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  tokens_in integer NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out integer NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  cost_usd numeric(14,8) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, attempt_index)
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_attempts_request
  ON public.ai_provider_attempts (request_id, attempt_index);
CREATE INDEX IF NOT EXISTS idx_ai_provider_attempts_provider_created
  ON public.ai_provider_attempts (provider_key, created_at DESC);

ALTER TABLE public.ai_provider_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_provider_attempts FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.ai_provider_attempts TO service_role;

COMMENT ON TABLE public.ai_usage_requests IS
  'One row per logical Pulse AI request. Customer-visible quota increments remain one-per-logical-request.';
COMMENT ON TABLE public.ai_provider_attempts IS
  'Internal provider candidate attempts for observability and provider cost. Retries/failover do not multiply customer-visible usage.';
