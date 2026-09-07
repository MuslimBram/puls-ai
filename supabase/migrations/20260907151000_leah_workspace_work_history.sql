-- Workspace-scoped LEAH work history.
-- The model may use this as context, but it never grants authorization.
CREATE TABLE IF NOT EXISTS public.leah_work_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_message text NOT NULL CHECK (length(btrim(user_message)) BETWEEN 1 AND 12000),
  assistant_message text NOT NULL CHECK (length(btrim(assistant_message)) BETWEEN 1 AND 30000),
  provider text NOT NULL,
  model text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leah_work_history_workspace_created
  ON public.leah_work_history(workspace_id, created_at DESC);

ALTER TABLE public.leah_work_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "LEAH history readable in workspace" ON public.leah_work_history;
CREATE POLICY "LEAH history readable in workspace"
ON public.leah_work_history FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "LEAH history insertable in workspace" ON public.leah_work_history;
CREATE POLICY "LEAH history insertable in workspace"
ON public.leah_work_history FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND public.has_workspace_access(workspace_id));

REVOKE ALL ON TABLE public.leah_work_history FROM anon;
GRANT SELECT, INSERT ON TABLE public.leah_work_history TO authenticated;
GRANT ALL ON TABLE public.leah_work_history TO service_role;
