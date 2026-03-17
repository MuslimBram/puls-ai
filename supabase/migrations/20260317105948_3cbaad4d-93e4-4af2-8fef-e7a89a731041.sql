
-- Fix conversation_locks: replace permissive policy with proper scoping
DROP POLICY IF EXISTS "Authenticated users can manage locks" ON public.conversation_locks;

CREATE POLICY "Users can view locks on their threads"
  ON public.conversation_locks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_threads ct
    WHERE ct.id = conversation_locks.thread_id AND ct.user_id = auth.uid()
  ));

CREATE POLICY "Users can create locks"
  ON public.conversation_locks FOR INSERT TO authenticated
  WITH CHECK (locked_by = auth.uid());

CREATE POLICY "Users can delete own locks"
  ON public.conversation_locks FOR DELETE TO authenticated
  USING (locked_by = auth.uid());

CREATE POLICY "Users can update own locks"
  ON public.conversation_locks FOR UPDATE TO authenticated
  USING (locked_by = auth.uid());

-- Fix security definer view - recreate as regular view with RLS passthrough
DROP VIEW IF EXISTS public.agent_workload_metrics;

CREATE VIEW public.agent_workload_metrics
WITH (security_invoker = true)
AS
SELECT
  ct.assigned_to AS agent_id,
  ct.user_id,
  COUNT(*) FILTER (WHERE ct.status IN ('new', 'open', 'pending')) AS open_conversations,
  COUNT(*) FILTER (WHERE ct.status = 'resolved') AS resolved_today,
  COUNT(*) FILTER (WHERE ct.sla_breached = true AND ct.status NOT IN ('resolved', 'closed')) AS sla_breached_count,
  AVG(
    CASE WHEN ct.first_response_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (ct.first_response_at - ct.created_at)) / 60.0
    ELSE NULL END
  )::INT AS avg_first_response_min,
  COUNT(*) FILTER (WHERE ct.status IN ('new') AND ct.assigned_to IS NULL) AS unassigned_queue
FROM public.conversation_threads ct
WHERE ct.assigned_to IS NOT NULL
GROUP BY ct.assigned_to, ct.user_id;
