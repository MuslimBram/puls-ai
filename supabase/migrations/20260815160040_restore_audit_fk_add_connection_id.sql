
-- ── STEP 1: Delete the 3 Phase 2B test rows (all builder rows, integration_id=NULL) ──
DELETE FROM integration_event_logs WHERE adapter_key IS NOT NULL;

-- ── STEP 2: Restore FK on integration_id → external_integrations.id ──────────────
-- NULL values pass FK checks on nullable columns, so builder events (integration_id=NULL) are unaffected.
ALTER TABLE public.integration_event_logs
  ADD CONSTRAINT integration_event_logs_integration_id_fkey
  FOREIGN KEY (integration_id) REFERENCES public.external_integrations(id) ON DELETE SET NULL;

-- ── STEP 3: Add connection_id → unified_connections.id ────────────────────────────
-- Builder adapter events use this column; external_integrations events leave it NULL.
ALTER TABLE public.integration_event_logs
  ADD COLUMN IF NOT EXISTS connection_id uuid NULL
    REFERENCES public.unified_connections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_iel_connection_id
  ON public.integration_event_logs (connection_id)
  WHERE connection_id IS NOT NULL;

-- ── VERIFY ────────────────────────────────────────────────────────────────────────
SELECT
  col.column_name,
  col.is_nullable,
  fk.conname  AS fk_name,
  fk_ref.relname AS fk_target_table
FROM information_schema.columns col
LEFT JOIN pg_attribute  pa  ON pa.attrelid = 'public.integration_event_logs'::regclass
                             AND pa.attname = col.column_name
LEFT JOIN pg_constraint fk  ON fk.conrelid = 'public.integration_event_logs'::regclass
                             AND fk.contype = 'f'
                             AND pa.attnum = ANY(fk.conkey)
LEFT JOIN pg_class     fk_ref ON fk_ref.oid = fk.confrelid
WHERE col.table_schema = 'public'
  AND col.table_name   = 'integration_event_logs'
  AND col.column_name  IN ('integration_id', 'connection_id')
ORDER BY col.column_name;
;
