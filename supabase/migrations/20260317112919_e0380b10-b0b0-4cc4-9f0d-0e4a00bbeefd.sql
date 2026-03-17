-- Enhance compute_agent_performance to include deal attribution
CREATE OR REPLACE FUNCTION public.compute_agent_performance(_user_id uuid, _start_date timestamp with time zone, _end_date timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_agg(agent_row) INTO result
  FROM (
    SELECT
      ct.assigned_to AS agent_id,
      COUNT(*) AS conversations_handled,
      COUNT(*) FILTER (WHERE ct.status IN ('resolved', 'closed')) AS resolved_count,
      COUNT(*) FILTER (WHERE ct.sla_breached = true) AS sla_breaches,
      ROUND(AVG(
        CASE WHEN ct.first_response_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (ct.first_response_at - ct.created_at)) / 60.0
        ELSE NULL END
      )::NUMERIC, 1) AS avg_first_response_min,
      ROUND(AVG(
        CASE WHEN ct.resolved_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (ct.resolved_at - ct.created_at)) / 3600.0
        ELSE NULL END
      )::NUMERIC, 2) AS avg_resolution_hours,
      COUNT(*) FILTER (WHERE ct.status IN ('new', 'open', 'pending')) AS open_now,
      -- Deal attribution: count deals where the agent handled the related conversation
      (SELECT COUNT(*) FROM public.deals d
       WHERE d.user_id = _user_id
         AND d.created_at >= _start_date AND d.created_at < _end_date
         AND d.id IN (
           SELECT (cs.deal_id) FROM public.chatbot_sessions cs
           WHERE cs.user_id = _user_id AND cs.deal_id IS NOT NULL
         )
      ) AS deals_attributed,
      (SELECT COUNT(*) FROM public.deals d
       WHERE d.user_id = _user_id AND d.status = 'won'
         AND d.created_at >= _start_date AND d.created_at < _end_date
      ) AS deals_won,
      -- Messages sent by this agent
      (SELECT COUNT(*) FROM public.inbox_messages im
       WHERE im.user_id = _user_id
         AND im.direction = 'outbound'
         AND im.sender_id = ct.assigned_to
         AND im.message_timestamp >= _start_date
         AND im.message_timestamp < _end_date
      ) AS messages_sent
    FROM public.conversation_threads ct
    WHERE ct.user_id = _user_id
      AND ct.created_at >= _start_date
      AND ct.created_at < _end_date
      AND ct.assigned_to IS NOT NULL
    GROUP BY ct.assigned_to
  ) agent_row;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;
