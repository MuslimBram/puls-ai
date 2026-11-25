-- HAPI 4 STAGE 2 — provider-path probes on the CONNECTED channels of the
-- controlled workspace. These exercise the complete outbound stack:
--   orchestrator -> ai-router -> send-* (internal secret, claim, credential
--   decrypt) -> real provider API.
-- The recipients are deliberately non-existent, so the provider refuses the
-- message and NO human is ever contacted:
--   T6 telegram chat_id 999000555   (no such chat for this bot)
--   T7 whatsapp  to 000000000000    (not a routable MSISDN)
insert into public.inbox_messages
  (id, user_id, workspace_id, channel_id, channel_type, provider_message_id,
   source_name, sender_name, sender_identifier, message_content, message_timestamp,
   direction, is_unread, status, metadata)
values
  ('c0000006-0000-4000-8000-000000000006',
   'd87c4aa5-aadf-4510-93a9-e4cd9fc4895b',
   '1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
   '087a1f2d-7d2b-4aaf-8c70-322838ae0c54', 'telegram', 'cert-t6-telegram-provider',
   'Telegram', 'Certification Probe T6', 'telegram:999000555',
   'Provider path probe for Telegram. The chat id does not exist, so delivery must fail at the provider.',
   now(), 'inbound', true, 'new',
   '{"hapi4_stage2_certification": true, "probe": "T6_telegram_provider_path"}'::jsonb),

  ('c0000007-0000-4000-8000-000000000007',
   'd87c4aa5-aadf-4510-93a9-e4cd9fc4895b',
   '1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
   '0bb3ee0f-ccb7-4e0c-9319-1d93c6453b63', 'whatsapp', 'cert-t7-whatsapp-provider',
   'WhatsApp', 'Certification Probe T7', '000000000000',
   'Provider path probe for WhatsApp. The number is not routable, so delivery must fail at the provider.',
   now(), 'inbound', true, 'new',
   '{"hapi4_stage2_certification": true, "probe": "T7_whatsapp_provider_path"}'::jsonb);;
