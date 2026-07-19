-- supabase/migrations/0160_roas_live_dashboard.sql
-- ROAS live + Google Ads + Meta Ads unified view

-- View: ROAS i unifikuar (Meta + Google)
CREATE OR REPLACE VIEW public.ads_roas_unified AS
WITH revenue AS (
  SELECT
    workspace_id,
    DATE_TRUNC('day', created_at) AS rev_date,
    SUM(amount) AS daily_revenue
  FROM public.subscriptions
  WHERE status = 'active'
  GROUP BY workspace_id, DATE_TRUNC('day', created_at)
)
SELECT
  a.workspace_id,
  a.date_start,
  a.date_stop,
  CASE WHEN a.ad_account_id LIKE 'google_%' THEN 'google' ELSE 'meta' END AS provider,
  a.impressions,
  a.clicks,
  a.spend,
  a.leads_count,
  a.cost_per_lead,
  a.ctr,
  COALESCE(r.daily_revenue, 0) AS attributed_revenue,
  CASE
    WHEN a.spend > 0 THEN ROUND((COALESCE(r.daily_revenue,0) / a.spend)::numeric, 2)
    ELSE 0
  END AS roas,
  a.synced_at
FROM public.meta_ads_cache a
LEFT JOIN revenue r
  ON r.workspace_id = a.workspace_id
  AND r.rev_date = a.date_start::date;

-- CEO Dashboard summary function
CREATE OR REPLACE FUNCTION public.get_ceo_dashboard_summary(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'leads', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'new_today', COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE),
        'hot', COUNT(*) FILTER (WHERE ai_score >= 0.7),
        'converted', COUNT(*) FILTER (WHERE status = 'converted')
      ) FROM public.public_leads WHERE target_workspace_id = p_workspace_id
        OR target_workspace_id IS NULL
    ),
    'revenue', (
      SELECT jsonb_build_object(
        'mrr', COALESCE(SUM(amount) FILTER (WHERE billing_period = 'monthly'), 0),
        'this_month', COALESCE(SUM(amount) FILTER (
          WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())), 0),
        'last_month', COALESCE(SUM(amount) FILTER (
          WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')), 0)
      ) FROM public.subscriptions WHERE status = 'active'
    ),
    'conversations', (
      SELECT jsonb_build_object(
        'total_today', COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE),
        'ai_handled', COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE AND status = 'ai_handling'),
        'awaiting_human', COUNT(*) FILTER (WHERE status = 'awaiting_human')
      ) FROM public.conversations
    ),
    'ads', (
      SELECT jsonb_build_object(
        'meta_spend', COALESCE(SUM(spend) FILTER (WHERE ad_account_id NOT LIKE 'google_%'), 0),
        'google_spend', COALESCE(SUM(spend) FILTER (WHERE ad_account_id LIKE 'google_%'), 0),
        'total_leads', COALESCE(SUM(leads_count), 0),
        'avg_roas', COALESCE(AVG(CASE WHEN spend > 0 THEN 0 END), 0)
      ) FROM public.meta_ads_cache
      WHERE workspace_id = p_workspace_id
        AND date_start >= CURRENT_DATE - INTERVAL '30 days'
    ),
    'calls', (
      SELECT jsonb_build_object(
        'total_today', COUNT(*) FILTER (WHERE called_at::date = CURRENT_DATE),
        'answered', COUNT(*) FILTER (WHERE duration_sec > 10 AND called_at::date = CURRENT_DATE),
        'leads_from_calls', COUNT(*) FILTER (WHERE lead_detected = true AND called_at::date = CURRENT_DATE)
      ) FROM public.call_records WHERE workspace_id = p_workspace_id
    ),
    'security', (
      SELECT jsonb_build_object(
        'pending_approvals', COUNT(*) FILTER (WHERE status = 'pending'),
        'high_risk_today', COUNT(*) FILTER (WHERE risk_level IN ('high','critical') AND created_at::date = CURRENT_DATE),
        'blocked_today', COUNT(*) FILTER (WHERE outcome = 'blocked' AND created_at::date = CURRENT_DATE)
      ) FROM public.login_attempts la
      JOIN public.user_roles ur ON ur.user_id = la.user_id
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Index për performancën e dashboard-it
CREATE INDEX IF NOT EXISTS idx_meta_ads_workspace_date
  ON public.meta_ads_cache(workspace_id, date_start DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions(status, created_at DESC);
