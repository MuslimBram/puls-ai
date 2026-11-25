
-- integration_event_logs.integration_id currently FKs to external_integrations.
-- Builder adapter events use unified_connections, not external_integrations.
-- Decouple: drop the FK + make nullable so integration_event_logs can serve
-- as a generic event log for any integration type.
-- The unified_connections.id is stored in metadata.connection_id for traceability.

ALTER TABLE public.integration_event_logs
  DROP CONSTRAINT IF EXISTS integration_event_logs_integration_id_fkey;

ALTER TABLE public.integration_event_logs
  ALTER COLUMN integration_id DROP NOT NULL;

-- Add index on adapter_key + idempotency_key for builder adapter queries
CREATE INDEX IF NOT EXISTS idx_iel_adapter_idempotency
  ON public.integration_event_logs (adapter_key, idempotency_key)
  WHERE adapter_key IS NOT NULL AND idempotency_key IS NOT NULL;

-- Verify
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='integration_event_logs' AND column_name='integration_id';
;
