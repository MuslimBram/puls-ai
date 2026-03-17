
-- ============================================================
-- SCALABILITY & RELIABILITY HARDENING (skip existing job_queue)
-- ============================================================

-- Add missing columns to existing job_queue
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_job_queue_pending ON public.job_queue(status, priority DESC, next_retry_at)
  WHERE status IN ('pending', 'retry');

-- ═══════════════════════════════════════════════════════════
-- 2. RATE LIMITING
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key TEXT NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  endpoint TEXT,
  tokens_remaining INT NOT NULL DEFAULT 100,
  max_tokens INT NOT NULL DEFAULT 100,
  refill_rate INT NOT NULL DEFAULT 10,
  refill_interval_sec INT NOT NULL DEFAULT 60,
  last_refill_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  abuse_flag BOOLEAN NOT NULL DEFAULT false,
  abuse_reason TEXT,
  suspended_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(bucket_key)
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rate_limit_buckets' AND policyname = 'Service role manages rate limits') THEN
    CREATE POLICY "Service role manages rate limits"
      ON public.rate_limit_buckets FOR SELECT TO authenticated
      USING (public.is_workspace_member(auth.uid(), workspace_id));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket_key TEXT,
  _workspace_id UUID,
  _endpoint TEXT DEFAULT NULL,
  _max_tokens INT DEFAULT 100,
  _refill_rate INT DEFAULT 10,
  _refill_sec INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _bucket RECORD;
  _elapsed INT;
  _refilled INT;
  _new_tokens INT;
BEGIN
  INSERT INTO public.rate_limit_buckets (bucket_key, workspace_id, endpoint, max_tokens, refill_rate, refill_interval_sec)
  VALUES (_bucket_key, _workspace_id, _endpoint, _max_tokens, _refill_rate, _refill_sec)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT * INTO _bucket FROM public.rate_limit_buckets WHERE bucket_key = _bucket_key FOR UPDATE;

  IF _bucket.suspended_until IS NOT NULL AND _bucket.suspended_until > now() THEN
    RETURN false;
  END IF;

  _elapsed := EXTRACT(EPOCH FROM (now() - _bucket.last_refill_at))::INT;
  _refilled := (_elapsed / GREATEST(_bucket.refill_interval_sec, 1)) * _bucket.refill_rate;
  _new_tokens := LEAST(_bucket.max_tokens, _bucket.tokens_remaining + _refilled);

  IF _new_tokens <= 0 THEN
    UPDATE public.rate_limit_buckets SET abuse_flag = true, abuse_reason = 'Sustained rate limit hits', updated_at = now()
    WHERE id = _bucket.id AND NOT abuse_flag;
    RETURN false;
  END IF;

  UPDATE public.rate_limit_buckets
  SET tokens_remaining = _new_tokens - 1,
      last_refill_at = CASE WHEN _refilled > 0 THEN now() ELSE last_refill_at END,
      updated_at = now()
  WHERE id = _bucket.id;

  RETURN true;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. HEALTH MONITORING
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.system_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type TEXT NOT NULL,
  target_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy','degraded','down','unknown')),
  response_time_ms INT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_health_checks' AND policyname = 'Members can view health checks') THEN
    CREATE POLICY "Members can view health checks"
      ON public.system_health_checks FOR SELECT TO authenticated
      USING (public.is_workspace_member(auth.uid(), workspace_id));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_health_checks_recent ON public.system_health_checks(workspace_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS public.api_error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  method TEXT,
  status_code INT,
  error_message TEXT,
  request_metadata JSONB DEFAULT '{}',
  user_id UUID,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.api_error_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_error_log' AND policyname = 'Admins can view error logs') THEN
    CREATE POLICY "Admins can view error logs"
      ON public.api_error_log FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_error_log' AND policyname = 'Service can insert error logs') THEN
    CREATE POLICY "Service can insert error logs"
      ON public.api_error_log FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_api_errors_recent ON public.api_error_log(created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 4. SUBSCRIPTION RELIABILITY
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscription_state_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  stripe_subscription_id TEXT,
  plan_name TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  grace_period_end TIMESTAMPTZ,
  failed_payment_count INT NOT NULL DEFAULT 0,
  last_webhook_at TIMESTAMPTZ,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_state_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscription_state_cache' AND policyname = 'Users can view own cache') THEN
    CREATE POLICY "Users can view own cache"
      ON public.subscription_state_cache FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 5. DATA LIFECYCLE
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.conversation_threads ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.conversation_threads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_inbox_archived ON public.inbox_messages(is_archived) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_threads_archived ON public.conversation_threads(is_archived) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_leads_deleted ON public.leads(is_deleted) WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS public.workspace_storage_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL UNIQUE,
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  storage_limit_bytes BIGINT NOT NULL DEFAULT 1073741824,
  messages_count BIGINT NOT NULL DEFAULT 0,
  messages_limit BIGINT NOT NULL DEFAULT 100000,
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_storage_quotas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workspace_storage_quotas' AND policyname = 'Members can view own quota') THEN
    CREATE POLICY "Members can view own quota"
      ON public.workspace_storage_quotas FOR SELECT TO authenticated
      USING (public.is_workspace_member(auth.uid(), workspace_id));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 6. SECURITY HARDENING
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  country_code TEXT,
  risk_score INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'security_events' AND policyname = 'Users can view own security events') THEN
    CREATE POLICY "Users can view own security events"
      ON public.security_events FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'security_events' AND policyname = 'Users can insert own security events') THEN
    CREATE POLICY "Users can insert own security events"
      ON public.security_events FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_security_events_user ON public.security_events(user_id, created_at DESC);

ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS require_2fa BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS max_sessions_per_user INT NOT NULL DEFAULT 5;

CREATE OR REPLACE FUNCTION public.detect_suspicious_login(
  _user_id UUID,
  _ip_address TEXT,
  _user_agent TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _known_ip BOOLEAN;
  _recent_fails INT;
  _is_suspicious BOOLEAN := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.security_events
    WHERE user_id = _user_id AND ip_address = _ip_address AND event_type = 'login_success'
    LIMIT 1
  ) INTO _known_ip;

  SELECT COUNT(*) INTO _recent_fails
  FROM public.security_events
  WHERE user_id = _user_id AND event_type = 'login_failed'
    AND created_at > now() - interval '1 hour';

  IF NOT _known_ip AND _recent_fails >= 3 THEN
    _is_suspicious := true;
  END IF;

  INSERT INTO public.security_events (user_id, event_type, ip_address, user_agent, risk_score)
  VALUES (
    _user_id,
    CASE WHEN _is_suspicious THEN 'suspicious_login' ELSE 'login_success' END,
    _ip_address, _user_agent,
    CASE WHEN _is_suspicious THEN 80 ELSE 0 END
  );

  RETURN _is_suspicious;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_old_messages(
  _workspace_id UUID,
  _days_old INT DEFAULT 90
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _archived INT;
BEGIN
  UPDATE public.inbox_messages
  SET is_archived = true, archived_at = now()
  WHERE user_id IN (SELECT owner_id FROM public.workspaces WHERE id = _workspace_id)
    AND is_archived = false
    AND message_timestamp < now() - (_days_old || ' days')::interval;

  GET DIAGNOSTICS _archived = ROW_COUNT;
  RETURN _archived;
END;
$$;
