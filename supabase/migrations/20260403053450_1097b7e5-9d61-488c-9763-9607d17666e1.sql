
-- Add connection framework columns to channels table
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS connection_mode text NOT NULL DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add capability definitions to channel_registry
ALTER TABLE public.channel_registry
  ADD COLUMN IF NOT EXISTS supported_modes jsonb NOT NULL DEFAULT '["professional"]'::jsonb,
  ADD COLUMN IF NOT EXISTS professional_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS personal_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Update channel_registry with capabilities per channel type
UPDATE public.channel_registry SET
  supported_modes = '["professional", "personal"]',
  professional_capabilities = '["auto_post", "messaging", "comments", "analytics", "notifications", "inbox"]',
  personal_capabilities = '["manual_post", "notifications"]'
WHERE id = 'instagram';

UPDATE public.channel_registry SET
  supported_modes = '["professional", "personal"]',
  professional_capabilities = '["auto_post", "messaging", "comments", "analytics", "notifications", "inbox"]',
  personal_capabilities = '["manual_post", "notifications"]'
WHERE id = 'facebook';

UPDATE public.channel_registry SET
  supported_modes = '["professional", "personal"]',
  professional_capabilities = '["auto_post", "analytics", "notifications"]',
  personal_capabilities = '["manual_post", "notifications"]'
WHERE id = 'tiktok';

UPDATE public.channel_registry SET
  supported_modes = '["professional", "personal"]',
  professional_capabilities = '["auto_post", "analytics", "notifications"]',
  personal_capabilities = '["manual_post", "notifications"]'
WHERE id = 'twitter';

UPDATE public.channel_registry SET
  supported_modes = '["professional", "personal"]',
  professional_capabilities = '["auto_post", "analytics", "notifications"]',
  personal_capabilities = '["manual_post", "notifications"]'
WHERE id = 'linkedin';

UPDATE public.channel_registry SET
  supported_modes = '["professional", "personal"]',
  professional_capabilities = '["auto_post", "analytics", "comments", "notifications"]',
  personal_capabilities = '["manual_post", "notifications"]'
WHERE id = 'youtube';

UPDATE public.channel_registry SET
  supported_modes = '["professional"]',
  professional_capabilities = '["auto_post", "messaging", "analytics", "notifications", "inbox"]',
  personal_capabilities = '[]'
WHERE id = 'telegram';

UPDATE public.channel_registry SET
  supported_modes = '["professional"]',
  professional_capabilities = '["messaging", "notifications", "inbox"]',
  personal_capabilities = '[]'
WHERE id = 'whatsapp';

UPDATE public.channel_registry SET
  supported_modes = '["professional"]',
  professional_capabilities = '["auto_post", "messaging", "notifications", "inbox"]',
  personal_capabilities = '[]'
WHERE id = 'email';

-- For any channel_registry rows not explicitly updated, set defaults
UPDATE public.channel_registry SET
  supported_modes = '["professional"]',
  professional_capabilities = '["messaging", "notifications"]',
  personal_capabilities = '[]'
WHERE supported_modes = '["professional"]'
  AND professional_capabilities = '[]'
  AND id NOT IN ('instagram','facebook','tiktok','twitter','linkedin','youtube','telegram','whatsapp','email');

-- Create index for quick capability lookups
CREATE INDEX IF NOT EXISTS idx_channels_connection_mode ON public.channels (connection_mode);
CREATE INDEX IF NOT EXISTS idx_channels_capabilities ON public.channels USING gin (capabilities);
