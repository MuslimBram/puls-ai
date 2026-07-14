-- supabase/migrations/0151_phase1_lead_capture_complete.sql
-- ============================================================
-- FAZA 1 — Lead Capture i plotë (85% → 100%)
-- ============================================================

-- ----------------------------------------------------------------
-- 1. TABELA PUBLIC_LEADS (vizitorë pa llogari)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Të dhënat bazë
  name                 text NOT NULL,
  email                text NOT NULL,
  phone                text,
  business_name        text,
  message              text,
  -- Interesi
  interested_plan      text,
  team_size            text,
  -- AI Analysis
  ai_score             numeric(3,2) NOT NULL DEFAULT 0.5
                       CHECK (ai_score >= 0 AND ai_score <= 1),
  ai_intent            text NOT NULL DEFAULT 'warm'
                       CHECK (ai_intent IN ('cold','warm','hot')),
  ai_notes             text,
  -- Statusi
  status               text NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new','contacted','qualified','converted','lost')),
  assigned_to          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Tracking
  source               text NOT NULL DEFAULT 'website',
  utm_source           text,
  utm_medium           text,
  utm_campaign         text,
  page_url             text,
  ip_address           text,
  -- Lidhja me workspace (nëse ka)
  target_workspace_id  uuid,
  -- Meta
  notes                text,
  followed_up_at       timestamptz,
  converted_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Index për kërkim të shpejtë
CREATE INDEX IF NOT EXISTS idx_public_leads_email
  ON public.public_leads(email);
CREATE INDEX IF NOT EXISTS idx_public_leads_status
  ON public.public_leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_leads_score
  ON public.public_leads(ai_score DESC)
  WHERE status = 'new';

-- RLS: vetëm admin dhe super_admin shohin leads publike
ALTER TABLE public.public_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_see_public_leads" ON public.public_leads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- Edge function mund të inserojë pa RLS (service_role)
-- Nuk kërkohet policy INSERT për anon — thirret nga Edge Function me service_role

-- ----------------------------------------------------------------
-- 2. ZGJERIMI I enterprise_leads (shto fusha që mungojnë)
-- ----------------------------------------------------------------
ALTER TABLE public.enterprise_leads
  ADD COLUMN IF NOT EXISTS phone        text,
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS ai_score     numeric(3,2) DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS ai_intent    text DEFAULT 'warm',
  ADD COLUMN IF NOT EXISTS ai_notes     text,
  ADD COLUMN IF NOT EXISTS followed_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_to  uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------
-- 3. ZGJERIMI I leads (shto fusha për lead scoring)
-- ----------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_name    text,
  ADD COLUMN IF NOT EXISTS contact_email   text,
  ADD COLUMN IF NOT EXISTS contact_phone   text,
  ADD COLUMN IF NOT EXISTS business_name   text,
  ADD COLUMN IF NOT EXISTS intent_type     text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS urgency_level   text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS recommended_action text DEFAULT 'monitor',
  ADD COLUMN IF NOT EXISTS followed_up_at  timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_to     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS deal_value      numeric(12,2);

-- ----------------------------------------------------------------
-- 4. VIEW: të gjitha leads bashkë (publike + interne)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW public.all_leads_unified AS
SELECT
  'public'::text        AS lead_type,
  id,
  name,
  email,
  phone,
  business_name,
  message,
  ai_score,
  ai_intent             AS intent,
  status,
  source,
  utm_source,
  utm_campaign,
  assigned_to,
  followed_up_at,
  converted_at,
  created_at
FROM public.public_leads
UNION ALL
SELECT
  'enterprise'::text    AS lead_type,
  id,
  name,
  email,
  phone,
  company_name          AS business_name,
  message,
  COALESCE(ai_score, 0.5),
  COALESCE(ai_intent, 'warm') AS intent,
  status,
  source,
  utm_source,
  utm_campaign,
  assigned_to,
  followed_up_at,
  NULL                  AS converted_at,
  created_at
FROM public.enterprise_leads;

-- ----------------------------------------------------------------
-- 5. TRIGGER: updated_at automatik
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_public_leads_updated
  BEFORE UPDATE ON public.public_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------
-- 6. FUNKSION: statistika leads per admin dashboard
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_lead_stats()
RETURNS TABLE(
  total_leads    bigint,
  new_leads      bigint,
  hot_leads      bigint,
  converted      bigint,
  avg_score      numeric,
  this_week      bigint,
  last_week      bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COUNT(*)                                              AS total_leads,
    COUNT(*) FILTER (WHERE status = 'new')               AS new_leads,
    COUNT(*) FILTER (WHERE ai_score >= 0.7)              AS hot_leads,
    COUNT(*) FILTER (WHERE status = 'converted')         AS converted,
    ROUND(AVG(ai_score)::numeric, 2)                     AS avg_score,
    COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '7 days')  AS this_week,
    COUNT(*) FILTER (
      WHERE created_at >= now() - INTERVAL '14 days'
        AND created_at < now() - INTERVAL '7 days'
    )                                                     AS last_week
  FROM public.public_leads;
$$;
