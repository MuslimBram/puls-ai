-- Make view respect the caller's RLS policies on conversation_threads
-- security_invoker = true means the view runs with the permissions of the querying user
ALTER VIEW public.agent_workload_metrics SET (security_invoker = true);