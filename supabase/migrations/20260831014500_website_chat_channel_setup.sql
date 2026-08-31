begin;

-- Website Chat existed in the original channel registry but was later lost while
-- the registry evolved to capability/mode-based metadata. Restore the canonical
-- provider now that P0.6 supplies a tenant-bound public proxy + internal ingest
-- firewall. No browser secret is required for this channel.
insert into public.channel_registry (
  id,
  name,
  category,
  description,
  is_available,
  icon,
  config_schema,
  integration_status,
  setup_instructions,
  credential_fields,
  min_plan,
  help_url,
  supported_modes,
  professional_capabilities,
  personal_capabilities,
  account_type_label
)
values (
  'website_chat',
  'Website Chat',
  'web',
  'Secure embeddable website chat that sends inbound messages through the universal content-security firewall before Inbox processing.',
  true,
  'MessageSquare',
  '{}'::jsonb,
  'live',
  'Choose the exact website origin(s), save the channel, then install the generated Pulse AI widget snippet before </body>.',
  '[]'::jsonb,
  'standard',
  null,
  '["professional"]'::jsonb,
  '["messaging","inbox","notifications"]'::jsonb,
  '[]'::jsonb,
  'Website'
)
on conflict (id) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    is_available = excluded.is_available,
    icon = excluded.icon,
    config_schema = excluded.config_schema,
    integration_status = excluded.integration_status,
    setup_instructions = excluded.setup_instructions,
    credential_fields = excluded.credential_fields,
    min_plan = excluded.min_plan,
    help_url = excluded.help_url,
    supported_modes = excluded.supported_modes,
    professional_capabilities = excluded.professional_capabilities,
    personal_capabilities = excluded.personal_capabilities,
    account_type_label = excluded.account_type_label;

commit;
