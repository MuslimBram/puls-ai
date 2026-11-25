-- Liveness probe for enforce-limits v52. No entitlement is granted or changed:
-- the token is not a user JWT, so auth.getUser fails and the function returns
-- its error path. Proves the new bundle boots and the auth branch executes.
select net.http_post(
  url := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/enforce-limits',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'apikey','sb_publishable_IH0_qSl7VMpxABPOusDeCw_1CwUB4DJ',
    'Authorization','Bearer sb_publishable_IH0_qSl7VMpxABPOusDeCw_1CwUB4DJ'),
  body := jsonb_build_object('action','check','resource','channels')
);;
