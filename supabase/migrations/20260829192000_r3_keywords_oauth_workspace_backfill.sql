-- R3: deterministically backfill the final known nullable workspace rows in
-- keywords + oauth_states, enforce NOT NULL, and align their access boundaries.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.keywords k
    LEFT JOIN LATERAL (
      SELECT w.id AS workspace_id FROM public.workspaces w WHERE w.owner_id=k.user_id
      UNION
      SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id=k.user_id
      UNION
      SELECT waa.workspace_id
      FROM public.workspace_access_assignments waa
      WHERE waa.user_id=k.user_id
        AND waa.is_active
        AND (waa.expires_at IS NULL OR waa.expires_at > pg_catalog.now())
    ) c ON true
    WHERE k.workspace_id IS NULL
    GROUP BY k.id
    HAVING count(DISTINCT c.workspace_id) <> 1
  ) THEN
    RAISE EXCEPTION 'R3 guard: keywords NULL workspace row is not deterministically attributable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.oauth_states o
    LEFT JOIN LATERAL (
      SELECT w.id AS workspace_id FROM public.workspaces w WHERE w.owner_id=o.user_id
      UNION
      SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id=o.user_id
      UNION
      SELECT waa.workspace_id
      FROM public.workspace_access_assignments waa
      WHERE waa.user_id=o.user_id
        AND waa.is_active
        AND (waa.expires_at IS NULL OR waa.expires_at > pg_catalog.now())
    ) c ON true
    WHERE o.workspace_id IS NULL
    GROUP BY o.id
    HAVING count(DISTINCT c.workspace_id) <> 1
  ) THEN
    RAISE EXCEPTION 'R3 guard: oauth_states NULL workspace row is not deterministically attributable';
  END IF;
END $$;

UPDATE public.keywords k
SET workspace_id = (
  SELECT c.workspace_id
  FROM (
    SELECT w.id AS workspace_id FROM public.workspaces w WHERE w.owner_id=k.user_id
    UNION
    SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id=k.user_id
    UNION
    SELECT waa.workspace_id
    FROM public.workspace_access_assignments waa
    WHERE waa.user_id=k.user_id
      AND waa.is_active
      AND (waa.expires_at IS NULL OR waa.expires_at > pg_catalog.now())
  ) c
  LIMIT 1
)
WHERE k.workspace_id IS NULL;

UPDATE public.oauth_states o
SET workspace_id = (
  SELECT c.workspace_id
  FROM (
    SELECT w.id AS workspace_id FROM public.workspaces w WHERE w.owner_id=o.user_id
    UNION
    SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id=o.user_id
    UNION
    SELECT waa.workspace_id
    FROM public.workspace_access_assignments waa
    WHERE waa.user_id=o.user_id
      AND waa.is_active
      AND (waa.expires_at IS NULL OR waa.expires_at > pg_catalog.now())
  ) c
  LIMIT 1
)
WHERE o.workspace_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.keywords WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'R3 backfill failed: keywords workspace_id remains NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oauth_states WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'R3 backfill failed: oauth_states workspace_id remains NULL';
  END IF;
END $$;

ALTER TABLE public.keywords ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.oauth_states ALTER COLUMN workspace_id SET NOT NULL;

-- Keywords remain a customer feature, but every operation is now caller + workspace bound.
DROP POLICY IF EXISTS "Users can delete own keywords" ON public.keywords;
DROP POLICY IF EXISTS "Users can insert own keywords" ON public.keywords;
DROP POLICY IF EXISTS "Users can update own keywords" ON public.keywords;
DROP POLICY IF EXISTS "Users can view own keywords" ON public.keywords;

CREATE POLICY "Workspace users can view own keywords"
ON public.keywords FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.has_workspace_access(workspace_id)
);
CREATE POLICY "Workspace users can insert own keywords"
ON public.keywords FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','member'])
);
CREATE POLICY "Workspace users can update own keywords"
ON public.keywords FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','member'])
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','member'])
);
CREATE POLICY "Workspace users can delete own keywords"
ON public.keywords FOR DELETE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.has_workspace_role(workspace_id, ARRAY['owner','admin'])
);

REVOKE ALL ON TABLE public.keywords FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.keywords TO authenticated, service_role;

-- oauth_states is transient security state. No canonical browser/runtime caller exists;
-- keep it backend-only while preserving the historical row.
DROP POLICY IF EXISTS "Service role full access on oauth_states" ON public.oauth_states;
DROP POLICY IF EXISTS "Users can delete own oauth states" ON public.oauth_states;
DROP POLICY IF EXISTS "Users can insert own oauth states" ON public.oauth_states;
DROP POLICY IF EXISTS "Users can read own oauth states" ON public.oauth_states;

CREATE POLICY "Service role manages oauth states"
ON public.oauth_states FOR ALL TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.oauth_states FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oauth_states TO service_role;
