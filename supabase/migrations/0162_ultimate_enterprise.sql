-- supabase/migrations/0162_ultimate_enterprise.sql
-- Ultimate/Enterprise+ plan + SSO + Audit + IP Whitelist + Custom Objects + Multi-Agent

-- ── 1. ULTIMATE PLAN ─────────────────────────────────────────
INSERT INTO public.pricing_settings(plan_key,plan_name,billing_period,price,stripe_price_id,features,is_active,display_order)
VALUES
('ultimate','Ultimate','monthly',999,'price_ultimate_monthly','{
  "users":-1,"ai_credits":2000000,"storage_gb":10240,"contacts":-1,
  "emails_per_month":-1,"sms_per_month":-1,"channels":["all"],
  "crm":"enterprise","marketing_automation":"enterprise","sales_funnels":-1,
  "ai_agents":-1,"ai_images_month":-1,"ai_video_month":-1,"ai_audio_min":-1,
  "white_label":true,"multi_brand":-1,"odoo_integration":"enterprise",
  "api_access":true,"webhooks":-1,"support":"dedicated_team",
  "sla":"99.9_penalized","price_monthly":999,"price_annual":9990,
  "dedicated_infrastructure":true,"dedicated_database":true,
  "dedicated_ai_gateway":true,"private_cloud":true,"on_premise":true,
  "multi_region":true,"disaster_recovery":true,"daily_backups":true,
  "high_availability":true,"custom_dpa":true,"gdpr_docs":true,
  "iso27001_ready":true,"audit_logs":true,"sso":true,
  "ip_whitelisting":true,"advanced_roles":true,"security_dashboard":true,
  "dedicated_ai":true,"ai_memory_dedicated":true,
  "multi_agent_collaboration":true,"ai_coach":true,
  "ai_business_consultant":true,"ai_sales_manager":true,
  "ai_marketing_manager":true,"ai_csm":true,"ai_ceo_assistant":true,
  "ml_lead_scoring":true,"custom_prompts_library":true,
  "custom_domain":true,"custom_email_templates":true,
  "custom_workflows":true,"custom_dashboards":true,"custom_reports":true,
  "custom_objects":true,"custom_fields":true,
  "integrations_unlimited":true,"erp_integrations":true,
  "account_manager":true,"technical_manager":true,"ai_specialist":true,
  "data_migration":true,"team_training":true,"extra_credits_per_10k":2
}'::jsonb,true,6),
('ultimate','Ultimate','annual',9990,'price_ultimate_annual',
 '{"discount_pct":17,"users":-1,"ai_credits":24000000}'::jsonb,true,6)
ON CONFLICT DO NOTHING;

-- ── 2. SSO CONFIGURATIONS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sso_configs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            uuid NOT NULL UNIQUE,
  provider                text NOT NULL CHECK(provider IN('google','microsoft','okta','azure_ad','saml','generic_oidc')),
  client_id               text,
  client_secret_encrypted text,
  tenant_id               text,
  issuer_url              text,
  metadata_url            text,
  allowed_domains         text[] NOT NULL DEFAULT '{}',
  attribute_mapping       jsonb NOT NULL DEFAULT '{"email":"email","name":"name"}',
  is_active               boolean NOT NULL DEFAULT false,
  enforce_sso             boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sso_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sso_admin" ON public.sso_configs FOR ALL USING(
  EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN('admin','super_admin'))
);

-- ── 3. IP WHITELIST ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ip_whitelist(
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  ip_cidr         text NOT NULL,
  label           text,
  is_active       boolean NOT NULL DEFAULT true,
  added_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,ip_cidr)
);
ALTER TABLE public.ip_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ip_whitelist_members" ON public.ip_whitelist FOR ALL USING(
  EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=ip_whitelist.workspace_id AND user_id=auth.uid())
);

CREATE OR REPLACE FUNCTION public.is_ip_allowed(p_workspace_id uuid,p_ip text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.ip_whitelist WHERE workspace_id=p_workspace_id AND is_active=true) THEN RETURN true; END IF;
  RETURN EXISTS(SELECT 1 FROM public.ip_whitelist WHERE workspace_id=p_workspace_id AND is_active=true AND (ip_cidr=p_ip OR p_ip LIKE split_part(ip_cidr,'.',1)||'.'||split_part(ip_cidr,'.',2)||'.%'));
END;$$;

