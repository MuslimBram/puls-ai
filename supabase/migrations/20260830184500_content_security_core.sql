-- P0.6 — Universal inbound content security firewall: schema/core
-- Additive only. Production execution/deploy is intentionally deferred.

BEGIN;

CREATE TABLE IF NOT EXISTS public.content_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 80),
  event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 8 AND 200),
  processing_status text NOT NULL DEFAULT 'reserved'
    CHECK (processing_status IN ('reserved', 'completed', 'failed')),
  claim_token uuid NOT NULL DEFAULT gen_random_uuid(),
  claim_expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '15 minutes'),
  category text NOT NULL DEFAULT 'unknown' CHECK (category IN (
    'safe', 'spam', 'scam', 'phishing', 'malware', 'credential_theft',
    'harassment', 'insult', 'threat', 'violence', 'extortion', 'impersonation',
    'prompt_injection', 'suspicious_link', 'competitor_or_social_engineering', 'unknown'
  )),
  risk_score smallint NOT NULL DEFAULT 100 CHECK (risk_score BETWEEN 0 AND 100),
  action text NOT NULL DEFAULT 'quarantine' CHECK (action IN ('allow', 'quarantine', 'reject', 'tag')),
  decision_reason text NOT NULL DEFAULT 'PENDING_CLASSIFICATION'
    CHECK (char_length(decision_reason) BETWEEN 1 AND 160),
  content_sha256 text CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
  scanner_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  failed_at timestamptz,
  UNIQUE (workspace_id, source, event_id)
);

CREATE TABLE IF NOT EXISTS public.content_security_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_event_id uuid NOT NULL UNIQUE REFERENCES public.content_security_events(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  source text NOT NULL,
  event_id text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'released', 'rejected')),
  payload_ciphertext text NOT NULL,
  payload_iv text NOT NULL,
  payload_alg text NOT NULL CHECK (payload_alg = 'AES-GCM-256'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, source, event_id)
);

CREATE INDEX IF NOT EXISTS idx_content_security_events_workspace_created
  ON public.content_security_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_security_events_status_claim
  ON public.content_security_events(processing_status, claim_expires_at);
