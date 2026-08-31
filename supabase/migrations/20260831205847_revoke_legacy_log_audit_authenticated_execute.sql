-- Phase G residual closure: legacy log_audit accepts caller-controlled actor/action metadata.
-- Canonical browser audit writes use record_client_audit_event instead.
-- Keep backend/service execution available while removing the authenticated RPC surface.

REVOKE EXECUTE ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)
  TO service_role;
