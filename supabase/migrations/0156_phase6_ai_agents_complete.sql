-- supabase/migrations/0156_phase6_ai_agents_complete.sql
-- ============================================================
-- FAZA 6 — AI Agents i plotë (88% → 100%)
-- + pg_cron jobs për të gjitha automatizimet
-- ============================================================

-- ── 1. AI AGENT CONFIGURATIONS per workspace ─────────────────
CREATE TABLE IF NOT EXISTS public.ai_agent_configs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL UNIQUE,
  -- Personaliteti
  agent_name            text NOT NULL DEFAULT 'Asistenti',
  agent_tone            text NOT NULL DEFAULT 'professional_friendly'
                        CHECK (agent_tone IN (
                          'professional_friendly',
                          'formal',
                          'casual',
                          'enthusiastic',
                          'empathetic'
                        )),
  language              text NOT NULL DEFAULT 'sq',
  -- Limitet
  max_ai_replies_per_conv integer NOT NULL DEFAULT 10,
  handoff_keywords      text[] NOT NULL DEFAULT ARRAY['njeri','agjent','operator','human'],
  -- Kontrollet
  auto_reply_enabled    boolean NOT NULL DEFAULT true,
  auto_reply_delay_sec  integer NOT NULL DEFAULT 3,
  proactive_offers      boolean NOT NULL DEFAULT true,
  memory_enabled        boolean NOT NULL DEFAULT true,
  -- Kanalet aktive
  instagram_enabled     boolean NOT NULL DEFAULT false,
  whatsapp_enabled      boolean NOT NULL DEFAULT false,
  facebook_enabled      boolean NOT NULL DEFAULT false,
  telegram_enabled      boolean NOT NULL DEFAULT false,
  sms_enabled           boolean NOT NULL DEFAULT false,
  -- Business context (plotësohet nga scanner)
  business_description  text,
  business_hours        jsonb DEFAULT '{}',
  custom_instructions   text,
  -- Meta
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Krijo config default kur krijohet workspace
CREATE OR REPLACE FUNCTION public.create_default_agent_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.ai_agent_configs (workspace_id)
  VALUES (NEW.id)
  ON CONFLICT (workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── 2. AI TRAINING DATA (FAQ + Answers per workspace) ────────
CREATE TABLE IF NOT EXISTS public.ai_training_data (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  type          text NOT NULL DEFAULT 'faq'
                CHECK (type IN ('faq','product','policy','objection_handler','custom')),
  question      text,
  answer        text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  priority      integer NOT NULL DEFAULT 5,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_workspace
  ON public.ai_training_data(workspace_id, type, is_active);

-- ── 3. CHANNEL WEBHOOK MAPPING ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.channel_webhooks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  workspace_id    uuid NOT NULL,
  platform        text NOT NULL,
  webhook_url     text NOT NULL,
  verify_token    text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  is_active       boolean NOT NULL DEFAULT true,
  last_received_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 4. pg_cron JOBS ──────────────────────────────────────────
-- Kërkon pg_cron extension (aktivizo te Supabase Dashboard → Database → Extensions)
-- Pas aktivizimit, ekzekuto manualisht:

-- SELECT cron.schedule('sequence-engine',      '*/30 * * * *',  $$SELECT net.http_post(url:=current_setting('app.supabase_url')||'/functions/v1/sales-sequence-engine', headers:='{"Authorization":"Bearer '||current_setting('app.service_role_key')||'"}')$$);
-- SELECT cron.schedule('client-reminders',     '0 9 * * *',     $$SELECT net.http_post(url:=current_setting('app.supabase_url')||'/functions/v1/client-success-reminders', headers:='{"Authorization":"Bearer '||current_setting('app.service_role_key')||'"}')$$);
-- SELECT cron.schedule('memory-decay',         '0 2 * * *',     $$SELECT decay_memory_confidence()$$);
-- SELECT cron.schedule('lead-scoring',         '0 * * * *',     $$SELECT net.http_post(url:=current_setting('app.supabase_url')||'/functions/v1/score-and-rank-leads', body:='{"business_id":null}', headers:='{"Authorization":"Bearer '||current_setting('app.service_role_key')||'"}')$$);
-- SELECT cron.schedule('cleanup-sessions',     '*/15 * * * *',  $$SELECT cleanup_stale_sessions()$$);
-- SELECT cron.schedule('approval-expiry',      '*/5 * * * *',   $$UPDATE device_approval_requests SET status='expired' WHERE status='pending' AND expires_at < now()$$);
-- SELECT cron.schedule('kpi-snapshot',         '0 0 * * *',     $$SELECT generate_daily_kpi(workspace_id) FROM workspaces$$);

-- ── 5. INSTRUCTIONS VIEW — kombinon të gjitha knowledge sources ─
CREATE OR REPLACE VIEW public.agent_full_context AS
SELECT
  c.workspace_id,
  c.agent_name,
  c.agent_tone,
  c.language,
  c.auto_reply_enabled,
  c.handoff_keywords,
  c.business_description,
  c.business_hours,
  c.custom_instructions,
  c.memory_enabled,
  c.proactive_offers,
  -- FAQ count
  (SELECT COUNT(*) FROM public.ai_training_data t
   WHERE t.workspace_id = c.workspace_id AND t.is_active = true) AS knowledge_items,
  -- Memory count
  (SELECT COUNT(*) FROM public.business_memory m
   WHERE m.business_id = c.workspace_id AND m.confidence > 0.4) AS memory_items,
  c.updated_at
FROM public.ai_agent_configs c;

-- ── 6. RLS ────────────────────────────────────────────────────
ALTER TABLE public.ai_agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_training_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_agent_config" ON public.ai_agent_configs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = ai_agent_configs.workspace_id
              AND wm.user_id = auth.uid())
  );

CREATE POLICY "workspace_training_data" ON public.ai_training_data
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = ai_training_data.workspace_id
              AND wm.user_id = auth.uid())
  );
