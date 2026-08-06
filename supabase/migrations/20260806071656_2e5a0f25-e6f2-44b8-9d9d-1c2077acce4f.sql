
-- ============================================================
-- AI + Security foundation tables (merged from external archive,
-- adapted to this project's conventions: GRANTs + strict RLS)
-- ============================================================

-- 1. AI TRAINING DATA -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_training_data (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type         text NOT NULL DEFAULT 'faq',
  question     text NOT NULL,
  answer       text NOT NULL,
  priority     integer NOT NULL DEFAULT 5,
  is_active    boolean NOT NULL DEFAULT true,
  language     text NOT NULL DEFAULT 'en',
  category     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_training_ws ON public.ai_training_data(workspace_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_training_data TO authenticated;
GRANT ALL ON public.ai_training_data TO service_role;
ALTER TABLE public.ai_training_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_read" ON public.ai_training_data FOR SELECT TO authenticated
USING (workspace_id IS NULL OR public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "training_write" ON public.ai_training_data FOR INSERT TO authenticated
WITH CHECK (
  (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id))
  OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
);
CREATE POLICY "training_update" ON public.ai_training_data FOR UPDATE TO authenticated
USING (
  (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id))
  OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
);
CREATE POLICY "training_delete" ON public.ai_training_data FOR DELETE TO authenticated
USING (
  (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id))
  OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
);

-- 2. BUSINESS MEMORY ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_memory (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  memory_key   text NOT NULL,
  memory_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence   numeric(4,3) NOT NULL DEFAULT 0.5,
  source       text NOT NULL DEFAULT 'system',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, entity_type, memory_key)
);
CREATE INDEX IF NOT EXISTS idx_business_memory_conf
  ON public.business_memory(business_id, confidence DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_memory TO authenticated;
GRANT ALL ON public.business_memory TO service_role;
ALTER TABLE public.business_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memory_member_all" ON public.business_memory FOR ALL TO authenticated
USING (public.is_workspace_member(auth.uid(), business_id))
WITH CHECK (public.is_workspace_member(auth.uid(), business_id));

-- 3. AI AGENT TASKS -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_agent_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_type    text NOT NULL,
  agent_name   text NOT NULL,
  input        jsonb NOT NULL DEFAULT '{}'::jsonb,
  output       jsonb,
  status       text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','running','completed','failed')),
  error        text,
  started_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_ws ON public.ai_agent_tasks(workspace_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_tasks TO authenticated;
GRANT ALL ON public.ai_agent_tasks TO service_role;
ALTER TABLE public.ai_agent_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_tasks_member_all" ON public.ai_agent_tasks FOR ALL TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id))
WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

-- 4. AI AGENT CONFIGS -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_agent_configs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_name           text NOT NULL DEFAULT 'Pulse AI',
  agent_tone           text NOT NULL DEFAULT 'professional',
  language             text NOT NULL DEFAULT 'en',
  custom_instructions  text,
  business_description text,
  business_hours       jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_reply_enabled   boolean NOT NULL DEFAULT false,
  enabled_agents       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_configs TO authenticated;
GRANT ALL ON public.ai_agent_configs TO service_role;
ALTER TABLE public.ai_agent_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_cfg_member_all" ON public.ai_agent_configs FOR ALL TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id))
WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

-- 5. INTEGRATION STATUS ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_status (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integrations    jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked    timestamptz,
  onboarding_done boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_status TO authenticated;
GRANT ALL ON public.integration_status TO service_role;
ALTER TABLE public.integration_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "int_status_member_all" ON public.integration_status FOR ALL TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id))
WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

-- 6. CUSTOMER JOURNEY -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_journey (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  customer_id         text NOT NULL,
  current_phase       text NOT NULL DEFAULT 'awareness',
  communication_style text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, customer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_journey TO authenticated;
GRANT ALL ON public.customer_journey TO service_role;
ALTER TABLE public.customer_journey ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journey_member_all" ON public.customer_journey FOR ALL TO authenticated
USING (public.is_workspace_member(auth.uid(), business_id))
WITH CHECK (public.is_workspace_member(auth.uid(), business_id));

-- 7. GOOGLE SYNC LOG ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_sync_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sync_type    text NOT NULL DEFAULT 'ads',
  status       text NOT NULL DEFAULT 'success',
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.google_sync_log TO authenticated;
GRANT ALL ON public.google_sync_log TO service_role;
ALTER TABLE public.google_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gsync_member_read" ON public.google_sync_log FOR SELECT TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

-- 8. DEVICE APPROVAL REQUESTS --------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_approval_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  device_label text,
  ip_address   text,
  user_agent   text,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','denied','expired')),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.device_approval_requests TO authenticated;
GRANT ALL ON public.device_approval_requests TO service_role;
ALTER TABLE public.device_approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device_req_own" ON public.device_approval_requests FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "device_req_own_insert" ON public.device_approval_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY "device_req_own_update" ON public.device_approval_requests FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- 9. SECURITY MONITORING (admin-only) ------------------------------------
CREATE TABLE IF NOT EXISTS public.security_incidents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid,
  incident_type   text NOT NULL,
  severity        text NOT NULL DEFAULT 'medium'
                  CHECK (severity IN ('low','medium','high','critical')),
  category        text NOT NULL,
  source          text NOT NULL,
  source_id       text,
  detected_text   text,
  matched_pattern text,
  threat_score    numeric(4,2) NOT NULL DEFAULT 0.0,
  action_taken    text NOT NULL DEFAULT 'flagged',
  auto_blocked    boolean NOT NULL DEFAULT false,
  blocked_reason  text,
  ip_address      text,
  user_agent      text,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed        boolean NOT NULL DEFAULT false,
  reviewed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_action   text,
  review_note     text,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incidents_ws ON public.security_incidents(workspace_id, created_at DESC);
GRANT SELECT, UPDATE ON public.security_incidents TO authenticated;
GRANT ALL ON public.security_incidents TO service_role;
ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incidents_admin_read" ON public.security_incidents FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "incidents_admin_update" ON public.security_incidents FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.blocked_content (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  source       text NOT NULL,
  source_id    text,
  content      text,
  reason       text NOT NULL,
  blocked_by   text NOT NULL DEFAULT 'ai_security',
  unblocked    boolean NOT NULL DEFAULT false,
  unblocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  unblocked_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.blocked_content TO authenticated;
GRANT ALL ON public.blocked_content TO service_role;
ALTER TABLE public.blocked_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocked_admin_read" ON public.blocked_content FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "blocked_admin_update" ON public.blocked_content FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.payment_fraud_flags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  payment_id   uuid,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  flag_type    text NOT NULL,
  risk_score   numeric(4,2) NOT NULL DEFAULT 0.0,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'pending',
  reviewed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.payment_fraud_flags TO authenticated;
GRANT ALL ON public.payment_fraud_flags TO service_role;
ALTER TABLE public.payment_fraud_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fraud_admin_read" ON public.payment_fraud_flags FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "fraud_admin_update" ON public.payment_fraud_flags FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.content_scan_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  source       text NOT NULL,
  source_id    text,
  content_hash text NOT NULL,
  threat_found boolean NOT NULL DEFAULT false,
  threats      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_log_hash ON public.content_scan_log(content_hash, source, created_at DESC);
GRANT SELECT ON public.content_scan_log TO authenticated;
GRANT ALL ON public.content_scan_log TO service_role;
ALTER TABLE public.content_scan_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scan_log_admin_read" ON public.content_scan_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 10. SSO CONFIGS (admin-only; secret never exposed to members) -----------
CREATE TABLE IF NOT EXISTS public.sso_configs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider               text NOT NULL,
  client_id              text,
  client_secret_encrypted text,
  tenant_id              text,
  issuer_url             text,
  allowed_domains        text[] NOT NULL DEFAULT '{}',
  is_active              boolean NOT NULL DEFAULT false,
  enforce_sso            boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sso_configs TO authenticated;
GRANT ALL ON public.sso_configs TO service_role;
ALTER TABLE public.sso_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sso_admin_all" ON public.sso_configs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 11. HELPER FUNCTIONS ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit(
  p_workspace_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_action text DEFAULT 'unknown',
  p_resource_type text DEFAULT 'system',
  p_severity text DEFAULT 'info',
  p_new_values jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs(user_id, action, resource_type, metadata)
  VALUES (p_user_id, p_action, p_resource_type,
          jsonb_build_object('workspace_id', p_workspace_id,
                             'severity', p_severity,
                             'values', p_new_values));
EXCEPTION WHEN others THEN
  NULL; -- auditing must never break the caller
END;$$;
REVOKE EXECUTE ON FUNCTION public.log_audit(uuid,uuid,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit(uuid,uuid,text,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.boost_memory_confidence(
  p_business_id uuid, p_memory_key text, p_boost numeric DEFAULT 0.05
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.business_memory
     SET confidence = LEAST(confidence + p_boost, 1.0), updated_at = now()
   WHERE business_id = p_business_id AND memory_key = p_memory_key;
END;$$;
REVOKE EXECUTE ON FUNCTION public.boost_memory_confidence(uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.boost_memory_confidence(uuid,text,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.decay_memory_confidence(p_days integer DEFAULT 30)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.business_memory
     SET confidence = GREATEST(confidence - 0.02, 0.0), updated_at = now()
   WHERE updated_at < now() - (p_days || ' days')::interval
     AND confidence > 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;$$;
REVOKE EXECUTE ON FUNCTION public.decay_memory_confidence(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decay_memory_confidence(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_legal_training_response(p_query text, p_language text DEFAULT 'en')
RETURNS TABLE (question text, answer text, priority integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.question, t.answer, t.priority
    FROM public.ai_training_data t
   WHERE t.workspace_id IS NULL
     AND t.is_active = true
     AND t.type IN ('policy','faq')
     AND (t.language = p_language OR p_language IS NULL)
     AND (t.question ILIKE '%' || p_query || '%' OR t.answer ILIKE '%' || p_query || '%')
   ORDER BY t.priority DESC
   LIMIT 5;
$$;
REVOKE EXECUTE ON FUNCTION public.get_legal_training_response(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_legal_training_response(text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_prohibited_rules(p_language text DEFAULT 'en')
RETURNS TABLE (question text, answer text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.question, t.answer
    FROM public.ai_training_data t
   WHERE t.workspace_id IS NULL
     AND t.is_active = true
     AND t.category = 'prohibited'
     AND (t.language = p_language OR p_language IS NULL)
   ORDER BY t.priority DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.get_prohibited_rules(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_prohibited_rules(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.generate_daily_kpi(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_leads integer := 0; v_tasks integer := 0;
BEGIN
  SELECT count(*) INTO v_tasks FROM public.ai_agent_tasks
   WHERE workspace_id = p_workspace_id AND created_at > now() - interval '1 day';
  RETURN jsonb_build_object('workspace_id', p_workspace_id,
                            'agent_tasks_24h', v_tasks,
                            'generated_at', now());
END;$$;
REVOKE EXECUTE ON FUNCTION public.generate_daily_kpi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_daily_kpi(uuid) TO service_role;

-- 12. updated_at triggers -------------------------------------------------
CREATE TRIGGER trg_training_updated BEFORE UPDATE ON public.ai_training_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_memory_updated BEFORE UPDATE ON public.business_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agentcfg_updated BEFORE UPDATE ON public.ai_agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_intstatus_updated BEFORE UPDATE ON public.integration_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_journey_updated BEFORE UPDATE ON public.customer_journey
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sso_updated BEFORE UPDATE ON public.sso_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
