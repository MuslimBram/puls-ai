-- Fix remaining {public} role policies

DROP POLICY IF EXISTS "Users manage own funnel opts" ON public.funnel_optimizations;
CREATE POLICY "Users manage own funnel opts" ON public.funnel_optimizations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own offer analytics" ON public.offer_analytics;
CREATE POLICY "Users view own offer analytics" ON public.offer_analytics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own posting analytics" ON public.posting_analytics;
CREATE POLICY "Users view own posting analytics" ON public.posting_analytics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own schedules" ON public.posting_schedules;
CREATE POLICY "Users manage own schedules" ON public.posting_schedules FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own bottlenecks" ON public.process_bottlenecks;
CREATE POLICY "Users manage own bottlenecks" ON public.process_bottlenecks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own viral analytics" ON public.viral_engagement_analytics;
CREATE POLICY "Users view own viral analytics" ON public.viral_engagement_analytics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);