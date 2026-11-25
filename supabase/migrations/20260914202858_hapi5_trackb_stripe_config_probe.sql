-- READ-ONLY EVIDENCE PROBE (Track B / Stripe config).
-- Fires one POST at the live stripe-webhook endpoint with no stripe-signature
-- header. The function's own fail-closed branches distinguish three distinct
-- configuration states without reading any secret:
--   500 "Missing STRIPE_SECRET_KEY"        -> STRIPE_SECRET_KEY absent
--   503 {"error":"Webhook secret not ..."} -> key present, STRIPE_WEBHOOK_SECRET absent
--   400 "Missing stripe-signature"         -> both secrets configured
-- A 401 from the gateway would instead prove verify_jwt is ON.
-- No production row is read or written by this probe.
select net.http_post(
  url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/stripe-webhook',
  headers := jsonb_build_object('Content-Type','application/json'),
  body    := jsonb_build_object('probe','trackb-stripe-config')
) as stripe_probe_id;;
