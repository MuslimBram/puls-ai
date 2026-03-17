-- Phase 1: Link scan data directly to business profiles

-- 1) Add business linkage columns
ALTER TABLE public.scan_sources
ADD COLUMN IF NOT EXISTS business_id UUID;

ALTER TABLE public.source_scans
ADD COLUMN IF NOT EXISTS business_id UUID;

-- 2) Add foreign keys to business_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'scan_sources'
      AND constraint_name = 'scan_sources_business_id_fkey'
  ) THEN
    ALTER TABLE public.scan_sources
    ADD CONSTRAINT scan_sources_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES public.business_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'source_scans'
      AND constraint_name = 'source_scans_business_id_fkey'
  ) THEN
    ALTER TABLE public.source_scans
    ADD CONSTRAINT source_scans_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES public.business_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'scan_insights'
      AND constraint_name = 'scan_insights_business_id_fkey'
  ) THEN
    ALTER TABLE public.scan_insights
    ADD CONSTRAINT scan_insights_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES public.business_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3) Backfill scan_sources.business_id from matching business profile by workspace + URL
UPDATE public.scan_sources ss
SET business_id = bp.id
FROM public.business_profiles bp
WHERE ss.business_id IS NULL
  AND bp.workspace_id = ss.workspace_id
  AND (
    lower(trim(both '/' FROM regexp_replace(ss.url_or_identifier, '^https?://(www\.)?', '', 'i'))) =
    lower(trim(both '/' FROM regexp_replace(bp.business_name, '^https?://(www\.)?', '', 'i')))
    OR lower(ss.label) = lower(bp.business_name)
  );

-- 4) Backfill source_scans.business_id from scan_sources
UPDATE public.source_scans sc
SET business_id = ss.business_id
FROM public.scan_sources ss
WHERE sc.source_id = ss.id
  AND sc.business_id IS NULL
  AND ss.business_id IS NOT NULL;

-- 5) Backfill scan_insights.business_id from source_scans first, then scan_sources
UPDATE public.scan_insights si
SET business_id = sc.business_id
FROM public.source_scans sc
WHERE si.scan_id = sc.id
  AND si.business_id IS NULL
  AND sc.business_id IS NOT NULL;

UPDATE public.scan_insights si
SET business_id = ss.business_id
FROM public.scan_sources ss
WHERE si.source_id = ss.id
  AND si.business_id IS NULL
  AND ss.business_id IS NOT NULL;

-- 6) Indexes for business-scoped queries
CREATE INDEX IF NOT EXISTS idx_scan_sources_business_id ON public.scan_sources(business_id);
CREATE INDEX IF NOT EXISTS idx_source_scans_business_id ON public.source_scans(business_id);
CREATE INDEX IF NOT EXISTS idx_scan_insights_business_id ON public.scan_insights(business_id);
CREATE INDEX IF NOT EXISTS idx_source_scans_business_created_at ON public.source_scans(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_insights_business_created_at ON public.scan_insights(business_id, created_at DESC);

-- 7) Ensure scan_sources are unique per business + source
CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_sources_business_url_unique
ON public.scan_sources(business_id, url_or_identifier)
WHERE business_id IS NOT NULL;

-- 8) Enable RLS on source_scans if not already enabled
ALTER TABLE public.source_scans ENABLE ROW LEVEL SECURITY;

-- 9) Replace old owner-only policies with business/workspace aware policies
DROP POLICY IF EXISTS "Users can manage own scan_sources" ON public.scan_sources;
DROP POLICY IF EXISTS "Admins can view all scan_sources" ON public.scan_sources;
DROP POLICY IF EXISTS "Users can manage own source_scans" ON public.source_scans;
DROP POLICY IF EXISTS "Users can manage own scan_insights" ON public.scan_insights;

CREATE POLICY "Workspace members can view scan_sources"
ON public.scan_sources
FOR SELECT
TO authenticated
USING (
  is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace members can insert scan_sources"
ON public.scan_sources
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = user_id AND is_workspace_member(auth.uid(), workspace_id))
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace members can update scan_sources"
ON public.scan_sources
FOR UPDATE
TO authenticated
USING (
  is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
)
WITH CHECK (
  is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace members can delete scan_sources"
ON public.scan_sources
FOR DELETE
TO authenticated
USING (
  is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace members can view source_scans"
ON public.source_scans
FOR SELECT
TO authenticated
USING (
  is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace members can insert source_scans"
ON public.source_scans
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = user_id AND is_workspace_member(auth.uid(), workspace_id))
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace members can update source_scans"
ON public.source_scans
FOR UPDATE
TO authenticated
USING (
  is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
)
WITH CHECK (
  is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace members can delete source_scans"
ON public.source_scans
FOR DELETE
TO authenticated
USING (
  is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace members can view scan_insights"
ON public.scan_insights
FOR SELECT
TO authenticated
USING (
  is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace members can insert scan_insights"
ON public.scan_insights
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = user_id AND is_workspace_member(auth.uid(), workspace_id))
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace members can update scan_insights"
ON public.scan_insights
FOR UPDATE
TO authenticated
USING (
  is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
)
WITH CHECK (
  is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Workspace members can delete scan_insights"
ON public.scan_insights
FOR DELETE
TO authenticated
USING (
  is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin')
);