CREATE INDEX IF NOT EXISTS idx_content_security_events_category_created
  ON public.content_security_events(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_security_quarantine_workspace_status
  ON public.content_security_quarantine(workspace_id, status, created_at DESC);

ALTER TABLE public.content_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_security_quarantine ENABLE ROW LEVEL SECURITY;

-- No direct browser/client access. Human review will be exposed later through a
-- caller-bound backend surface rather than broad Data API grants.
REVOKE ALL ON TABLE public.content_security_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.content_security_quarantine FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_security_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_security_quarantine TO service_role;

CREATE OR REPLACE FUNCTION public.claim_content_security_event(
  p_workspace_id uuid,
  p_source text,
  p_event_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.content_security_events%ROWTYPE;
  v_new_token uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.content_security_events (
    workspace_id,
    source,
    event_id,
    processing_status,
    claim_token,
    claim_expires_at
  )
  VALUES (
    p_workspace_id,
    p_source,
    p_event_id,
    'reserved',
    v_new_token,
    clock_timestamp() + interval '15 minutes'
  )
  ON CONFLICT (workspace_id, source, event_id) DO NOTHING
  RETURNING * INTO v_event;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reused', false,
      'status', 'reserved',
      'event_record_id', v_event.id,
      'claim_token', v_event.claim_token
    );
  END IF;

  SELECT * INTO v_event
  FROM public.content_security_events
  WHERE workspace_id = p_workspace_id
    AND source = p_source
    AND event_id = p_event_id;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'CONTENT_SECURITY_CLAIM_LOOKUP_FAILED';
  END IF;

  IF v_event.processing_status = 'completed' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reused', true,
      'status', 'completed',
      'event_record_id', v_event.id,
      'category', v_event.category,
      'risk_score', v_event.risk_score,
      'action', v_event.action,
      'decision_reason', v_event.decision_reason
    );
  END IF;

  -- Failed work is retryable. Expired reservations may also be reclaimed.
  IF v_event.processing_status = 'failed'
     OR (v_event.processing_status = 'reserved' AND v_event.claim_expires_at <= clock_timestamp()) THEN
    v_new_token := gen_random_uuid();

    UPDATE public.content_security_events
    SET processing_status = 'reserved',
        claim_token = v_new_token,
        claim_expires_at = clock_timestamp() + interval '15 minutes',
        decision_reason = 'PENDING_CLASSIFICATION',
        failed_at = NULL
    WHERE id = v_event.id
      AND (
        processing_status = 'failed'
        OR (processing_status = 'reserved' AND claim_expires_at <= clock_timestamp())
      )
    RETURNING * INTO v_event;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'allowed', true,
        'reused', true,
        'reclaimed', true,
        'status', 'reserved',
        'event_record_id', v_event.id,
        'claim_token', v_event.claim_token
      );
    END IF;

    SELECT * INTO v_event
    FROM public.content_security_events
    WHERE workspace_id = p_workspace_id
      AND source = p_source
      AND event_id = p_event_id;
  END IF;

  RETURN jsonb_build_object(
    'allowed', false,
    'reused', true,
    'status', v_event.processing_status,
    'code', '409_in_progress',
    'event_record_id', v_event.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_content_security_event(
  p_workspace_id uuid,
  p_source text,
  p_event_id text,
  p_claim_token uuid,
  p_category text,
  p_risk_score integer,
  p_action text,
  p_decision_reason text,
  p_content_sha256 text DEFAULT NULL,
  p_scanner_versions jsonb DEFAULT '{}'::jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_quarantine_ciphertext text DEFAULT NULL,
  p_quarantine_iv text DEFAULT NULL,
  p_quarantine_alg text DEFAULT NULL,
  p_quarantine_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.content_security_events%ROWTYPE;
BEGIN
  IF p_action = 'quarantine'
     AND (p_quarantine_ciphertext IS NULL OR p_quarantine_iv IS NULL OR p_quarantine_alg <> 'AES-GCM-256') THEN
    RAISE EXCEPTION 'QUARANTINE_ENCRYPTION_REQUIRED';
  END IF;

  UPDATE public.content_security_events
  SET processing_status = 'completed',
      category = p_category,
      risk_score = p_risk_score,
      action = p_action,
      decision_reason = p_decision_reason,
      content_sha256 = p_content_sha256,
      scanner_versions = COALESCE(p_scanner_versions, '{}'::jsonb),
      metadata = COALESCE(p_metadata, '{}'::jsonb),
      completed_at = clock_timestamp(),
      failed_at = NULL
  WHERE workspace_id = p_workspace_id
    AND source = p_source
    AND event_id = p_event_id
    AND processing_status = 'reserved'
    AND claim_token = p_claim_token
  RETURNING * INTO v_event;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'CONTENT_SECURITY_CLAIM_NOT_OWNED';
  END IF;

  IF v_event.action = 'quarantine' THEN
    INSERT INTO public.content_security_quarantine (
      security_event_id,
      workspace_id,
      source,
      event_id,
      category,
      payload_ciphertext,
      payload_iv,
      payload_alg,
      metadata
    )
    VALUES (
      v_event.id,
      v_event.workspace_id,
      v_event.source,
      v_event.event_id,
      v_event.category,
      p_quarantine_ciphertext,
      p_quarantine_iv,
      p_quarantine_alg,
      COALESCE(p_quarantine_metadata, '{}'::jsonb)
    )
    ON CONFLICT (security_event_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'id', v_event.id,
    'workspace_id', v_event.workspace_id,
    'source', v_event.source,
    'event_id', v_event.event_id,
    'category', v_event.category,
    'risk_score', v_event.risk_score,
    'action', v_event.action,
    'decision_reason', v_event.decision_reason,
    'status', v_event.processing_status,
    'reused', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_content_security_event(
  p_workspace_id uuid,
  p_source text,
  p_event_id text,
  p_claim_token uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.content_security_events
  SET processing_status = 'failed',
      decision_reason = left(COALESCE(NULLIF(p_reason, ''), 'CONTENT_SECURITY_PROCESSING_FAILED'), 160),
      failed_at = clock_timestamp(),
      claim_expires_at = clock_timestamp()
  WHERE workspace_id = p_workspace_id
    AND source = p_source
    AND event_id = p_event_id
    AND processing_status = 'reserved'
    AND claim_token = p_claim_token;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_content_security_event(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_content_security_event(uuid, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.finalize_content_security_event(
  uuid, text, text, uuid, text, integer, text, text, text, jsonb, jsonb, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_content_security_event(
  uuid, text, text, uuid, text, integer, text, text, text, jsonb, jsonb, text, text, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.fail_content_security_event(uuid, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_content_security_event(uuid, text, text, uuid, text)
  TO service_role;

COMMENT ON TABLE public.content_security_events IS
  'Tenant-bound content security claims and decisions. Raw inbound content is never stored here.';
COMMENT ON TABLE public.content_security_quarantine IS
  'Encrypted quarantine records. Completed quarantine decisions require AES-GCM payload storage.';

COMMIT;
