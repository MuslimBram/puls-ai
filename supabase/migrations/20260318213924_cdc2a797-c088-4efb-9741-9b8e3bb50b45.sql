-- ============================================================
-- Fix #4: Replace all {public} role policies with {authenticated}
-- ============================================================

-- 1. api_keys
DROP POLICY IF EXISTS "Users manage own API keys" ON public.api_keys;
CREATE POLICY "Users manage own API keys" ON public.api_keys FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. api_request_logs
DROP POLICY IF EXISTS "Users view own API logs" ON public.api_request_logs;
CREATE POLICY "Users view own API logs" ON public.api_request_logs FOR SELECT TO authenticated USING (api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid()));

-- 3. broadcast_optouts
DROP POLICY IF EXISTS "Users manage own optouts" ON public.broadcast_optouts;
CREATE POLICY "Users manage own optouts" ON public.broadcast_optouts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. broadcast_send_queue
DROP POLICY IF EXISTS "Users see own send queue" ON public.broadcast_send_queue;
CREATE POLICY "Users see own send queue" ON public.broadcast_send_queue FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 5. broadcast_unsubscribe_tokens
DROP POLICY IF EXISTS "Users can create unsub tokens" ON public.broadcast_unsubscribe_tokens;
CREATE POLICY "Users can create unsub tokens" ON public.broadcast_unsubscribe_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own unsub tokens" ON public.broadcast_unsubscribe_tokens;
CREATE POLICY "Users can view own unsub tokens" ON public.broadcast_unsubscribe_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 6. business_profiles
DROP POLICY IF EXISTS "Users can create their own business profiles" ON public.business_profiles;
CREATE POLICY "Users can create their own business profiles" ON public.business_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own business profiles" ON public.business_profiles;
CREATE POLICY "Users can delete their own business profiles" ON public.business_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own business profiles" ON public.business_profiles;
CREATE POLICY "Users can update their own business profiles" ON public.business_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own business profiles" ON public.business_profiles;
CREATE POLICY "Users can view their own business profiles" ON public.business_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 7. churn_risk_scores
DROP POLICY IF EXISTS "Admin view all churn" ON public.churn_risk_scores;
CREATE POLICY "Admin view all churn" ON public.churn_risk_scores FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users view own churn risk" ON public.churn_risk_scores;
CREATE POLICY "Users view own churn risk" ON public.churn_risk_scores FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 8. enriched_contacts
DROP POLICY IF EXISTS "Users manage own enriched contacts" ON public.enriched_contacts;
CREATE POLICY "Users manage own enriched contacts" ON public.enriched_contacts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 9. escalation_log
DROP POLICY IF EXISTS "Workspace members can view escalation logs" ON public.escalation_log;
CREATE POLICY "Workspace members can view escalation logs" ON public.escalation_log FOR SELECT TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));

-- 10. escalation_rules
DROP POLICY IF EXISTS "Workspace members can view escalation rules" ON public.escalation_rules;
CREATE POLICY "Workspace members can view escalation rules" ON public.escalation_rules FOR SELECT TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Workspace owners can manage escalation rules" ON public.escalation_rules;
CREATE POLICY "Workspace owners can manage escalation rules" ON public.escalation_rules FOR ALL TO authenticated USING (is_workspace_owner(auth.uid(), workspace_id)) WITH CHECK (is_workspace_owner(auth.uid(), workspace_id));

-- 11. global_suppression_list
DROP POLICY IF EXISTS "Users delete own suppressions" ON public.global_suppression_list;
CREATE POLICY "Users delete own suppressions" ON public.global_suppression_list FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own suppressions" ON public.global_suppression_list;
CREATE POLICY "Users insert own suppressions" ON public.global_suppression_list FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own suppressions" ON public.global_suppression_list;
CREATE POLICY "Users see own suppressions" ON public.global_suppression_list FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 12. message_delivery_states
DROP POLICY IF EXISTS "Users see own delivery states" ON public.message_delivery_states;
CREATE POLICY "Users see own delivery states" ON public.message_delivery_states FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 13. message_media
DROP POLICY IF EXISTS "Users insert own media" ON public.message_media;
CREATE POLICY "Users insert own media" ON public.message_media FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own media" ON public.message_media;
CREATE POLICY "Users see own media" ON public.message_media FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 14. profiles
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 15. sending_reputation
DROP POLICY IF EXISTS "Users see own reputation" ON public.sending_reputation;
CREATE POLICY "Users see own reputation" ON public.sending_reputation FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 16. stripe_product_plans
DROP POLICY IF EXISTS "Admins can manage stripe plans" ON public.stripe_product_plans;
CREATE POLICY "Admins can manage stripe plans" ON public.stripe_product_plans FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 17. whatsapp_templates
DROP POLICY IF EXISTS "Users manage own WA templates" ON public.whatsapp_templates;
CREATE POLICY "Users manage own WA templates" ON public.whatsapp_templates FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 18. zapier_webhooks
DROP POLICY IF EXISTS "Users manage own webhooks" ON public.zapier_webhooks;
CREATE POLICY "Users manage own webhooks" ON public.zapier_webhooks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);