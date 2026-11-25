-- HAPI 5 / B4 step 2 — non-invasive configuration probes.
-- No secret is read, written or logged. No PayPal API is called by me. These
-- only ask the deployed endpoint which of its own fail-closed branches it takes,
-- and each branch maps to a distinct configuration state:
--
--   503 paypal_credentials_not_configured
--        -> at least one of PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET /
--           PAYPAL_WEBHOOK_ID is MISSING
--   403 missing_paypal_headers
--        -> all three ARE configured (the config gate was passed)
--   401 from the gateway (no JSON body from the function)
--        -> verify_jwt is ON and PayPal could never reach the function at all
--
-- P1: no PayPal headers at all -> config gate
-- P2: full set of (fake) PayPal headers -> pushes past the header gate into the
--     OAuth + verify step, so the reason distinguishes "credentials do not
--     authenticate against the selected environment" from "signature rejected".
select net.http_post(
  url := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/paypal-webhook',
  headers := jsonb_build_object('Content-Type','application/json'),
  body := jsonb_build_object('id','PROBE-CONFIG-1','event_type','PROBE.CONFIG.CHECK')
);

select net.http_post(
  url := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/paypal-webhook',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'paypal-auth-algo','SHA256withRSA',
    'paypal-cert-url','https://api.sandbox.paypal.com/v1/notifications/certs/CERT-PROBE',
    'paypal-transmission-id','probe-transmission-id',
    'paypal-transmission-time','2026-09-14T20:00:00Z',
    'paypal-transmission-sig','PROBE-NOT-A-REAL-SIGNATURE'),
  body := jsonb_build_object('id','PROBE-CONFIG-2','event_type','PROBE.CONFIG.CHECK')
);;
