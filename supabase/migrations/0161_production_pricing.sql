-- supabase/migrations/0161_production_pricing.sql
-- PRICING REALE 2026 + AI Credits System + Odoo fields

TRUNCATE TABLE public.pricing_settings;

INSERT INTO public.pricing_settings (plan_key,plan_name,billing_period,price,stripe_price_id,features,is_active,display_order) VALUES
('free','Free','monthly',0,null,'{"users":1,"ai_credits":100,"storage_gb":1,"contacts":500,"emails_per_month":500,"sms_per_month":0,"channels":["instagram"],"crm":"basic","marketing_automation":false,"sales_funnels":0,"ai_agents":1,"ai_images_month":10,"ai_video_month":0,"ai_audio_min":10,"white_label":false,"odoo_integration":false,"api_access":false,"webhooks":0,"support":"community","sla":null,"price_monthly":0,"price_annual":0}'::jsonb,true,1),
('starter','Starter','monthly',29,'price_starter_monthly','{"users":3,"ai_credits":5000,"storage_gb":10,"contacts":5000,"emails_per_month":10000,"sms_per_month":500,"channels":["instagram","whatsapp","facebook","telegram"],"crm":"full","marketing_automation":"basic","sales_funnels":3,"ai_agents":3,"ai_images_month":100,"ai_video_month":5,"ai_audio_min":100,"white_label":false,"odoo_integration":"basic","api_access":false,"webhooks":0,"support":"24h_email","sla":"99.5","price_monthly":29,"price_annual":290,"extra_credits_per_10k":10}'::jsonb,true,2),
('starter','Starter','annual',290,'price_starter_annual','{"discount_pct":17,"users":3,"ai_credits":60000}'::jsonb,true,2),
('growth','Growth','monthly',99,'price_growth_monthly','{"users":10,"ai_credits":25000,"storage_gb":50,"contacts":25000,"emails_per_month":50000,"sms_per_month":2500,"channels":["instagram","whatsapp","facebook","telegram","google"],"crm":"full","marketing_automation":"advanced","sales_funnels":25,"ai_agents":10,"ai_images_month":500,"ai_video_month":25,"ai_audio_min":500,"white_label":true,"odoo_integration":"full","api_access":true,"webhooks":10,"support":"4h_email","sla":"99.9","price_monthly":99,"price_annual":990,"extra_credits_per_10k":8}'::jsonb,true,3),
('growth','Growth','annual',990,'price_growth_annual','{"discount_pct":17,"users":10,"ai_credits":300000}'::jsonb,true,3),
('pro','Pro','monthly',299,'price_pro_monthly','{"users":25,"ai_credits":100000,"storage_gb":250,"contacts":100000,"emails_per_month":250000,"sms_per_month":10000,"channels":["instagram","whatsapp","facebook","telegram","google","email","sms"],"crm":"full","marketing_automation":"advanced","sales_funnels":100,"ai_agents":25,"ai_images_month":2000,"ai_video_month":100,"ai_audio_min":2000,"white_label":true,"multi_brand":5,"odoo_integration":"full","api_access":true,"webhooks":50,"support":"2h_priority","sla":"99.95","price_monthly":299,"price_annual":2990,"extra_credits_per_10k":6}'::jsonb,true,4),
('pro','Pro','annual',2990,'price_pro_annual','{"discount_pct":17,"users":25,"ai_credits":1200000}'::jsonb,true,4),
('enterprise','Enterprise','monthly',499,'price_enterprise_monthly','{"users":-1,"ai_credits":500000,"storage_gb":1024,"contacts":-1,"emails_per_month":1000000,"sms_per_month":50000,"channels":["all"],"crm":"full","marketing_automation":"enterprise","sales_funnels":-1,"ai_agents":-1,"ai_images_month":10000,"ai_video_month":500,"ai_audio_min":10000,"white_label":true,"multi_brand":-1,"odoo_integration":"enterprise","api_access":true,"webhooks":-1,"support":"24_7_dedicated","sla":"99.99","price_monthly":499,"price_annual":4990,"extra_credits_per_10k":4,"custom_ai_routing":true}'::jsonb,true,5),
('enterprise','Enterprise','annual',4990,'price_enterprise_annual','{"discount_pct":17,"users":-1,"ai_credits":6000000}'::jsonb,true,5);

CREATE TABLE IF NOT EXISTS public.workspace_ai_credits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL UNIQUE,
  total_credits   bigint NOT NULL DEFAULT 0,
  used_credits    bigint NOT NULL DEFAULT 0,
  available       bigint GENERATED ALWAYS AS (total_credits - used_credits) STORED,
  reset_date      date,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  user_id       uuid,
  provider      text NOT NULL,
  task_type     text NOT NULL,
  tokens_in     integer NOT NULL DEFAULT 0,
  tokens_out    integer NOT NULL DEFAULT 0,
  cost_usd      numeric(10,6) NOT NULL DEFAULT 0,
  credits_used  integer NOT NULL DEFAULT 0,
  latency_ms    integer NOT NULL DEFAULT 0,
  tier          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.deduct_ai_credits(p_workspace_id uuid, p_credits integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.workspace_ai_credits
  SET used_credits = used_credits + p_credits, updated_at = now()
  WHERE workspace_id = p_workspace_id AND (total_credits - used_credits) >= p_credits;
  RETURN FOUND;
END; $$;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS odoo_id integer;
ALTER TABLE public.public_leads ADD COLUMN IF NOT EXISTS odoo_id integer;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS source text DEFAULT 'pulse_ai';

ALTER TABLE public.workspace_ai_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
