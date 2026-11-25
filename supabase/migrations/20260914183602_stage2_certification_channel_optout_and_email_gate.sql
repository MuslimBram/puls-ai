-- HAPI 4 STAGE 2 — two remaining gaps closed.
--
-- (a) Per-channel opt-out has never existed as DATA in production. Set it on the
--     controlled workspace's Telegram channel and prove the eligibility gate
--     honours it. This is restored to its previous shape immediately after.
update public.channels
   set settings = coalesce(settings,'{}'::jsonb) || '{"ai_auto_reply_enabled": false}'::jsonb,
       updated_at = now()
 where id = '087a1f2d-7d2b-4aaf-8c70-322838ae0c54'
   and workspace_id = '1c6b54a1-5a01-4f69-9145-6bf3235d1f23';

insert into public.inbox_messages
  (id, user_id, workspace_id, channel_id, channel_type, provider_message_id,
   source_name, sender_name, sender_identifier, message_content, message_timestamp,
   direction, is_unread, status, metadata)
values
  ('c0000008-0000-4000-8000-000000000008',
   'd87c4aa5-aadf-4510-93a9-e4cd9fc4895b',
   '1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
   '087a1f2d-7d2b-4aaf-8c70-322838ae0c54', 'telegram', 'cert-t8-channel-optout',
   'Telegram', 'Certification Probe T8', 'telegram:999000666',
   'Per-channel opt-out probe: this channel has ai_auto_reply_enabled=false and must be skipped.',
   now(), 'inbound', true, 'new',
   '{"hapi4_stage2_certification": true, "probe": "T8_channel_auto_reply_disabled"}'::jsonb);

-- (b) send-email is the one Stage 1 function with no runtime invocation. Its
--     internal gate can be proven without touching the email workspace at all:
--     a wrong internal secret must be refused before anything else happens.
select net.http_post(
  url := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/send-email',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'apikey','sb_publishable_IH0_qSl7VMpxABPOusDeCw_1CwUB4DJ',
    'Authorization','Bearer sb_publishable_IH0_qSl7VMpxABPOusDeCw_1CwUB4DJ',
    'x-internal-secret','WRONG-SECRET-hapi4-stage2-negative-probe'),
  body := jsonb_build_object(
    'to','certification-probe@example.invalid',
    'subject','negative probe',
    'body','negative probe - must never be delivered',
    'workspace_id','1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
    'dispatch_id', gen_random_uuid()::text)
);;
