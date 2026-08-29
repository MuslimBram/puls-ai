-- R1B: bind browser-callable operational analytics SECURITY DEFINER RPCs
-- to the authenticated caller. Preserve service_role backend access.

DO $$
DECLARE
  expected text[] := ARRAY[
    'public.compute_agent_performance(uuid,timestamp with time zone,timestamp with time zone)',
    'public.compute_ai_metrics(uuid,timestamp with time zone,timestamp with time zone)',
    'public.compute_channel_performance(uuid,timestamp with time zone,timestamp with time zone)',
    'public.compute_funnel_analytics(uuid,timestamp with time zone,timestamp with time zone)',
    'public.compute_executive_summary(uuid,date)'
  ];
  identity text;
  proc_oid oid;
BEGIN
  FOREACH identity IN ARRAY expected LOOP
    proc_oid := to_regprocedure(identity);
    IF proc_oid IS NULL THEN
      RAISE EXCEPTION 'R1B analytics guard: missing function %', identity;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = proc_oid) THEN
      RAISE EXCEPTION 'R1B analytics guard: % is no longer SECURITY DEFINER', identity;
    END IF;
    IF (SELECT pg_get_function_result(proc_oid)) <> 'jsonb' THEN
      RAISE EXCEPTION 'R1B analytics guard: unexpected return type for %', identity;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.compute_agent_performance(
  _user_id uuid,
  _start_date timestamp with time zone,
  _end_date timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  result JSONB;
BEGIN
  IF _user_id IS DISTINCT FROM (SELECT auth.uid())
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ANALYTICS_SUBJECT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

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
      (SELECT COUNT(*) FROM public.deals d
       WHERE d.user_id = _user_id
         AND d.created_at >= _start_date AND d.created_at < _end_date
         AND d.id IN (
           SELECT cs.deal_id FROM public.chatbot_sessions cs
           WHERE cs.user_id = _user_id AND cs.deal_id IS NOT NULL
         )
      ) AS deals_attributed,
      (SELECT COUNT(*) FROM public.deals d
       WHERE d.user_id = _user_id AND d.status = 'won'
         AND d.created_at >= _start_date AND d.created_at < _end_date
      ) AS deals_won,
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
$function$;

CREATE OR REPLACE FUNCTION public.compute_ai_metrics(
  _user_id uuid,
  _start_date timestamp with time zone,
  _end_date timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  result JSONB;
  total_ai INT;
  auto_replied INT;
  drafts_generated INT;
  human_overrides INT;
BEGIN
  IF _user_id IS DISTINCT FROM (SELECT auth.uid())
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ANALYTICS_SUBJECT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_auto_reply = true)
  INTO total_ai, auto_replied
  FROM public.ai_conversations
  WHERE user_id = _user_id
    AND created_at >= _start_date AND created_at < _end_date;

  SELECT COUNT(*) INTO drafts_generated
  FROM public.reply_drafts
  WHERE user_id = _user_id
    AND created_at >= _start_date AND created_at < _end_date;

  SELECT COUNT(*) INTO human_overrides
  FROM public.reply_drafts
  WHERE user_id = _user_id
    AND is_preferred = false
    AND created_at >= _start_date AND created_at < _end_date;

  result := jsonb_build_object(
    'total_ai_conversations', total_ai,
    'auto_replied', auto_replied,
    'auto_reply_rate', CASE WHEN total_ai > 0 THEN ROUND(auto_replied::NUMERIC / total_ai * 100, 1) ELSE 0 END,
    'drafts_generated', drafts_generated,
    'human_override_ratio', CASE WHEN drafts_generated > 0 THEN ROUND(human_overrides::NUMERIC / drafts_generated * 100, 1) ELSE 0 END
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_channel_performance(
  _user_id uuid,
  _start_date timestamp with time zone,
  _end_date timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  result JSONB;
BEGIN
  IF _user_id IS DISTINCT FROM (SELECT auth.uid())
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ANALYTICS_SUBJECT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(ch_row) INTO result
  FROM (
    SELECT
      l.source AS channel,
      COUNT(*) AS total_leads,
      COUNT(*) FILTER (WHERE l.status = 'converted') AS converted,
      ROUND((COUNT(*) FILTER (WHERE l.status = 'converted'))::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS conversion_rate
    FROM public.leads l
    WHERE l.user_id = _user_id
      AND l.created_at >= _start_date
      AND l.created_at < _end_date
    GROUP BY l.source
  ) ch_row;

  WITH inbox_stats AS (
    SELECT
      im.channel_type AS channel,
      COUNT(*) AS total_messages,
      COUNT(*) FILTER (WHERE im.is_unread = true) AS unread_backlog,
      ROUND(AVG(
        CASE WHEN im.first_reply_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (im.first_reply_at - im.message_timestamp)) / 60.0
        ELSE NULL END
      )::NUMERIC, 1) AS avg_response_min
    FROM public.inbox_messages im
    WHERE im.user_id = _user_id
      AND im.message_timestamp >= _start_date
      AND im.message_timestamp < _end_date
    GROUP BY im.channel_type
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'channel', s.channel,
      'total_messages', s.total_messages,
      'unread_backlog', s.unread_backlog,
      'avg_response_min', s.avg_response_min
    )
  ), '[]'::JSONB) INTO result
  FROM inbox_stats s;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_funnel_analytics(
  _user_id uuid,
  _start_date timestamp with time zone,
  _end_date timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  result JSONB;
  total_leads INT;
  qualified INT;
  deal_count INT;
  won_count INT;
  avg_deal_velocity NUMERIC;
BEGIN
  IF _user_id IS DISTINCT FROM (SELECT auth.uid())
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ANALYTICS_SUBJECT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO total_leads
  FROM public.leads WHERE user_id = _user_id AND created_at >= _start_date AND created_at < _end_date;

  SELECT COUNT(*) INTO qualified
  FROM public.leads WHERE user_id = _user_id AND status IN ('qualified', 'converted')
    AND created_at >= _start_date AND created_at < _end_date;

  SELECT COUNT(*) INTO deal_count
  FROM public.deals WHERE user_id = _user_id AND created_at >= _start_date AND created_at < _end_date;

  SELECT COUNT(*) INTO won_count
  FROM public.deals WHERE user_id = _user_id AND status = 'won'
    AND created_at >= _start_date AND created_at < _end_date;

  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (d.updated_at - d.created_at)) / 86400.0)::NUMERIC, 1) INTO avg_deal_velocity
  FROM public.deals d
  WHERE d.user_id = _user_id AND d.status = 'won'
    AND d.created_at >= _start_date AND d.created_at < _end_date;

  result := jsonb_build_object(
    'total_leads', total_leads,
    'qualified', qualified,
    'deals', deal_count,
    'won', won_count,
    'lead_to_qualified_pct', CASE WHEN total_leads > 0 THEN ROUND(qualified::NUMERIC / total_leads * 100, 1) ELSE 0 END,
    'qualified_to_deal_pct', CASE WHEN qualified > 0 THEN ROUND(deal_count::NUMERIC / qualified * 100, 1) ELSE 0 END,
    'deal_to_won_pct', CASE WHEN deal_count > 0 THEN ROUND(won_count::NUMERIC / deal_count * 100, 1) ELSE 0 END,
    'avg_deal_velocity_days', COALESCE(avg_deal_velocity, 0)
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_executive_summary(
  _user_id uuid,
  _date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  result JSONB;
  leads_today INT;
  revenue_potential NUMERIC;
  open_conversations INT;
  churn_alerts INT;
  active_campaigns INT;
  sla_breaches INT;
BEGIN
  IF _user_id IS DISTINCT FROM (SELECT auth.uid())
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ANALYTICS_SUBJECT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO leads_today
  FROM public.leads WHERE user_id = _user_id AND created_at >= _date AND created_at < _date + 1;

  SELECT COALESCE(SUM(d.value), 0) INTO revenue_potential
  FROM public.deals d WHERE d.user_id = _user_id AND d.status NOT IN ('lost') AND d.created_at >= _date - 30;

  SELECT COUNT(*) INTO open_conversations
  FROM public.conversation_threads WHERE user_id = _user_id AND status IN ('new', 'open', 'pending');

  SELECT COUNT(*) INTO churn_alerts
  FROM public.churn_risk_scores WHERE user_id = _user_id AND risk_level IN ('high', 'critical');

  SELECT COUNT(*) INTO active_campaigns
  FROM public.campaigns WHERE user_id = _user_id AND status = 'active';

  SELECT COUNT(*) INTO sla_breaches
  FROM public.conversation_threads WHERE user_id = _user_id AND sla_breached = true AND status NOT IN ('resolved', 'closed');

  result := jsonb_build_object(
    'date', _date,
    'leads_today', leads_today,
    'revenue_potential_30d', revenue_potential,
    'open_conversations', open_conversations,
    'churn_risk_alerts', churn_alerts,
    'active_campaigns', active_campaigns,
    'sla_breaches_active', sla_breaches
  );

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.compute_agent_performance(uuid,timestamp with time zone,timestamp with time zone) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_ai_metrics(uuid,timestamp with time zone,timestamp with time zone) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_channel_performance(uuid,timestamp with time zone,timestamp with time zone) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_funnel_analytics(uuid,timestamp with time zone,timestamp with time zone) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_executive_summary(uuid,date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.compute_agent_performance(uuid,timestamp with time zone,timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_ai_metrics(uuid,timestamp with time zone,timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_channel_performance(uuid,timestamp with time zone,timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_funnel_analytics(uuid,timestamp with time zone,timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_executive_summary(uuid,date) TO authenticated, service_role;
