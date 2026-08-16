-- supabase/migrations/20260816020000_calcom_channel_registry.sql
-- ============================================================
-- PULSE AI — CAL.COM CHANNEL REGISTRY SEED MIGRATION (PHASE C2)
--
-- Registers Cal.com in public.channel_registry table.
-- ============================================================

INSERT INTO public.channel_registry (id, name, category, description, connection_fields, help_url, is_active)
VALUES (
  'calcom',
  'Cal.com',
  'calendar',
  'Cal.com scheduling, appointment booking, and availability sync via API v2',
  '[{"key":"api_key","label":"API Key (or OAuth)","type":"password","required":true}]'::jsonb,
  'https://cal.com/docs/api-reference/v2',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  connection_fields = EXCLUDED.connection_fields,
  help_url = EXCLUDED.help_url,
  is_active = true;
