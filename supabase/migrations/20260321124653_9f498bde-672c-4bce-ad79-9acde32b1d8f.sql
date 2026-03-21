-- Fix agent_workload_metrics: it's a VIEW, so secure the underlying tables instead
-- Grant only workspace-scoped access via the view by revoking public access
REVOKE ALL ON public.agent_workload_metrics FROM anon;
REVOKE ALL ON public.agent_workload_metrics FROM public;

-- Fix policies using {public} role instead of {authenticated}
-- Drop and recreate each with correct role

DROP POLICY IF EXISTS "Users manage own agent utilization" ON public.agent_utilization;
CREATE POLICY "Users manage own agent utilization" ON public.agent_utilization FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own capacity alerts" ON public.capacity_alerts;
CREATE POLICY "Users manage own capacity alerts" ON public.capacity_alerts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own style recs" ON public.content_style_recommendations;
CREATE POLICY "Users manage own style recs" ON public.content_style_recommendations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own value signals" ON public.customer_value_signals;
CREATE POLICY "Users manage own value signals" ON public.customer_value_signals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own demand forecasts" ON public.demand_forecasts;
CREATE POLICY "Users manage own demand forecasts" ON public.demand_forecasts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own forecast analytics" ON public.forecast_analytics;
CREATE POLICY "Users manage own forecast analytics" ON public.forecast_analytics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own funnel analytics" ON public.funnel_analytics;
CREATE POLICY "Users view own funnel analytics" ON public.funnel_analytics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);