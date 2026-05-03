
-- Admin RLS: view all paypal_transactions
DROP POLICY IF EXISTS "Admins can view all PayPal transactions" ON public.paypal_transactions;
CREATE POLICY "Admins can view all PayPal transactions"
ON public.paypal_transactions FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Admin RLS: view all billing_history
DROP POLICY IF EXISTS "Admins can view all billing history" ON public.billing_history;
CREATE POLICY "Admins can view all billing history"
ON public.billing_history FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Admin RLS: view all paypal_webhook_events for super_admin too
DROP POLICY IF EXISTS "Admins+SuperAdmins can view webhook events" ON public.paypal_webhook_events;
CREATE POLICY "Admins+SuperAdmins can view webhook events"
ON public.paypal_webhook_events FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Billing consistency report
CREATE OR REPLACE FUNCTION public.billing_consistency_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_completed_no_billing int;
  v_billing_no_txn int;
  v_pending_old int;
  v_failed_recent int;
  v_webhook_unprocessed int;
  v_webhook_failed int;
  v_subs_without_history int;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*) INTO v_completed_no_billing
  FROM paypal_transactions pt
  WHERE pt.status = 'completed'
    AND pt.paypal_capture_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM billing_history bh
      WHERE bh.stripe_invoice_id = 'paypal_' || pt.paypal_capture_id
    );

  SELECT COUNT(*) INTO v_billing_no_txn
  FROM billing_history bh
  WHERE bh.stripe_invoice_id LIKE 'paypal_%'
    AND NOT EXISTS (
      SELECT 1 FROM paypal_transactions pt
      WHERE 'paypal_' || pt.paypal_capture_id = bh.stripe_invoice_id
    );

  SELECT COUNT(*) INTO v_pending_old
  FROM paypal_transactions
  WHERE status = 'pending' AND created_at < now() - interval '24 hours';

  SELECT COUNT(*) INTO v_failed_recent
  FROM paypal_transactions
  WHERE status IN ('failed','denied','reversed','capture_failed')
    AND created_at > now() - interval '7 days';

  SELECT COUNT(*) INTO v_webhook_unprocessed
  FROM paypal_webhook_events
  WHERE status = 'received' AND created_at < now() - interval '10 minutes';

  SELECT COUNT(*) INTO v_webhook_failed
  FROM paypal_webhook_events
  WHERE status IN ('error','signature_failed','config_missing')
    AND created_at > now() - interval '7 days';

  SELECT COUNT(*) INTO v_subs_without_history
  FROM subscriptions s
  WHERE s.subscription_status IN ('active','trialing')
    AND s.plan IS NOT NULL
    AND s.plan <> 'free'
    AND NOT EXISTS (
      SELECT 1 FROM billing_history bh WHERE bh.user_id = s.user_id
    );

  result := jsonb_build_object(
    'generated_at', now(),
    'paypal', jsonb_build_object(
      'completed_without_billing', v_completed_no_billing,
      'billing_without_transaction', v_billing_no_txn,
      'pending_over_24h', v_pending_old,
      'failed_last_7d', v_failed_recent
    ),
    'webhooks', jsonb_build_object(
      'unprocessed_over_10min', v_webhook_unprocessed,
      'failed_last_7d', v_webhook_failed
    ),
    'subscriptions', jsonb_build_object(
      'paid_without_history', v_subs_without_history
    ),
    'is_healthy', (
      v_completed_no_billing = 0
      AND v_billing_no_txn = 0
      AND v_pending_old = 0
      AND v_webhook_unprocessed = 0
      AND v_webhook_failed = 0
    )
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_consistency_report() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_consistency_report() TO authenticated, service_role;
