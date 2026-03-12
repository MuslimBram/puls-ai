
ALTER TABLE public.channel_registry ADD COLUMN IF NOT EXISTS integration_status text NOT NULL DEFAULT 'coming_soon';
ALTER TABLE public.channel_registry ADD COLUMN IF NOT EXISTS setup_instructions text;
ALTER TABLE public.channel_registry ADD COLUMN IF NOT EXISTS credential_fields jsonb DEFAULT '[]'::jsonb;
