-- Platform-independent image provider transition.
-- Additive only: preserve migration history while moving active image generation
-- to the existing Replicate credential/runtime infrastructure.

BEGIN;

-- Neutralize the previously seeded image provider by its legacy model signature,
-- without depending on its historical provider name/key.
WITH retired_provider AS (
  SELECT provider_key
  FROM public.media_provider_settings
  WHERE media_types @> ARRAY['image']::text[]
    AND config->>'model' = 'google/gemini-3.1-flash-image-preview'
)
UPDATE public.media_generations AS generation
SET provider_key = 'legacy-image-retired'
FROM retired_provider
WHERE generation.provider_key = retired_provider.provider_key;

WITH retired_provider AS (
  SELECT provider_key
  FROM public.media_provider_settings
  WHERE media_types @> ARRAY['image']::text[]
    AND config->>'model' = 'google/gemini-3.1-flash-image-preview'
)
UPDATE public.media_usage_events AS event
SET provider_key = 'legacy-image-retired'
FROM retired_provider
WHERE event.provider_key = retired_provider.provider_key;

WITH retired_provider AS (
  SELECT provider_key
  FROM public.media_provider_settings
  WHERE media_types @> ARRAY['image']::text[]
    AND config->>'model' = 'google/gemini-3.1-flash-image-preview'
)
UPDATE public.media_generation_errors AS error_row
SET provider_key = 'legacy-image-retired'
FROM retired_provider
WHERE error_row.provider_key = retired_provider.provider_key;

UPDATE public.media_provider_settings
SET
  provider_key = 'legacy-image-retired',
  provider_name = 'Legacy Image Provider (Retired)',
  is_enabled = false,
  api_secret_name = NULL,
  config = jsonb_build_object('retired', true),
  priority = 999,
  updated_at = now()
WHERE media_types @> ARRAY['image']::text[]
  AND config->>'model' = 'google/gemini-3.1-flash-image-preview';

INSERT INTO public.media_provider_settings (
  provider_key,
  provider_name,
  media_types,
  is_enabled,
  is_mock,
  api_secret_name,
  config,
  priority
)
VALUES (
  'replicate-image',
  'Replicate Image',
  ARRAY['image'],
  true,
  false,
  'REPLICATE_API_TOKEN',
  jsonb_build_object(
    'adapter', 'replicate-image',
    'model', 'black-forest-labs/flux-schnell',
    'prompt_field', 'prompt',
    'input_defaults', '{}'::jsonb,
    'prediction_options', '{}'::jsonb
  ),
  0
)
ON CONFLICT (provider_key) DO UPDATE SET
  provider_name = EXCLUDED.provider_name,
  media_types = EXCLUDED.media_types,
  is_enabled = EXCLUDED.is_enabled,
  is_mock = EXCLUDED.is_mock,
  api_secret_name = EXCLUDED.api_secret_name,
  config = EXCLUDED.config,
  priority = EXCLUDED.priority,
  updated_at = now();

COMMIT;
