-- POST-DEPLOY NEGATIVE PROBES for paypal-webhook v54.
-- Purpose: prove the rewritten function is live and STILL fail-closed, without
-- creating any claim, transaction or entitlement (verification runs before the
-- idempotency claim, so a rejected probe can leave no trace in the database).
--   P1 no PayPal headers          -> expect 403 missing_paypal_headers
--   P2 full headers, fake sig     -> expect 403 verification_status_FAILURE
select
  net.http_post(
    url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/paypal-webhook',
    headers := jsonb_build_object('Content-Type','application/json'),
    body    := jsonb_build_object('id','PROBE-NO-HEADERS','event_type','PAYMENT.CAPTURE.COMPLETED','resource', jsonb_build_object('id','PROBE-CAPTURE'))
  ) as probe_no_headers,
  net.http_post(
    url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/paypal-webhook',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'paypal-auth-algo','SHA256withRSA',
      'paypal-cert-url','https://api.paypal.com/v1/notifications/certs/CERT-probe',
      'paypal-transmission-id','probe-transmission-id',
      'paypal-transmission-time','2026-09-14T21:00:00Z',
      'paypal-transmission-sig','ZmFrZS1zaWduYXR1cmU='
    ),
    body    := jsonb_build_object('id','PROBE-FAKE-SIG','event_type','PAYMENT.CAPTURE.COMPLETED','resource', jsonb_build_object('id','PROBE-CAPTURE-2'))
  ) as probe_fake_sig;;
