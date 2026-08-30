-- Security Advisor corrective boundary for legacy audit-write RPC.
-- public.log_audit accepts caller-supplied user/action/metadata fields and has no
-- caller-bound authorization guard. It has no canonical repository call-sites or
-- live function/view dependencies, so browser execution is unnecessary and would
-- allow authenticated callers to forge audit records under arbitrary identities.

REVOKE ALL ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb) IS
  'Backend-only audit writer. Browser execution revoked to prevent forged actor/action/metadata audit entries.';
