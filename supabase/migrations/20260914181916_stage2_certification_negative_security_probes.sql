-- HAPI 4 STAGE 2 — negative security probes. No provider is contacted and no
-- message can be sent by any of these: each is expected to be rejected by an
-- authentication or validation gate before any side effect.
--
-- P1  inbound-ai-reply  + WRONG x-cron-secret        -> expect 403 Forbidden
-- P2  inbound-ai-reply  + NO auth header at all      -> expect 403 Forbidden
-- P3  send-telegram     + WRONG x-internal-secret    -> expect 403 INTERNAL_FORBIDDEN
-- P4  send-whatsapp     + WRONG x-internal-secret    -> expect 403 INTERNAL_FORBIDDEN
select net.http_post(
  url := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/inbound-ai-reply',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-cron-secret','WRONG-SECRET-hapi4-stage2-negative-probe'),
  body := jsonb_build_object('limit', 1)
);

select net.http_post(
  url := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/inbound-ai-reply',
  headers := jsonb_build_object('Content-Type','application/json'),
  body := jsonb_build_object('limit', 1)
);

select net.http_post(
  url := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/send-telegram',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'apikey','sb_publishable_IH0_qSl7VMpxABPOusDeCw_1CwUB4DJ',
    'Authorization','Bearer sb_publishable_IH0_qSl7VMpxABPOusDeCw_1CwUB4DJ',
    'x-internal-secret','WRONG-SECRET-hapi4-stage2-negative-probe'),
  body := jsonb_build_object(
    'chat_id','999000999',
    'message','negative probe - must never be delivered',
    'workspace_id','1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
    'dispatch_id', gen_random_uuid()::text)
);

select net.http_post(
  url := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/send-whatsapp',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'apikey','sb_publishable_IH0_qSl7VMpxABPOusDeCw_1CwUB4DJ',
    'Authorization','Bearer sb_publishable_IH0_qSl7VMpxABPOusDeCw_1CwUB4DJ',
    'x-internal-secret','WRONG-SECRET-hapi4-stage2-negative-probe'),
  body := jsonb_build_object(
    'to','000000000000',
    'message','negative probe - must never be delivered',
    'workspace_id','1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
    'dispatch_id', gen_random_uuid()::text)
);;
