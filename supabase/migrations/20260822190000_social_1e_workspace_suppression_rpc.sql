-- SOCIAL-1E POLICY SAFETY CORRECTION: workspace-scoped suppression RPC
--
-- Adds a SECURITY DEFINER function that checks suppression by workspace_id
-- (the FK column), not user_id, so the policy engine can perform
-- workspace-scoped lookups without conflating workspace_id with auth user_id.
--
-- This function is the canonical outbound-policy suppression gate.
-- It covers:
--   1. global_suppression_list scoped by workspace_id (exact channel + 'all')
--   2. broadcast_optouts scoped by workspace_id (exact channel + 'all')
--
-- Do NOT duplicate this logic in application code.

CREATE OR REPLACE FUNCTION public.is_contact_suppressed_for_workspace(
  _workspace_id      UUID,
  _contact_identifier TEXT,
  _channel_type      TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.global_suppression_list
    WHERE workspace_id = _workspace_id
      AND contact_identifier = _contact_identifier
      AND (channel_type = _channel_type OR channel_type = 'all')
  ) OR EXISTS (
    SELECT 1 FROM public.broadcast_optouts
    WHERE workspace_id = _workspace_id
      AND contact_identifier = _contact_identifier
      AND (channel_type = _channel_type OR channel_type = 'all')
  )
$$;

-- Index to support the workspace-scoped lookup added above.
-- workspace_id is already an FK; this covering index speeds up the gate query.
CREATE INDEX IF NOT EXISTS idx_suppression_workspace_lookup
  ON public.global_suppression_list (workspace_id, contact_identifier, channel_type);

CREATE INDEX IF NOT EXISTS idx_broadcast_optouts_workspace_lookup
  ON public.broadcast_optouts (workspace_id, contact_identifier, channel_type);
