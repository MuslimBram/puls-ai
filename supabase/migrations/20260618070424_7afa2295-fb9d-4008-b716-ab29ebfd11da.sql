
-- 1. business_scan_submissions — remove anon insert
DROP POLICY IF EXISTS "Anyone can submit a scan" ON public.business_scan_submissions;
CREATE POLICY "Authenticated users can submit a scan"
  ON public.business_scan_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 2. login_otp_codes — explicit deny for anon/authenticated; service role only
DROP POLICY IF EXISTS "Service role only" ON public.login_otp_codes;
CREATE POLICY "Service role only access"
  ON public.login_otp_codes
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
-- Ensure no anon/authenticated grants
REVOKE ALL ON public.login_otp_codes FROM anon, authenticated;
GRANT ALL ON public.login_otp_codes TO service_role;

-- 3. registered_assets — workspace-scoped read
DROP POLICY IF EXISTS "Anyone authenticated can view active assets" ON public.registered_assets;
CREATE POLICY "Workspace members can view assets"
  ON public.registered_assets
  FOR SELECT
  TO authenticated
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 4. conversation_locks — remove permissive read
DROP POLICY IF EXISTS "Users can view all locks" ON public.conversation_locks;
-- Allow lock owner to also see their own locks (in addition to thread owner policy)
DROP POLICY IF EXISTS "Users can view own locks" ON public.conversation_locks;
CREATE POLICY "Users can view own locks"
  ON public.conversation_locks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = locked_by);

-- 5. webhook_activity_logs — restrict insert to service role
DROP POLICY IF EXISTS "Service role can insert webhook logs" ON public.webhook_activity_logs;
CREATE POLICY "Service role can insert webhook logs"
  ON public.webhook_activity_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 6. Revoke EXECUTE on SECURITY DEFINER functions from anon (keep authenticated/service_role for those called from client)
REVOKE EXECUTE ON FUNCTION public.archive_old_messages(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.billing_consistency_report() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_user_account_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_locks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_unpaid_accounts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_agent_performance(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_ai_metrics(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_channel_performance(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_funnel_analytics(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_thread_sla(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.detect_suspicious_login(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_daily_ai_replies() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_monthly_usage() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_expired_media_daily_usage() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_referral_statuses() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vault_read_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vault_store_secret(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vault_delete_secret(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_block_brute_force() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_support_ticket_on_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_reopen_thread_on_inbound() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_thread_state_machine() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_quota_exceeded_flag() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_user_wallet() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_partner_wallet() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_partner_referral_code() FROM PUBLIC, anon, authenticated;