-- ── 4. AUDIT LOG ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log(
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action          text NOT NULL,
  resource_type   text NOT NULL,
  resource_id     text,
  old_values      jsonb,
  new_values      jsonb,
  ip_address      text,
  user_agent      text,
  severity        text NOT NULL DEFAULT 'info' CHECK(severity IN('info','warning','critical','security')),
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_ws ON public.audit_log(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_sev ON public.audit_log(severity,created_at DESC) WHERE severity IN('warning','critical','security');
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin" ON public.audit_log FOR SELECT USING(
  EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN('admin','super_admin'))
);

CREATE OR REPLACE FUNCTION public.log_audit(
  p_workspace_id uuid,p_user_id uuid,p_action text,p_resource_type text,
  p_resource_id text DEFAULT NULL,p_old_values jsonb DEFAULT NULL,
  p_new_values jsonb DEFAULT NULL,p_ip text DEFAULT NULL,p_severity text DEFAULT 'info'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.audit_log(workspace_id,user_id,action,resource_type,resource_id,old_values,new_values,ip_address,severity)
  VALUES(p_workspace_id,p_user_id,p_action,p_resource_type,p_resource_id,p_old_values,p_new_values,p_ip,p_severity);
END;$$;

-- ── 5. CUSTOM OBJECTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_object_types(
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  name            text NOT NULL,
  api_name        text NOT NULL,
  icon            text DEFAULT 'database',
  color           text DEFAULT '#6b7280',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,api_name)
);
CREATE TABLE IF NOT EXISTS public.custom_fields(
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  object_type_id  uuid NOT NULL REFERENCES public.custom_object_types(id) ON DELETE CASCADE,
  name            text NOT NULL,
  api_name        text NOT NULL,
  field_type      text NOT NULL DEFAULT 'text'
    CHECK(field_type IN('text','number','date','boolean','select','multi_select','email','phone','url','textarea','relation')),
  is_required     boolean NOT NULL DEFAULT false,
  default_value   text,
  options         jsonb,
  display_order   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(object_type_id,api_name)
);
CREATE TABLE IF NOT EXISTS public.custom_object_records(
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  object_type_id  uuid NOT NULL REFERENCES public.custom_object_types(id) ON DELETE CASCADE,
  data            jsonb NOT NULL DEFAULT '{}',
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_rec_type ON public.custom_object_records(object_type_id,created_at DESC);
ALTER TABLE public.custom_object_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_object_records ENABLE ROW LEVEL SECURITY;

-- ── 6. MULTI-AGENT TASKS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_agent_tasks(
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  task_type       text NOT NULL CHECK(task_type IN('sales','marketing','customer_success','ceo_assist','coaching','consulting','lead_scoring','content','research')),
  agent_name      text NOT NULL,
  input           jsonb NOT NULL DEFAULT '{}',
  output          jsonb,
  status          text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','running','completed','failed')),
  parent_task_id  uuid REFERENCES public.ai_agent_tasks(id) ON DELETE SET NULL,
  tokens_used     integer DEFAULT 0,
  cost_usd        numeric(10,6) DEFAULT 0,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_ws ON public.ai_agent_tasks(workspace_id,status,created_at DESC);
ALTER TABLE public.ai_agent_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_tasks_workspace" ON public.ai_agent_tasks FOR ALL USING(
  EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=ai_agent_tasks.workspace_id AND user_id=auth.uid())
);

-- ── 7. INTEGRATION WIZARD STATUS ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_status(
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL UNIQUE,
  integrations    jsonb NOT NULL DEFAULT '{}',
  onboarding_step integer NOT NULL DEFAULT 1,
  onboarding_done boolean NOT NULL DEFAULT false,
  ai_setup_done   boolean NOT NULL DEFAULT false,
  last_checked    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integration_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "int_status_workspace" ON public.integration_status FOR ALL USING(
  EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=integration_status.workspace_id AND user_id=auth.uid())
);

-- ── 8. SLA TRACKING ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sla_incidents(
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid,
  service         text NOT NULL,
  started_at      timestamptz NOT NULL,
  resolved_at     timestamptz,
  duration_min    integer GENERATED ALWAYS AS(
    CASE WHEN resolved_at IS NOT NULL THEN EXTRACT(EPOCH FROM (resolved_at-started_at))/60::integer ELSE NULL END
  ) STORED,
  impact          text CHECK(impact IN('low','medium','high','critical')),
  description     text,
  credit_pct      numeric(5,2) DEFAULT 0
);
ALTER TABLE public.sla_incidents ENABLE ROW LEVEL SECURITY;
