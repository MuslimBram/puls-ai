-- P0.6 — Universal inbound content security firewall: schema/core
-- Additive only. Production execution/deploy is intentionally deferred.

BEGIN;

CREATE TABLE IF NOT EXISTS public.content_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 80),
  event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 8 AND 200),
  category text NOT NULL CHECK (category IN (
    'safe', 'spam', 'scam', 'phishing', 'malware', 'credential_theft',
    'harassment', 'insult', 'threat', 'violence', 'extortion', 'impersonation',
    'prompt_injection', 'suspicious_link', 'competitor_or_social_engineering', 'unknown'
  )),
  risk_score smallint NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  action text NOT NULL CHECK (action IN ('allow', 'quarantine', 'reject', 'tag')),
  decision_reason text NOT NULL CHECK (char_length(decision_reason) BETWEEN 1 AND 160),
  content_sha256 text CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
  scanner_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
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
  payload_ciphertext text,
  payload_iv text,
  payload_alg text CHECK (payload_alg IS NULL OR payload_alg = 'AES-GCM-256'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, source, event_id),
  CHECK (
    (payload_ciphertext IS NULL AND payload_iv IS NULL AND payload_alg IS NULL)
    OR
    (payload_ciphertext IS NOT NULL AND payload_iv IS NOT NULL AND payload_alg = 'AES-GCM-256')
  )
);

CREATE INDEX IF NOT EXISTS idx_content_security_events_workspace_created
  ON public.content_security_events(workspace_id, created_at DESC);
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

CREATE OR REPLACE FUNCTION public.record_content_security_event(
  p_workspace_id uuid,
  p_source text,
  p_event_id text,
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
  v_reused boolean := false;
BEGIN
  INSERT INTO public.content_security_events (
    workspace_id,
    source,
    event_id,
    category,
    risk_score,
    action,
    decision_reason,
    content_sha256,
    scanner_versions,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_source,
    p_event_id,
    p_category,
    p_risk_score,
    p_action,
    p_decision_reason,
    p_content_sha256,
    COALESCE(p_scanner_versions, '{}'::jsonb),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (workspace_id, source, event_id) DO NOTHING
  RETURNING * INTO v_event;

  IF NOT FOUND THEN
    SELECT * INTO v_event
    FROM public.content_security_events
    WHERE workspace_id = p_workspace_id
      AND source = p_source
      AND event_id = p_event_id;
    v_reused := true;
  END IF;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'CONTENT_SECURITY_EVENT_RECORD_FAILED';
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
    'reused', v_reused
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_content_security_event(
  uuid, text, text, text, integer, text, text, text, jsonb, jsonb, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_content_security_event(
  uuid, text, text, text, integer, text, text, text, jsonb, jsonb, text, text, text, jsonb
) TO service_role;

COMMENT ON TABLE public.content_security_events IS
  'Idempotent tenant-bound content security decisions. Never stores raw inbound content.';
COMMENT ON TABLE public.content_security_quarantine IS
  'Encrypted or metadata-only quarantine records for blocked inbound content.';

COMMIT;
