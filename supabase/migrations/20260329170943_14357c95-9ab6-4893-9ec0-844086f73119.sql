-- Add missing columns to integration_event_logs for custom channel support
ALTER TABLE public.integration_event_logs
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS adapter_key text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Unique index for dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_event_logs_idempotency
  ON public.integration_event_logs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Index for adapter_key lookups
CREATE INDEX IF NOT EXISTS idx_integration_event_logs_adapter_key
  ON public.integration_event_logs (adapter_key)
  WHERE adapter_key IS NOT NULL;