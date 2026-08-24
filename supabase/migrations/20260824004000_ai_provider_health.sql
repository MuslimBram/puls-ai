-- AI Provider Governance — durable provider health
-- Branch-only candidate. Do not apply to production without a separate rollout gate.

CREATE TABLE IF NOT EXISTS public.ai_provider_health (
  provider_key text PRIMARY KEY,
  status text NOT NULL DEFAULT 'healthy'
    CHECK (status IN ('healthy', 'degraded', 'cooldown', 'quota_exhausted', 'disabled')),
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
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_failure_at timestamptz,
  last_success_at timestamptz,
  cooldown_until timestamptz,
  quota_exhausted_until timestamptz,
  last_error_code text,
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_provider_health ENABLE ROW LEVEL SECURITY;

-- Provider health is server-observability state. Browser roles get no direct access.
REVOKE ALL ON TABLE public.ai_provider_health FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_provider_health TO service_role;

CREATE OR REPLACE FUNCTION public.record_ai_provider_failure(
  p_provider_key text,
  p_failure_category text,
  p_error_code text,
  p_latency_ms integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text := 'degraded';
  v_cooldown_until timestamptz := NULL;
  v_quota_until timestamptz := NULL;
BEGIN
  IF p_provider_key IS NULL OR btrim(p_provider_key) = '' THEN
    RAISE EXCEPTION 'provider_key is required' USING ERRCODE = '22023';
  END IF;

  IF p_failure_category NOT IN (
    'RATE_LIMITED',
    'PROVIDER_QUOTA_EXHAUSTED',
    'AUTH_OR_CONFIG_FAILURE',
    'TIMEOUT',
    'TRANSIENT_PROVIDER_FAILURE',
    'UNSUPPORTED_REQUEST',
    'PERMANENT_PROVIDER_FAILURE'
  ) THEN
    RAISE EXCEPTION 'unsupported provider failure category' USING ERRCODE = '22023';
  END IF;

  IF p_latency_ms IS NOT NULL AND p_latency_ms < 0 THEN
    RAISE EXCEPTION 'latency_ms must be non-negative' USING ERRCODE = '22023';
  END IF;

  CASE p_failure_category
    WHEN 'RATE_LIMITED' THEN
      v_status := 'cooldown';
      v_cooldown_until := now() + interval '60 seconds';
    WHEN 'PROVIDER_QUOTA_EXHAUSTED' THEN
      v_status := 'quota_exhausted';
      v_quota_until := now() + interval '5 minutes';
    WHEN 'AUTH_OR_CONFIG_FAILURE' THEN
      v_status := 'cooldown';
      v_cooldown_until := now() + interval '2 minutes';
    WHEN 'TIMEOUT' THEN
      v_status := 'cooldown';
      v_cooldown_until := now() + interval '10 seconds';
    WHEN 'TRANSIENT_PROVIDER_FAILURE' THEN
      v_status := 'cooldown';
      v_cooldown_until := now() + interval '15 seconds';
    ELSE
      v_status := 'degraded';
  END CASE;

  INSERT INTO public.ai_provider_health (
    provider_key,
    status,
    failure_category,
    consecutive_failures,
    last_failure_at,
    cooldown_until,
    quota_exhausted_until,
    last_error_code,
    latency_ms,
    updated_at
  ) VALUES (
    p_provider_key,
    v_status,
    p_failure_category,
    1,
    now(),
    v_cooldown_until,
    v_quota_until,
    p_error_code,
    p_latency_ms,
    now()
  )
  ON CONFLICT (provider_key) DO UPDATE SET
    status = EXCLUDED.status,
    failure_category = EXCLUDED.failure_category,
    consecutive_failures = public.ai_provider_health.consecutive_failures + 1,
    last_failure_at = EXCLUDED.last_failure_at,
    cooldown_until = CASE
      WHEN EXCLUDED.cooldown_until IS NULL THEN public.ai_provider_health.cooldown_until
      WHEN public.ai_provider_health.cooldown_until IS NULL THEN EXCLUDED.cooldown_until
      ELSE GREATEST(public.ai_provider_health.cooldown_until, EXCLUDED.cooldown_until)
    END,
    quota_exhausted_until = CASE
      WHEN EXCLUDED.quota_exhausted_until IS NULL THEN public.ai_provider_health.quota_exhausted_until
      WHEN public.ai_provider_health.quota_exhausted_until IS NULL THEN EXCLUDED.quota_exhausted_until
      ELSE GREATEST(public.ai_provider_health.quota_exhausted_until, EXCLUDED.quota_exhausted_until)
    END,
    last_error_code = EXCLUDED.last_error_code,
    latency_ms = EXCLUDED.latency_ms,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ai_provider_success(
  p_provider_key text,
  p_latency_ms integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_provider_key IS NULL OR btrim(p_provider_key) = '' THEN
    RAISE EXCEPTION 'provider_key is required' USING ERRCODE = '22023';
  END IF;

  IF p_latency_ms IS NOT NULL AND p_latency_ms < 0 THEN
    RAISE EXCEPTION 'latency_ms must be non-negative' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ai_provider_health (
    provider_key,
    status,
    failure_category,
    consecutive_failures,
    last_success_at,
    cooldown_until,
    quota_exhausted_until,
    last_error_code,
    latency_ms,
    updated_at
  ) VALUES (
    p_provider_key,
    'healthy',
    NULL,
    0,
    now(),
    NULL,
    NULL,
    NULL,
    p_latency_ms,
    now()
  )
  ON CONFLICT (provider_key) DO UPDATE SET
    status = 'healthy',
    failure_category = NULL,
    consecutive_failures = 0,
    last_success_at = now(),
    cooldown_until = NULL,
    quota_exhausted_until = NULL,
    last_error_code = NULL,
    latency_ms = EXCLUDED.latency_ms,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_provider_failure(text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_ai_provider_success(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_provider_failure(text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_ai_provider_success(text, integer) TO service_role;

CREATE INDEX IF NOT EXISTS idx_ai_provider_health_availability
  ON public.ai_provider_health (status, cooldown_until, quota_exhausted_until);
