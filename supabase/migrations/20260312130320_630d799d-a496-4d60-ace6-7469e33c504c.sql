
-- Add min_plan column to channel_registry
ALTER TABLE public.channel_registry ADD COLUMN IF NOT EXISTS min_plan text NOT NULL DEFAULT 'standard';

-- Update all coming_soon channels to setup_ready and assign plan requirements
UPDATE public.channel_registry SET integration_status = 'setup_ready', min_plan = 'professional',
  credential_fields = CASE
    WHEN id = 'whatsapp' THEN '[{"key":"phone_number_id","label":"Phone Number ID","type":"text","required":true},{"key":"access_token","label":"Access Token","type":"password","required":true},{"key":"business_account_id","label":"Business Account ID","type":"text","required":true}]'::jsonb
    WHEN id = 'instagram' THEN '[{"key":"access_token","label":"Access Token","type":"password","required":true},{"key":"instagram_business_id","label":"Business Account ID","type":"text","required":true}]'::jsonb
    WHEN id = 'facebook_page' THEN '[{"key":"page_id","label":"Page ID","type":"text","required":true},{"key":"page_access_token","label":"Page Access Token","type":"password","required":true}]'::jsonb
    WHEN id = 'messenger' THEN '[{"key":"page_id","label":"Page ID","type":"text","required":true},{"key":"page_access_token","label":"Page Access Token","type":"password","required":true}]'::jsonb
    WHEN id = 'linkedin' THEN '[{"key":"access_token","label":"Access Token","type":"password","required":true},{"key":"organization_id","label":"Organization ID","type":"text","required":true}]'::jsonb
    WHEN id = 'twitter' THEN '[{"key":"api_key","label":"API Key","type":"password","required":true},{"key":"api_secret","label":"API Secret","type":"password","required":true},{"key":"access_token","label":"Access Token","type":"password","required":true}]'::jsonb
    WHEN id = 'tiktok' THEN '[{"key":"access_token","label":"Access Token","type":"password","required":true},{"key":"open_id","label":"Open ID","type":"text","required":true}]'::jsonb
    WHEN id = 'youtube' THEN '[{"key":"api_key","label":"API Key","type":"password","required":true},{"key":"channel_id","label":"Channel ID","type":"text","required":true}]'::jsonb
    WHEN id = 'google_business' THEN '[{"key":"access_token","label":"Access Token","type":"password","required":true},{"key":"location_id","label":"Location ID","type":"text","required":true}]'::jsonb
    ELSE credential_fields
  END
WHERE integration_status = 'coming_soon'
  AND id IN ('whatsapp','instagram','facebook_page','messenger','linkedin','twitter','tiktok','youtube','google_business');

-- Set advanced-tier channels
UPDATE public.channel_registry SET integration_status = 'setup_ready', min_plan = 'advanced',
  credential_fields = CASE
    WHEN id = 'discord' THEN '[{"key":"bot_token","label":"Bot Token","type":"password","required":true},{"key":"guild_id","label":"Server ID","type":"text","required":true}]'::jsonb
    WHEN id = 'slack' THEN '[{"key":"bot_token","label":"Bot Token","type":"password","required":true},{"key":"signing_secret","label":"Signing Secret","type":"password","required":true}]'::jsonb
    WHEN id = 'sms' THEN '[{"key":"account_sid","label":"Account SID","type":"text","required":true},{"key":"auth_token","label":"Auth Token","type":"password","required":true},{"key":"phone_number","label":"Phone Number","type":"text","required":true}]'::jsonb
    WHEN id = 'viber' THEN '[{"key":"auth_token","label":"Auth Token","type":"password","required":true}]'::jsonb
    WHEN id = 'reddit' THEN '[{"key":"client_id","label":"Client ID","type":"text","required":true},{"key":"client_secret","label":"Client Secret","type":"password","required":true}]'::jsonb
    ELSE credential_fields
  END
WHERE integration_status = 'coming_soon'
  AND id IN ('discord','slack','sms','viber','reddit');

-- Also set remaining coming_soon to setup_ready with enterprise plan
UPDATE public.channel_registry SET integration_status = 'setup_ready', min_plan = 'enterprise'
WHERE integration_status = 'coming_soon';

-- Set live channels min_plan to standard
UPDATE public.channel_registry SET min_plan = 'standard' WHERE integration_status = 'live';

-- Set existing setup_ready channels that already had credential_fields
UPDATE public.channel_registry SET min_plan = 'professional' WHERE integration_status = 'setup_ready' AND min_plan = 'standard' AND id NOT IN ('telegram','email','website_chat','custom_webhook');
