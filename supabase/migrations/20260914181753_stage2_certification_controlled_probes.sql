-- HAPI 4 STAGE 2 CERTIFICATION — controlled probe rows, data only.
-- Workspace: 1c6b54a1-5a01-4f69-9145-6bf3235d1f23 (controlled certification ws).
-- No real customer is contacted by any of these:
--   T1 website_chat  -> reply is stored, no provider exists for this channel
--   T2 telegram, channel_id NULL      -> must be skipped by the C-1 guard
--   T3 telegram, channel_id = YOUTUBE -> internal dispatch must reject on type
--   T4 telegram, channel_id of ANOTHER workspace -> tenant isolation must reject
--   T5 youtube (unsupported type)     -> trigger must not enqueue at all
-- Every row is tagged metadata.hapi4_stage2_certification = true.

insert into public.inbox_messages
  (id, user_id, workspace_id, channel_id, channel_type, provider_message_id,
   source_name, sender_name, sender_identifier, message_content, message_timestamp,
   direction, is_unread, status, metadata)
values
  ('c0000001-0000-4000-8000-000000000001',
   'd87c4aa5-aadf-4510-93a9-e4cd9fc4895b',
   '1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
   null, 'website_chat', 'cert-t1-website-chat',
   'Website chat', 'Certification Visitor', 'cert-visitor-1',
   'Hi, what does Pulse AI actually do and how do I get started?',
   now(), 'inbound', true, 'new',
   '{"hapi4_stage2_certification": true, "probe": "T1_website_chat_happy_path"}'::jsonb),

  ('c0000002-0000-4000-8000-000000000002',
   'd87c4aa5-aadf-4510-93a9-e4cd9fc4895b',
   '1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
   null, 'telegram', 'cert-t2-null-channel',
   'Telegram', 'Certification Probe T2', 'telegram:999000111',
   'C-1 probe: provider channel with a NULL channel_id must be skipped.',
   now(), 'inbound', true, 'new',
   '{"hapi4_stage2_certification": true, "probe": "T2_c1_null_channel_id"}'::jsonb),

  ('c0000003-0000-4000-8000-000000000003',
   'd87c4aa5-aadf-4510-93a9-e4cd9fc4895b',
   '1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
   'fb2c6f13-9b02-417b-bbae-2af6866877ac', 'telegram', 'cert-t3-type-mismatch',
   'Telegram', 'Certification Probe T3', 'telegram:999000222',
   'Internal dispatch probe: the channel row is a youtube channel, not telegram.',
   now(), 'inbound', true, 'new',
   '{"hapi4_stage2_certification": true, "probe": "T3_channel_type_mismatch"}'::jsonb),

  ('c0000004-0000-4000-8000-000000000004',
   'd87c4aa5-aadf-4510-93a9-e4cd9fc4895b',
   '1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
   'ef15c0e6-4b85-4ada-8a54-789cd68416f8', 'telegram', 'cert-t4-cross-workspace',
   'Telegram', 'Certification Probe T4', 'telegram:999000333',
   'Tenant isolation probe: this channel belongs to a different workspace.',
   now(), 'inbound', true, 'new',
   '{"hapi4_stage2_certification": true, "probe": "T4_cross_workspace_channel"}'::jsonb),

  ('c0000005-0000-4000-8000-000000000005',
   'd87c4aa5-aadf-4510-93a9-e4cd9fc4895b',
   '1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
   'fb2c6f13-9b02-417b-bbae-2af6866877ac', 'youtube', 'cert-t5-unsupported-type',
   'YouTube', 'Certification Probe T5', 'youtube:999000444',
   'Unsupported channel type: the trigger must not enqueue a job at all.',
   now(), 'inbound', true, 'new',
   '{"hapi4_stage2_certification": true, "probe": "T5_unsupported_channel_type"}'::jsonb);

-- Duplicate-enqueue probe: a second job for an inbox message that already has one
-- must be absorbed by the UNIQUE constraint, not create a second reply.
insert into public.ai_reply_jobs
  (inbox_message_id, workspace_id, user_id, channel_id, channel_type, thread_id)
values
  ('c0000001-0000-4000-8000-000000000001',
   '1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
   'd87c4aa5-aadf-4510-93a9-e4cd9fc4895b',
   null, 'website_chat', null)
on conflict (inbox_message_id) do nothing;;
