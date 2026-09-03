-- ============================================================
-- BUSINESS SCAN EXECUTION AUTHORITY
-- Caller-bound authority resolver for service-role scan workers.
-- ============================================================

ALTER TABLE public.business_scan_history
  ADD COLUMN IF NOT EXISTS execution_claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.resolve_business_scan_authority(
  p_scan_history_id uuid,
  p_source_id uuid,
  p_source_scan_id uuid
)
RETURNS TABLE (
  workspace_id uuid,
  business_id uuid,
  scanned_url text,
  triggered_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_workspace_id uuid;
  v_business_id uuid;
  v_scanned_url text;
  v_triggered_by uuid;
  v_status text;
  v_claimed_at timestamptz;
  v_claim_count integer := 0;
  v_lock_key bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'business scan authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT sh.workspace_id, sh.business_id, sh.scanned_url, sh.triggered_by,
         sh.status, sh.execution_claimed_at
    INTO v_workspace_id, v_business_id, v_scanned_url, v_triggered_by,
         v_status, v_claimed_at
  FROM public.business_scan_history sh
  WHERE sh.id = p_scan_history_id;

  IF v_workspace_id IS NULL OR v_business_id IS NULL THEN
    RAISE EXCEPTION 'business scan authority denied' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_workspace_access(v_workspace_id) THEN
    RAISE EXCEPTION 'business scan authority denied' USING ERRCODE = '42501';
  END IF;

  -- A scan may be executed by its initiating user or by a current workspace
  -- owner/admin. Knowing a UUID never grants scan authority.
  IF v_triggered_by IS DISTINCT FROM v_user_id
     AND NOT public.has_workspace_role(v_workspace_id, ARRAY['owner','admin']::text[]) THEN
    RAISE EXCEPTION 'business scan authority denied' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('pending', 'failed', 'scanning') THEN
    RAISE EXCEPTION 'business scan is not executable from its current state';
  END IF;

  -- A scanning row may be recovered only after the previous claim has gone
  -- stale. The normal deep crawl is capped at two minutes, so five minutes is
  -- a deliberately conservative fail-closed recovery window.
  IF v_status = 'scanning'
     AND v_claimed_at IS NOT NULL
     AND v_claimed_at > pg_catalog.now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'business scan is already actively claimed' USING ERRCODE = '55P03';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.business_profiles bp
    WHERE bp.id = v_business_id
      AND bp.workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'business scan workspace/business mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.scan_sources ss
    WHERE ss.id = p_source_id
      AND ss.workspace_id = v_workspace_id
      AND ss.business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'business scan source authority denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.source_scans sscan
    WHERE sscan.id = p_source_scan_id
      AND sscan.source_id = p_source_id
      AND sscan.workspace_id = v_workspace_id
      AND sscan.business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'business scan source-scan authority denied' USING ERRCODE = '42501';
  END IF;

  -- Serialize execution for the same exact business/root URL. This prevents
  -- duplicate browser invocations or duplicate scan rows from spending
  -- Firecrawl/AI concurrently and removes stale-completion ordering races.
  v_lock_key := pg_catalog.hashtextextended(
    v_workspace_id::text || '|' || v_business_id::text || '|' || pg_catalog.lower(pg_catalog.btrim(v_scanned_url)),
    0
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

  IF EXISTS (
    SELECT 1
    FROM public.business_scan_history other
    WHERE other.id <> p_scan_history_id
      AND other.workspace_id = v_workspace_id
      AND other.business_id = v_business_id
      AND pg_catalog.lower(pg_catalog.btrim(other.scanned_url)) = pg_catalog.lower(pg_catalog.btrim(v_scanned_url))
      AND other.status = 'scanning'
      AND other.execution_claimed_at IS NOT NULL
      AND other.execution_claimed_at > pg_catalog.now() - interval '5 minutes'
  ) THEN
    RAISE EXCEPTION 'business scan already active for this business URL' USING ERRCODE = '55P03';
  END IF;

  UPDATE public.business_scan_history sh
  SET status = 'scanning',
      scan_phase = 'authorized',
      execution_claimed_at = pg_catalog.now(),
      error_message = NULL
  WHERE sh.id = p_scan_history_id
    AND sh.workspace_id = v_workspace_id
    AND sh.business_id = v_business_id
    AND (
      sh.status IN ('pending', 'failed')
      OR (
        sh.status = 'scanning'
        AND (
          sh.execution_claimed_at IS NULL
          OR sh.execution_claimed_at <= pg_catalog.now() - interval '5 minutes'
        )
      )
    );

  GET DIAGNOSTICS v_claim_count = ROW_COUNT;
  IF v_claim_count <> 1 THEN
    RAISE EXCEPTION 'business scan execution claim lost' USING ERRCODE = '55P03';
  END IF;

  RETURN QUERY
  SELECT v_workspace_id, v_business_id, v_scanned_url, v_triggered_by;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_business_scan_authority(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_business_scan_authority(uuid, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.resolve_business_scan_authority(uuid, uuid, uuid) IS
  'Caller-bound resolver and atomic scan claimant. Returns server-derived tenant/business/url only after current workspace/source relationships are verified and duplicate execution is serialized.';
