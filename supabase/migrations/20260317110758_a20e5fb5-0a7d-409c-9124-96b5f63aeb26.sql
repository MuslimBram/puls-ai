
-- ============================================================
-- SPRINT 4: Operational Intelligence Layer
-- ============================================================

-- 1. Daily analytics snapshots table (materialized aggregation)
CREATE TABLE public.analytics_daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Agent metrics
  agent_metrics JSONB NOT NULL DEFAULT '{}',
  -- Channel metrics
  channel_metrics JSONB NOT NULL DEFAULT '{}',
  -- Funnel metrics
  funnel_metrics JSONB NOT NULL DEFAULT '{}',
  -- AI metrics
  ai_metrics JSONB NOT NULL DEFAULT '{}',
  -- Workforce metrics
  workforce_metrics JSONB NOT NULL DEFAULT '{}',
  -- Executive summary
  executive_summary JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, workspace_id, snapshot_date)
);

ALTER TABLE public.analytics_daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots"
  ON public.analytics_daily_snapshots FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert snapshots"
  ON public.analytics_daily_snapshots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_analytics_snapshots_date ON public.analytics_daily_snapshots(user_id, snapshot_date DESC);

-- 2. Agent performance aggregation function
CREATE OR REPLACE FUNCTION public.compute_agent_performance(
  _user_id UUID,
  _start_date TIMESTAMPTZ,
  _end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
      COUNT(*) FILTER (WHERE ct.status IN ('new', 'open', 'pending')) AS open_now
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

-- 3. Channel performance aggregation function
CREATE OR REPLACE FUNCTION public.compute_channel_performance(
  _user_id UUID,
  _start_date TIMESTAMPTZ,
  _end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_agg(ch_row) INTO result
  FROM (
    SELECT
      l.source AS channel,
      COUNT(*) AS total_leads,
      COUNT(*) FILTER (WHERE l.status = 'converted') AS converted,
      ROUND(
        (COUNT(*) FILTER (WHERE l.status = 'converted'))::NUMERIC /
        NULLIF(COUNT(*), 0) * 100, 1
      ) AS conversion_rate
    FROM public.leads l
    WHERE l.user_id = _user_id
      AND l.created_at >= _start_date
      AND l.created_at < _end_date
    GROUP BY l.source
  ) ch_row;

  -- Merge with inbox channel stats
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
$$;

-- 4. Funnel analytics function
CREATE OR REPLACE FUNCTION public.compute_funnel_analytics(
  _user_id UUID,
  _start_date TIMESTAMPTZ,
  _end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
  total_leads INT;
  qualified INT;
  deal_count INT;
  won_count INT;
  avg_deal_velocity NUMERIC;
BEGIN
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

  SELECT ROUND(AVG(
    EXTRACT(EPOCH FROM (d.updated_at - d.created_at)) / 86400.0
  )::NUMERIC, 1) INTO avg_deal_velocity
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
$$;

-- 5. AI performance metrics function
CREATE OR REPLACE FUNCTION public.compute_ai_metrics(
  _user_id UUID,
  _start_date TIMESTAMPTZ,
  _end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
  total_ai INT;
  auto_replied INT;
  drafts_generated INT;
  human_overrides INT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_auto_reply = true)
  INTO total_ai, auto_replied
  FROM public.ai_conversations
  WHERE user_id = _user_id
    AND created_at >= _start_date AND created_at < _end_date;

  SELECT COUNT(*) INTO drafts_generated
  FROM public.reply_drafts
  WHERE user_id = _user_id
    AND created_at >= _start_date AND created_at < _end_date;

  -- Human override = drafts not marked preferred
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
$$;

-- 6. Executive summary function
CREATE OR REPLACE FUNCTION public.compute_executive_summary(
  _user_id UUID,
  _date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
  leads_today INT;
  revenue_potential NUMERIC;
  open_conversations INT;
  churn_alerts INT;
  active_campaigns INT;
  sla_breaches INT;
BEGIN
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
$$;
