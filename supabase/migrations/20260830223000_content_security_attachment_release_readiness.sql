-- P0.6 — Malware-clean is necessary but never sufficient to release quarantine.
-- This function is read-only decision support for a future caller-bound review
-- surface. It does NOT mutate the parent event or quarantine row.

CREATE OR REPLACE FUNCTION public.get_content_security_attachment_release_readiness(
  p_security_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.content_security_events%ROWTYPE;
  v_text_policy jsonb;
  v_text_action text;
  v_text_category text;
  v_text_risk integer;
  v_text_reason text;
  v_expected_attachment_count integer;
  v_scan_count integer;
  v_clean_count integer;
  v_infected_count integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_event
  FROM public.content_security_events
  WHERE id = p_security_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ready', false, 'code', 'SECURITY_EVENT_NOT_FOUND');
  END IF;

  IF v_event.processing_status <> 'completed' OR v_event.action <> 'quarantine' THEN
    RETURN jsonb_build_object(
      'ready', false,
      'code', 'PARENT_NOT_QUARANTINED',
      'parent_action', v_event.action,
      'parent_status', v_event.processing_status
    );
  END IF;

  -- Completeness is bound server-side by the enqueue RPC. Never infer the
  -- expected number of files from the rows that happen to exist.
  v_expected_attachment_count := v_event.expected_attachment_count;
  IF v_expected_attachment_count IS NULL OR v_expected_attachment_count < 1 THEN
    RETURN jsonb_build_object(
      'ready', false,
      'code', 'ATTACHMENT_COUNT_UNVERIFIED',
      'requires_human_review', true
    );
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE status = 'clean')::integer,
    count(*) FILTER (WHERE status = 'infected')::integer
  INTO v_scan_count, v_clean_count, v_infected_count
  FROM public.content_security_attachment_scans
  WHERE security_event_id = p_security_event_id;

  IF v_scan_count = 0 THEN
    RETURN jsonb_build_object('ready', false, 'code', 'MALWARE_SCAN_MISSING');
  END IF;

  IF v_scan_count <> v_expected_attachment_count THEN
    RETURN jsonb_build_object(
      'ready', false,
      'code', 'ATTACHMENT_SCAN_COUNT_MISMATCH',
      'expected_attachment_count', v_expected_attachment_count,
      'scan_count', v_scan_count,
      'requires_human_review', true
    );
  END IF;

  IF v_infected_count > 0 THEN
    RETURN jsonb_build_object(
      'ready', false,
      'code', 'MALWARE_INFECTED',
      'infected_count', v_infected_count,
      'attachment_count', v_scan_count,
      'requires_human_review', true
    );
  END IF;

  IF v_clean_count <> v_expected_attachment_count THEN
    RETURN jsonb_build_object(
      'ready', false,
      'code', 'MALWARE_SCANS_NOT_ALL_CLEAN',
      'expected_attachment_count', v_expected_attachment_count,
      'clean_count', v_clean_count,
      'scan_count', v_scan_count,
      'requires_human_review', true
    );
  END IF;

  -- A clean file set cannot erase a text-policy quarantine/reject. The firewall
  -- must have persisted a machine-only text_policy before automated readiness
  -- can ever be considered. Until then this stays human-review-only.
  v_text_policy := COALESCE(v_event.metadata -> 'text_policy', '{}'::jsonb);
  v_text_action := v_text_policy ->> 'action';
  v_text_category := v_text_policy ->> 'category';
  v_text_reason := v_text_policy ->> 'reason_code';

  BEGIN
    v_text_risk := (v_text_policy ->> 'risk_score')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    v_text_risk := NULL;
  END;

  IF v_text_action IS NULL OR v_text_category IS NULL OR v_text_reason IS NULL OR v_text_risk IS NULL THEN
    RETURN jsonb_build_object(
      'ready', false,
      'code', 'TEXT_POLICY_MISSING',
      'requires_human_review', true
    );
  END IF;

  IF v_text_action NOT IN ('allow', 'tag') THEN
    RETURN jsonb_build_object(
      'ready', false,
      'code', 'TEXT_POLICY_BLOCKS_RELEASE',
      'text_action', v_text_action,
      'text_category', v_text_category,
      'text_risk_score', v_text_risk,
      'requires_human_review', true
    );
  END IF;

  RETURN jsonb_build_object(
    'ready', true,
    'code', 'READY_FOR_REVIEW_RELEASE',
    'attachment_count', v_scan_count,
    'text_action', v_text_action,
    'text_category', v_text_category,
    'text_risk_score', v_text_risk,
    'text_reason_code', v_text_reason,
    'requires_human_review', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_content_security_attachment_release_readiness(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_content_security_attachment_release_readiness(uuid)
  TO service_role;

COMMENT ON FUNCTION public.get_content_security_attachment_release_readiness(uuid) IS
  'Read-only release readiness. Every server-bound expected attachment must be malware-clean; clean scans never override text-policy quarantine/reject and never release content themselves.';
