-- Migration: 20260816212500_lead_scores_unique_constraint.sql
-- Ensures UNIQUE constraint on public.lead_scores(lead_id) for runtime-safe UPSERT operations

DO $$
DECLARE
  v_dup_count integer;
BEGIN
  -- 1. Preflight check: Ensure zero duplicate lead_id groups exist before adding constraint
  SELECT COUNT(*)
  INTO v_dup_count
  FROM (
    SELECT lead_id
    FROM public.lead_scores
    WHERE lead_id IS NOT NULL
    GROUP BY lead_id
    HAVING COUNT(*) > 1
  ) d;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Preflight check failed: % duplicate lead_id groups found in public.lead_scores', v_dup_count;
  END IF;

  -- 2. Guarded ADD CONSTRAINT with explicit relation check conrelid = 'public.lead_scores'::regclass
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_scores_lead_id_key'
      AND conrelid = 'public.lead_scores'::regclass
  ) THEN
    ALTER TABLE public.lead_scores ADD CONSTRAINT lead_scores_lead_id_key UNIQUE (lead_id);
  END IF;
END $$;
