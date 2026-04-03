
-- Add missing columns to channels table (skip if they already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='channels' AND column_name='reconnect_required') THEN
    ALTER TABLE public.channels ADD COLUMN reconnect_required boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='channels' AND column_name='is_primary') THEN
    ALTER TABLE public.channels ADD COLUMN is_primary boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='channels' AND column_name='connection_mode') THEN
    ALTER TABLE public.channels ADD COLUMN connection_mode text NOT NULL DEFAULT 'professional';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='channels' AND column_name='account_type') THEN
    ALTER TABLE public.channels ADD COLUMN account_type text NOT NULL DEFAULT 'unknown';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='channels' AND column_name='capabilities') THEN
    ALTER TABLE public.channels ADD COLUMN capabilities jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='channels' AND column_name='provider_metadata') THEN
    ALTER TABLE public.channels ADD COLUMN provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add index for fast lookup of primary channels
CREATE INDEX IF NOT EXISTS idx_channels_primary ON public.channels (user_id, channel_type, is_primary) WHERE is_primary = true;

-- Update channel_registry: add supported_modes and capability columns if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='channel_registry' AND column_name='supported_modes') THEN
    ALTER TABLE public.channel_registry ADD COLUMN supported_modes jsonb NOT NULL DEFAULT '["professional"]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='channel_registry' AND column_name='professional_capabilities') THEN
    ALTER TABLE public.channel_registry ADD COLUMN professional_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='channel_registry' AND column_name='personal_capabilities') THEN
    ALTER TABLE public.channel_registry ADD COLUMN personal_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;
