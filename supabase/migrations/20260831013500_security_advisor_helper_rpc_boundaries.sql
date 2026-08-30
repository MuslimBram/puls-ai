-- Security Advisor corrective boundaries for legacy helper RPCs.
-- Keep the storage-quota helper browser-callable because the frontend uses it,
-- but bind it to the caller's workspace access. Unused arbitrary-subject helpers
-- become service-role only to avoid cross-user/workspace information or policy leaks.

CREATE OR REPLACE FUNCTION public.check_storage_quota(
  _workspace_id uuid,
  _resource_type text DEFAULT 'messages'::text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _quota RECORD;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_workspace_access(_workspace_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: workspace access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _quota
  FROM public.workspace_storage_quotas
  WHERE workspace_id = _workspace_id;

  IF _quota IS NULL THEN
    RETURN true;
  END IF;

  CASE _resource_type
    WHEN 'messages' THEN
      RETURN _quota.messages_count < _quota.max_messages;
    WHEN 'documents' THEN
      RETURN _quota.documents_count < _quota.max_documents;
    WHEN 'media' THEN
      RETURN _quota.media_size_mb < _quota.max_media_mb;
    ELSE
      RETURN true;
  END CASE;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_freelancer_relation_eligibility(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_freelancer_relation_eligibility(uuid, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.evaluate_contact_policy(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_contact_policy(uuid, uuid, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_active_referral_count(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_referral_count(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.validate_nba_against_rules(uuid, text, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_nba_against_rules(uuid, text, numeric, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.check_storage_quota(uuid, text) IS
  'Caller-bound storage quota helper. Browser callers must have workspace access; service_role may query explicitly.';

COMMENT ON FUNCTION public.check_freelancer_relation_eligibility(uuid, uuid, text) IS
  'Backend-only explicit-subject freelancer relation eligibility helper.';
COMMENT ON FUNCTION public.evaluate_contact_policy(uuid, uuid, text, text) IS
  'Backend-only contact-policy evaluator for explicit workspace/lead subjects.';
COMMENT ON FUNCTION public.get_active_referral_count(uuid) IS
  'Backend-only explicit-user referral-count helper.';
COMMENT ON FUNCTION public.validate_nba_against_rules(uuid, text, numeric, text, uuid) IS
  'Backend-only next-best-action rule validator for explicit workspace/lead subjects.';
