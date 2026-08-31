-- Security Advisor corrective boundary for internal trigger/helper functions.
-- These functions are required by trigger execution but do not need direct browser RPC access.

REVOKE ALL ON FUNCTION public.enforce_p0_5_a_parent_workspace()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_p0_5_a_parent_workspace()
  TO service_role;

REVOKE ALL ON FUNCTION public.community_workspace_authorized(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_workspace_authorized(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.enforce_p0_5_a_parent_workspace() IS
  'Internal SECURITY DEFINER trigger function. Direct browser RPC execution revoked.';

COMMENT ON FUNCTION public.community_workspace_authorized(uuid, uuid) IS
  'Internal community trigger authorization helper. Direct browser RPC execution revoked.';
