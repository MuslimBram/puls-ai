INSERT INTO public.channel_registry (id, name, category, description, is_available, icon, integration_status, setup_instructions, credential_fields, min_plan, help_url, config_schema)
VALUES
  (
    'discord',
    'Discord',
    'social',
    'Post announcements and updates to a Discord server channel via webhook.',
    true,
    'MessageSquare',
    'live',
    'In Discord: Server Settings → Integrations → Webhooks → New Webhook. Copy the webhook URL and paste below.',
    '[{"key":"webhook_url","label":"Webhook URL","type":"password","placeholder":"https://discord.com/api/webhooks/...","required":true},{"key":"username","label":"Bot Display Name (optional)","type":"text","required":false}]'::jsonb,
    'standard',
    'https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks',
    '{}'::jsonb
  ),
  (
    'slack',
    'Slack',
    'social',
    'Send messages to a Slack channel via incoming webhook.',
    true,
    'Hash',
    'live',
    'In Slack: api.slack.com/apps → Create New App → Incoming Webhooks → Add New Webhook to Workspace. Copy the URL.',
    '[{"key":"webhook_url","label":"Incoming Webhook URL","type":"password","placeholder":"https://hooks.slack.com/services/...","required":true}]'::jsonb,
    'standard',
    'https://api.slack.com/messaging/webhooks',
    '{}'::jsonb
  ),
  (
    'bluesky',
    'Bluesky',
    'social',
    'Publish posts to your Bluesky account via the AT Protocol.',
    true,
    'Cloud',
    'live',
    'In Bluesky: Settings → App Passwords → Add App Password. Use your handle (e.g. you.bsky.social) and the generated app password.',
    '[{"key":"handle","label":"Handle","type":"text","placeholder":"you.bsky.social","required":true},{"key":"app_password","label":"App Password","type":"password","placeholder":"xxxx-xxxx-xxxx-xxxx","required":true}]'::jsonb,
    'standard',
    'https://bsky.app/settings/app-passwords',
    '{}'::jsonb
  ),
  (
    'mastodon',
    'Mastodon',
    'social',
    'Publish toots to any Mastodon instance via access token.',
    true,
    'Globe',
    'live',
    'On your Mastodon instance: Preferences → Development → New Application. Grant write:statuses scope and copy the access token.',
    '[{"key":"instance_url","label":"Instance URL","type":"text","placeholder":"https://mastodon.social","required":true},{"key":"access_token","label":"Access Token","type":"password","required":true}]'::jsonb,
    'standard',
    'https://docs.joinmastodon.org/client/token/',
    '{}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_available = EXCLUDED.is_available,
  icon = EXCLUDED.icon,
  integration_status = EXCLUDED.integration_status,
  setup_instructions = EXCLUDED.setup_instructions,
  credential_fields = EXCLUDED.credential_fields,
  min_plan = EXCLUDED.min_plan,
  help_url = EXCLUDED.help_url;