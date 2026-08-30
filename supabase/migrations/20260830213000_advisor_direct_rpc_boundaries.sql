-- Security Advisor follow-up preparation.
-- These helpers are backend/service wrappers, not browser RPC surfaces.
-- Keep service_role execution for canonical Edge Functions while preventing
-- authenticated callers from bypassing their caller-bound API boundaries.

REVOKE EXECUTE ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_asset_duplicate(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_asset_duplicate(text, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_freelancer_relation_eligibility(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_freelancer_relation_eligibility(uuid, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)
  IS 'Backend-only audit writer. Browser/client audit events must use the caller-bound record_client_audit_event RPC.';
COMMENT ON FUNCTION public.check_asset_duplicate(text, text)
  IS 'Backend-only duplicate checker invoked through the authenticated check-duplicate-asset Edge Function.';
COMMENT ON FUNCTION public.check_freelancer_relation_eligibility(uuid, uuid, text)
  IS 'Backend-only eligibility helper invoked through a caller-authenticated service boundary.';
