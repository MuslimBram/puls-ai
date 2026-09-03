-- MR3 task lease privacy.
-- MR2 granted table-level SELECT on leah_tasks. MR3 adds lease credentials to that
-- table, so browser roles must be reduced to an explicit safe-column projection.

revoke select on public.leah_tasks from authenticated;

grant select (
  id,
  workspace_id,
  execution_id,
  project_id,
  seq,
  priority,
  status,
  input,
  output,
  error,
  attempt,
  available_at,
  started_at,
  ended_at,
  created_at,
  updated_at,
  agent_role,
  parent_task_id,
  swarm_id,
  max_attempts
) on public.leah_tasks to authenticated;

-- Explicitly document the server-only lease surface. These revokes are redundant after
-- the table-level revoke but keep later grant changes from accidentally exposing them.
revoke select (lease_owner, lease_token, lease_expires_at, heartbeat_at)
  on public.leah_tasks from authenticated;
