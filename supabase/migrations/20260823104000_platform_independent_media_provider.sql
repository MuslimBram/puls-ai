-- Platform-independent image provider transition.
-- Additive only: preserve historical attribution while moving ACTIVE image work
-- to the existing Replicate credential/runtime infrastructure.

BEGIN;

-- Retire the previously seeded image provider by its legacy model signature.
-- Keep its provider_key and historical usage rows intact for audit/history, but
-- remove all active secret/config capability so it cannot be selected again.
UPDATE public.media_provider_settings
SET
  provider_name = 'Legacy Image Provider (Retired)',
  is_enabled = false,
  api_secret_name = NULL,
  config = jsonb_build_object('retired', true),
  priority = 999,
  updated_at = now()
WHERE media_types @> ARRAY['image']::text[]
  AND config->>'model' = 'google/gemini-3.1-flash-image-preview';

-- Canonical active image provider.
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

-- Remap only non-terminal image generations. Completed/failed history keeps the
-- provider attribution that was true when those rows were produced.
UPDATE public.media_generations
SET
  provider_key = 'replicate-image',
  updated_at = now()
WHERE media_type = 'image'
  AND status NOT IN ('completed', 'failed');

-- Isolate image jobs from the legacy non-media/video core. The core only reads
-- pending/retry. The new job-worker orchestrator owns media_pending/media_retry.
UPDATE public.job_queue
SET
  job_payload = jsonb_set(
    COALESCE(job_payload, '{}'::jsonb),
    '{provider_key}',
    to_jsonb('replicate-image'::text),
    true
  ),
  status = CASE
    WHEN status = 'retry' THEN 'media_retry'
    ELSE 'media_pending'
  END,
  locked_by = NULL,
  locked_at = NULL,
  next_retry_at = CASE
    WHEN status = 'retry' THEN next_retry_at
    ELSE NULL
  END,
  error_message = NULL
WHERE job_type = 'media_generation'
  AND COALESCE(job_payload->>'media_type', '') = 'image'
  AND status IN ('pending', 'retry', 'processing');

-- Permanent queue invariant. The core worker contains the preserved historical
-- handler implementation but may only claim pending/retry. Any current or future
-- image job that is inserted/recovered as pending/retry is normalized before the
-- row is visible to worker selection, including stale-lock recovery writes.
CREATE OR REPLACE FUNCTION public.normalize_image_media_job_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.job_type = 'media_generation'
     AND COALESCE(NEW.job_payload->>'media_type', '') = 'image' THEN
    NEW.job_payload := jsonb_set(
      COALESCE(NEW.job_payload, '{}'::jsonb),
      '{provider_key}',
      to_jsonb('replicate-image'::text),
      true
    );

    IF NEW.status = 'pending' THEN
      NEW.status := 'media_pending';
    ELSIF NEW.status = 'retry' THEN
      NEW.status := 'media_retry';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_normalize_image_media_job_status ON public.job_queue;
CREATE TRIGGER trg_normalize_image_media_job_status
BEFORE INSERT OR UPDATE OF status, job_type, job_payload
ON public.job_queue
FOR EACH ROW
EXECUTE FUNCTION public.normalize_image_media_job_status();

-- Efficient lookup for the dedicated image queue without changing existing
-- pending/retry indexes used by the core worker.
CREATE INDEX IF NOT EXISTS idx_job_queue_media_image
  ON public.job_queue(status, priority DESC, scheduled_for, next_retry_at)
  WHERE job_type = 'media_generation'
    AND status IN ('media_pending', 'media_retry');

COMMIT;
