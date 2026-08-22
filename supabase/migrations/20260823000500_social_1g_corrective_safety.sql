-- SOCIAL-1G corrective safety patch
--
-- This migration is additive because 20260822200000_social_1g_aggregate_attribution.sql
-- is already merged into canonical main.
--
-- Safety invariants:
--   1. canonical_person_id is legal only for identity_state='known_person'.
--   2. New DIRECT_EVIDENCE_BACKED rows are blocked until a canonical,
--      independently traceable outcome↔social-evidence linkage contract exists.
--
-- NOT VALID intentionally avoids rewriting/invalidating historical rows while
-- still enforcing each CHECK for all new/updated rows in PostgreSQL.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_social_1g_identity_person_consistency'
      AND conrelid = 'public.social_1g_attribution_record'::regclass
  ) THEN
    ALTER TABLE public.social_1g_attribution_record
      ADD CONSTRAINT chk_social_1g_identity_person_consistency
      CHECK (
        social_canonical_person_id IS NULL
        OR identity_state = 'known_person'
      ) NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_social_1g_no_unverified_direct_attribution'
      AND conrelid = 'public.social_1g_attribution_record'::regclass
  ) THEN
    ALTER TABLE public.social_1g_attribution_record
      ADD CONSTRAINT chk_social_1g_no_unverified_direct_attribution
      CHECK (attribution_method <> 'DIRECT_EVIDENCE_BACKED') NOT VALID;
  END IF;
END;
$$;

COMMENT ON CONSTRAINT chk_social_1g_identity_person_consistency
  ON public.social_1g_attribution_record IS
  'SOCIAL-1G: canonical person IDs are permitted only for upstream-resolved known_person identities.';

COMMENT ON CONSTRAINT chk_social_1g_no_unverified_direct_attribution
  ON public.social_1g_attribution_record IS
  'SOCIAL-1G corrective gate: DIRECT_EVIDENCE_BACKED is disabled for new rows until an independent canonical outcome-to-social-evidence linkage contract is implemented.';
