revoke all on table public.admin_role_requests from public, anon, authenticated;
grant select on table public.admin_role_requests to authenticated;

revoke all on table public.workspace_support_sessions from public, anon, authenticated;
grant select on table public.workspace_support_sessions to authenticated;

revoke all on table public.workspace_access_assignments from public, anon;
grant select, insert, update, delete on table public.workspace_access_assignments to authenticated;

revoke all on table public.workspace_access_assignments from authenticated;
grant select, insert, update, delete on table public.workspace_access_assignments to authenticated;

revoke truncate, trigger, references on table public.workspace_access_assignments from authenticated;
revoke truncate, trigger, references on table public.workspace_support_sessions from authenticated;
revoke truncate, trigger, references on table public.admin_role_requests from authenticated;

revoke all on table public.admin_role_requests from anon, public;
revoke all on table public.workspace_support_sessions from anon, public;
revoke all on table public.workspace_access_assignments from anon, public;