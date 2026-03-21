-- Fix remaining tables with {public} role policies

DROP POLICY IF EXISTS "Users manage own funnel experiments" ON public.funnel_experiments;
CREATE POLICY "Users manage own funnel experiments" ON public.funnel_experiments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own funnel optimizations" ON public.funnel_optimizations;
CREATE POLICY "Users manage own funnel optimizations" ON public.funnel_optimizations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own funnel stages" ON public.funnel_stages;
CREATE POLICY "Users manage own funnel stages" ON public.funnel_stages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own offer analysis" ON public.offer_analysis;
CREATE POLICY "Users manage own offer analysis" ON public.offer_analysis FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own offer analytics" ON public.offer_analytics;
CREATE POLICY "Users manage own offer analytics" ON public.offer_analytics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own offer experiments" ON public.offer_experiments;
CREATE POLICY "Users manage own offer experiments" ON public.offer_experiments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own offer suggestions" ON public.offer_suggestions;
CREATE POLICY "Users manage own offer suggestions" ON public.offer_suggestions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own personalization analytics" ON public.personalization_analytics;
CREATE POLICY "Users manage own personalization analytics" ON public.personalization_analytics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own personalization profiles" ON public.personalization_profiles;
CREATE POLICY "Users manage own personalization profiles" ON public.personalization_profiles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own personalization rules" ON public.personalization_rules;
CREATE POLICY "Users manage own personalization rules" ON public.personalization_rules FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own posting analytics" ON public.posting_analytics;
CREATE POLICY "Users manage own posting analytics" ON public.posting_analytics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own posting schedules" ON public.posting_schedules;
CREATE POLICY "Users manage own posting schedules" ON public.posting_schedules FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own process bottlenecks" ON public.process_bottlenecks;
CREATE POLICY "Users manage own process bottlenecks" ON public.process_bottlenecks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own resource planning" ON public.resource_planning_items;
CREATE POLICY "Users manage own resource planning" ON public.resource_planning_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own upsell actions" ON public.upsell_actions;
CREATE POLICY "Users manage own upsell actions" ON public.upsell_actions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own viral analytics" ON public.viral_engagement_analytics;
CREATE POLICY "Users manage own viral analytics" ON public.viral_engagement_analytics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own viral triggers" ON public.viral_triggers;
CREATE POLICY "Users manage own viral triggers" ON public.viral_triggers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own workforce analytics" ON public.workforce_analytics;
CREATE POLICY "Users manage own workforce analytics" ON public.workforce_analytics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);