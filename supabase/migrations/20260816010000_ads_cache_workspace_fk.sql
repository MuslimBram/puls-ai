-- supabase/migrations/20260816010000_ads_cache_workspace_fk.sql
-- ============================================================
-- PULSE AI — ADS CACHE WORKSPACE FOREIGN KEY HARDENING
--
-- Ensures meta_ads_cache and google_ads_cache workspace_id columns
-- reference real public.workspaces(id) with ON DELETE CASCADE.
-- ============================================================

DO $$
BEGIN
  -- 1. meta_ads_cache foreign key to public.workspaces(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'meta_ads_cache_workspace_id_fkey'
      AND table_name = 'meta_ads_cache'
  ) THEN
    ALTER TABLE public.meta_ads_cache
      ADD CONSTRAINT meta_ads_cache_workspace_id_fkey
      FOREIGN KEY (workspace_id)
      REFERENCES public.workspaces(id)
      ON DELETE CASCADE;
  END IF;

  -- 2. google_ads_cache foreign key to public.workspaces(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'google_ads_cache_workspace_id_fkey'
      AND table_name = 'google_ads_cache'
  ) THEN
    ALTER TABLE public.google_ads_cache
      ADD CONSTRAINT google_ads_cache_workspace_id_fkey
      FOREIGN KEY (workspace_id)
      REFERENCES public.workspaces(id)
      ON DELETE CASCADE;
  END IF;
END $$;
