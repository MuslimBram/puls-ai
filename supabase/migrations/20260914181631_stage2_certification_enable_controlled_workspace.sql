-- HAPI 4 STAGE 2 CERTIFICATION — data-only, reversible.
-- Enables auto-reply for the CONTROLLED certification workspace only:
--   1c6b54a1-5a01-4f69-9145-6bf3235d1f23  ("Muslim Brami", 0 business_profiles)
-- The email workspace e1aedb0f-... is deliberately NOT touched.
-- Applied via apply_migration because the MCP sql channel is read-only; this is
-- the only write path available. No schema object is created or altered.
insert into public.ai_agent_configs
  (workspace_id, agent_name, agent_tone, language,
   custom_instructions, business_description, auto_reply_enabled)
values
  ('1c6b54a1-5a01-4f69-9145-6bf3235d1f23',
   'Pulse AI',
   'professional',
   'en',
   'HAPI 4 STAGE 2 CERTIFICATION CONFIG. Controlled certification workspace only.',
   'Pulse AI is a business operating system for small businesses: multi-channel inbox, AI replies, lead capture and automation.',
   true)
on conflict (workspace_id) do update
  set auto_reply_enabled = true, updated_at = now();;
