-- Step 3: isolate AI reply context by business
ALTER TABLE public.ai_conversation_memory
ADD COLUMN IF NOT EXISTS business_id UUID;

ALTER TABLE public.ai_conversations
ADD COLUMN IF NOT EXISTS business_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_conversation_memory_business_id_fkey'
  ) THEN
    ALTER TABLE public.ai_conversation_memory
    ADD CONSTRAINT ai_conversation_memory_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES public.business_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_conversations_business_id_fkey'
  ) THEN
    ALTER TABLE public.ai_conversations
    ADD CONSTRAINT ai_conversations_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES public.business_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_conversation_memory_business_contact
ON public.ai_conversation_memory (business_id, contact_identifier, workspace_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_business_created
ON public.ai_conversations (business_id, created_at DESC);

-- Backfill existing records where a single matching business exists for the same owner/workspace
UPDATE public.ai_conversation_memory m
SET business_id = bp.id
FROM public.business_profiles bp
WHERE m.business_id IS NULL
  AND m.workspace_id IS NOT NULL
  AND bp.workspace_id = m.workspace_id
  AND bp.user_id = (
    SELECT w.owner_id
    FROM public.workspaces w
    WHERE w.id = m.workspace_id
    LIMIT 1
  )
  AND bp.id = (
    SELECT bp2.id
    FROM public.business_profiles bp2
    WHERE bp2.workspace_id = m.workspace_id
      AND bp2.user_id = bp.user_id
    ORDER BY bp2.created_at ASC
    LIMIT 1
  );

UPDATE public.ai_conversations c
SET business_id = bp.id
FROM public.business_profiles bp
WHERE c.business_id IS NULL
  AND c.workspace_id IS NOT NULL
  AND bp.workspace_id = c.workspace_id
  AND bp.user_id = c.user_id
  AND bp.id = (
    SELECT bp2.id
    FROM public.business_profiles bp2
    WHERE bp2.workspace_id = c.workspace_id
      AND bp2.user_id = c.user_id
    ORDER BY bp2.created_at ASC
    LIMIT 1
  );