-- Security Advisor corrective boundary for legacy explicit-user helper RPCs.
-- These helpers are not referenced by current policies/views/functions and have no
-- runtime call-sites in the canonical repository. Keeping them browser-callable
-- would let an authenticated user query authorization/plan facts for arbitrary
-- user IDs. Preserve backend/service use only and fail closed for browser roles.

REVOKE ALL ON FUNCTION public.check_business_creation_limit(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_business_creation_limit(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.check_channel_business_ownership(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_channel_business_ownership(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.check_business_creation_limit(uuid) IS
  'Backend-only legacy explicit-user business-limit helper. Browser execution revoked to prevent arbitrary-user subject spoofing.';

COMMENT ON FUNCTION public.check_channel_business_ownership(uuid, uuid) IS
  'Backend-only legacy explicit-user ownership helper. Browser execution revoked to prevent arbitrary-user subject spoofing.';
