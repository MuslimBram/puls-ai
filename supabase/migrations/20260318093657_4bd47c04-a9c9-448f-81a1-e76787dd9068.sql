ALTER TABLE public.media_generations
ADD COLUMN IF NOT EXISTS business_id uuid;

ALTER TABLE public.knowledge_sources
ADD COLUMN IF NOT EXISTS business_id uuid;

ALTER TABLE public.knowledge_chunks
ADD COLUMN IF NOT EXISTS business_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'media_generations'
      AND constraint_name = 'media_generations_business_id_fkey'
  ) THEN
    ALTER TABLE public.media_generations
      ADD CONSTRAINT media_generations_business_id_fkey
      FOREIGN KEY (business_id) REFERENCES public.business_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'knowledge_sources'
      AND constraint_name = 'knowledge_sources_business_id_fkey'
  ) THEN
    ALTER TABLE public.knowledge_sources
      ADD CONSTRAINT knowledge_sources_business_id_fkey
      FOREIGN KEY (business_id) REFERENCES public.business_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'knowledge_chunks'
      AND constraint_name = 'knowledge_chunks_business_id_fkey'
  ) THEN
    ALTER TABLE public.knowledge_chunks
      ADD CONSTRAINT knowledge_chunks_business_id_fkey
      FOREIGN KEY (business_id) REFERENCES public.business_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_media_generations_business_created_at
  ON public.media_generations (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_business_status
  ON public.knowledge_sources (business_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_business_created_at
  ON public.knowledge_chunks (business_id, created_at DESC);

UPDATE public.media_generations mg
SET business_id = candidate.business_id
FROM (
  SELECT
    mg2.id,
    bp.id AS business_id,
    row_number() OVER (PARTITION BY mg2.id ORDER BY bp.created_at ASC) AS rn,
    count(*) OVER (PARTITION BY mg2.id) AS total_matches
  FROM public.media_generations mg2
  JOIN public.business_profiles bp
    ON bp.user_id = mg2.user_id
   AND (
     mg2.workspace_id IS NULL
     OR bp.workspace_id = mg2.workspace_id
   )
  WHERE mg2.business_id IS NULL
) AS candidate
WHERE mg.id = candidate.id
  AND candidate.rn = 1
  AND candidate.total_matches = 1;

UPDATE public.knowledge_sources ks
SET business_id = COALESCE(
  NULLIF(ks.metadata ->> 'business_id', '')::uuid,
  candidate.business_id
)
FROM (
  SELECT
    ks2.id,
    bp.id AS business_id,
    row_number() OVER (PARTITION BY ks2.id ORDER BY bp.created_at ASC) AS rn,
    count(*) OVER (PARTITION BY ks2.id) AS total_matches
  FROM public.knowledge_sources ks2
  JOIN public.business_profiles bp
    ON bp.user_id = ks2.user_id
   AND (
     ks2.workspace_id IS NULL
     OR bp.workspace_id = ks2.workspace_id
   )
  WHERE ks2.business_id IS NULL
) AS candidate
WHERE ks.id = candidate.id
  AND ks.business_id IS NULL
  AND candidate.rn = 1
  AND candidate.total_matches = 1;

UPDATE public.knowledge_chunks kc
SET business_id = ks.business_id
FROM public.knowledge_sources ks
WHERE kc.source_id = ks.id
  AND kc.business_id IS NULL
  AND ks.business_id IS NOT NULL;