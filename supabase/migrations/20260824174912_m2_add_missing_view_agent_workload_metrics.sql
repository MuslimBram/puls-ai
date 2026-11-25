-- M2: mbyllja e boshllëkut të vetëm skematik (272/273 -> 273/273)
CREATE OR REPLACE VIEW public.agent_workload_metrics AS
SELECT assigned_to AS agent_id,
    user_id,
    count(*) FILTER (WHERE status = ANY (ARRAY['new'::text, 'open'::text, 'pending'::text])) AS open_conversations,
    count(*) FILTER (WHERE status = 'resolved'::text) AS resolved_today,
    count(*) FILTER (WHERE sla_breached = true AND (status <> ALL (ARRAY['resolved'::text, 'closed'::text]))) AS sla_breached_count,
    avg(
        CASE
            WHEN first_response_at IS NOT NULL THEN EXTRACT(epoch FROM first_response_at - created_at) / 60.0
            ELSE NULL::numeric
        END)::integer AS avg_first_response_min,
    count(*) FILTER (WHERE status = 'new'::text AND assigned_to IS NULL) AS unassigned_queue
   FROM conversation_threads ct
  WHERE assigned_to IS NOT NULL
  GROUP BY assigned_to, user_id;
;
