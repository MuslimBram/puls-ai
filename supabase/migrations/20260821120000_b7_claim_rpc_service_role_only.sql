-- Migration: 20260821120000_b7_claim_rpc_service_role_only.sql
-- B7 Reconciliation: claim_community_ai_request — service_role ONLY
--
-- Context:
--   20260816030000_lidhjet_rpc_hardening.sql revoked from PUBLIC but granted
--   EXECUTE to authenticated, service_role.
--
-- Call-site audit (2026-08-21): ALL call sites use adminClient (service_role key).
--   - supabase/functions/community-assess-profile/index.ts → adminClient.rpc(...)
--   - supabase/functions/community-scan-image/index.ts    → adminClient.rpc(...)
--   No authenticated client ever calls this function directly.
--
-- Decision: SERVICE_ROLE_ONLY SAFE. Revoke authenticated execute.
--
-- SOURCE/CANONICAL SECURITY HARDENING ONLY.
-- DO NOT APPLY TO PRODUCTION DATABASE YET.
-- Production DB rollout remains blocked pending migration baseline/history reconciliation.

REVOKE EXECUTE ON FUNCTION public.claim_community_ai_request FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_community_ai_request TO service_role;
