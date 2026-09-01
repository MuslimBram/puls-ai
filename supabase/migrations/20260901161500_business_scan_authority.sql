-- ============================================================
-- BUSINESS SCAN EXECUTION AUTHORITY
-- Caller-bound authority resolver for service-role scan workers.
-- ============================================================

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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'business scan authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT sh.workspace_id, sh.business_id, sh.scanned_url, sh.triggered_by, sh.status
    INTO v_workspace_id, v_business_id, v_scanned_url, v_triggered_by, v_status
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

  IF v_status NOT IN ('pending', 'scanning', 'failed') THEN
    RAISE EXCEPTION 'business scan is not executable from its current state';
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

  RETURN QUERY
  SELECT v_workspace_id, v_business_id, v_scanned_url, v_triggered_by;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_business_scan_authority(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_business_scan_authority(uuid, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.resolve_business_scan_authority(uuid, uuid, uuid) IS
  'Caller-bound resolver for Business Intelligence scans. Returns server-derived tenant/business/url only after current workspace and source relationships are verified.';
