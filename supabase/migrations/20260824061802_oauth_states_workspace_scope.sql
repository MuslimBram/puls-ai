-- Scope social OAuth state to the exact workspace selected in the UI.
-- Nullable for backward compatibility with older non-social OAuth rows.
ALTER TABLE public.oauth_states
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS oauth_states_workspace_id_idx
  ON public.oauth_states(workspace_id);;
