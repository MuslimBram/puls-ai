-- supabase/migrations/0153_phases_4_5_7_complete.sql
-- ============================================================
-- FAZA 4 — Client Success (55% → 100%)
-- FAZA 5 — Administration (70% → 100%)
-- FAZA 7 — CEO Dashboard (60% → 100%)
-- ============================================================

-- ================================================================
-- FAZA 4: CLIENT SUCCESS
-- ================================================================

-- ── 4.1 Reminder Rules ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminder_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL,
  name              text NOT NULL,
  trigger_event     text NOT NULL
                    CHECK (trigger_event IN (
                      'purchase_made',       -- X ditë pas blerjes
                      'trial_started',       -- X ditë pas trial start
                      'trial_ending',        -- X ditë para skadimit trial
                      'subscription_renewing',-- X ditë para renewal
                      'subscription_expired',-- X ditë pas skadimit
                      'no_activity',         -- X ditë pa asnjë aktivitet
                      'onboarding_incomplete'-- X ditë pa kompletuar onboarding
                    )),
  delay_days        integer NOT NULL DEFAULT 0,
  channel           text NOT NULL DEFAULT 'email'
                    CHECK (channel IN ('email','whatsapp','sms','push')),
  subject           text,
  body_template     text NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── 4.2 Reminder Log ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminder_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           uuid NOT NULL REFERENCES public.reminder_rules(id) ON DELETE CASCADE,
  user_id           uuid,
  contact_email     text NOT NULL,
  trigger_event     text NOT NULL,
  channel           text NOT NULL,
  status            text NOT NULL DEFAULT 'sent'
                    CHECK (status IN ('sent','delivered','failed','opened')),
  sent_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rule_id, contact_email, trigger_event, DATE(sent_at))
);

-- ── 4.3 Onboarding Checklist ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id      uuid,
  -- Hapat
  profile_completed     boolean NOT NULL DEFAULT false,
  channel_connected     boolean NOT NULL DEFAULT false,
  first_scan_done       boolean NOT NULL DEFAULT false,
  ai_test_done          boolean NOT NULL DEFAULT false,
  first_reply_sent      boolean NOT NULL DEFAULT false,
  team_invited          boolean NOT NULL DEFAULT false,
  plan_selected         boolean NOT NULL DEFAULT false,
  -- Koha
  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  completion_pct        integer GENERATED ALWAYS AS (
    (CASE WHEN profile_completed THEN 1 ELSE 0 END +
     CASE WHEN channel_connected THEN 1 ELSE 0 END +
     CASE WHEN first_scan_done   THEN 1 ELSE 0 END +
     CASE WHEN ai_test_done      THEN 1 ELSE 0 END +
     CASE WHEN first_reply_sent  THEN 1 ELSE 0 END +
     CASE WHEN plan_selected     THEN 1 ELSE 0 END) * 100 / 6
  ) STORED,
  UNIQUE(user_id)
);

-- Trigger: auto-create kur regjistrohet user i ri
CREATE OR REPLACE FUNCTION public.create_onboarding_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.onboarding_progress(user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_on_signup ON auth.users;
CREATE TRIGGER trg_onboarding_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_onboarding_progress();

-- ── 4.4 Client Reports (raportet periodike per klient) ──────────
CREATE TABLE IF NOT EXISTS public.client_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  report_type       text NOT NULL DEFAULT 'monthly'
                    CHECK (report_type IN ('weekly','monthly','quarterly')),
  metrics           jsonb NOT NULL DEFAULT '{}',
  -- p.sh. {"conversations":120, "ai_replies":98, "leads_captured":15}
  generated_at      timestamptz NOT NULL DEFAULT now(),
  sent_to_email     text,
  sent_at           timestamptz,
  UNIQUE(workspace_id, period_start, report_type)
);

-- ================================================================
-- FAZA 5: ADMINISTRATION
-- ================================================================

-- ── 5.1 Invoices ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL,
  invoice_number    text NOT NULL UNIQUE,
  -- Klienti
  client_name       text NOT NULL,
  client_email      text NOT NULL,
  client_address    text,
  client_tax_id     text,
  -- Detajet
  items             jsonb NOT NULL DEFAULT '[]',
  -- p.sh. [{"description":"Paketa Growth","qty":1,"unit_price":70,"total":70}]
  subtotal          numeric(12,2) NOT NULL DEFAULT 0,
  tax_pct           numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount        numeric(12,2) NOT NULL DEFAULT 0,
  total_amount      numeric(12,2) NOT NULL DEFAULT 0,
  currency          text NOT NULL DEFAULT 'EUR',
  -- Statusi
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  due_date          date,
  paid_at           timestamptz,
  payment_method    text,
  -- PDF
  pdf_url           text,
  pdf_generated_at  timestamptz,
  -- Lidhje me subscription
  subscription_id   uuid,
  notes             text,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Auto invoice number
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1000;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'INV-' || TO_CHAR(now(), 'YYYY') || '-' ||
                          LPAD(nextval('invoice_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.generate_invoice_number();

-- ── 5.2 Contracts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contracts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL,
  title             text NOT NULL,
  client_name       text NOT NULL,
  client_email      text NOT NULL,
  -- Përmbajtja
  body_html         text NOT NULL,
  -- Nënshkrimet
  owner_signed_at   timestamptz,
  client_signed_at  timestamptz,
  client_sign_token text UNIQUE DEFAULT gen_random_uuid()::text,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','signed','expired','cancelled')),
  expires_at        timestamptz DEFAULT (now() + INTERVAL '30 days'),
  -- Lidhje
  invoice_id        uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── 5.3 Tasks ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid,
  title             text NOT NULL,
  description       text,
  assigned_to       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date          timestamptz,
  priority          text DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status            text DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','cancelled')),
  source            text DEFAULT 'manual',
  related_contact_email text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ================================================================
-- FAZA 7: CEO DASHBOARD
-- ================================================================

-- ── 7.1 KPI Snapshots ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kpi_daily_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL,
  snapshot_date     date NOT NULL DEFAULT CURRENT_DATE,
  -- Leads
  new_leads         integer NOT NULL DEFAULT 0,
  qualified_leads   integer NOT NULL DEFAULT 0,
  converted_leads   integer NOT NULL DEFAULT 0,
  -- Biseda
  total_conversations integer NOT NULL DEFAULT 0,
  ai_handled        integer NOT NULL DEFAULT 0,
  human_handled     integer NOT NULL DEFAULT 0,
  ai_handle_rate    numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_conversations > 0
    THEN ROUND(ai_handled * 100.0 / total_conversations, 2)
    ELSE 0 END
  ) STORED,
  -- Revenue
  mrr               numeric(12,2) NOT NULL DEFAULT 0,
  new_revenue       numeric(12,2) NOT NULL DEFAULT 0,
  churn_revenue     numeric(12,2) NOT NULL DEFAULT 0,
  -- Telefonia
  total_calls       integer NOT NULL DEFAULT 0,
  answered_calls    integer NOT NULL DEFAULT 0,
  -- Kanalet
  instagram_msgs    integer NOT NULL DEFAULT 0,
  whatsapp_msgs     integer NOT NULL DEFAULT 0,
  facebook_msgs     integer NOT NULL DEFAULT 0,
  sms_msgs          integer NOT NULL DEFAULT 0,
  -- Automatizimet
  sequences_sent    integer NOT NULL DEFAULT 0,
  reminders_sent    integer NOT NULL DEFAULT 0,
  -- Meta
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, snapshot_date)
);

-- ── 7.2 Meta Ads Cache ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_ads_cache (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL,
  ad_account_id     text NOT NULL,
  date_start        date NOT NULL,
  date_stop         date NOT NULL,
  -- Metrics
  impressions       bigint DEFAULT 0,
  clicks            bigint DEFAULT 0,
  spend             numeric(12,2) DEFAULT 0,
  reach             bigint DEFAULT 0,
  cpc               numeric(8,4) DEFAULT 0,
  cpm               numeric(8,4) DEFAULT 0,
  ctr               numeric(8,4) DEFAULT 0,
  leads_count       integer DEFAULT 0,
  cost_per_lead     numeric(10,2) DEFAULT 0,
  -- Raw
  raw_data          jsonb DEFAULT '{}',
  synced_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, ad_account_id, date_start, date_stop)
);

-- ── 7.3 Funksioni: gjenero snapshot ditor ──────────────────────
CREATE OR REPLACE FUNCTION public.generate_daily_kpi(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_new_leads integer;
  v_total_conv integer;
  v_ai_handled integer;
BEGIN
  SELECT COUNT(*) INTO v_new_leads
  FROM public.leads WHERE created_at::date = v_today;

  SELECT COUNT(*) INTO v_total_conv
  FROM public.conversations WHERE created_at::date = v_today;

  SELECT COUNT(*) INTO v_ai_handled
  FROM public.conversations
  WHERE created_at::date = v_today AND status = 'ai_handling';

  INSERT INTO public.kpi_daily_snapshots (
    workspace_id, snapshot_date,
    new_leads, total_conversations, ai_handled
  ) VALUES (
    p_workspace_id, v_today,
    v_new_leads, v_total_conv, v_ai_handled
  )
  ON CONFLICT (workspace_id, snapshot_date) DO UPDATE SET
    new_leads           = EXCLUDED.new_leads,
    total_conversations = EXCLUDED.total_conversations,
    ai_handled          = EXCLUDED.ai_handled,
    created_at          = now();
END;
$$;

-- ── RLS për të gjitha tabelat ────────────────────────────────────
DO $$ 
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'reminder_rules','reminder_log','onboarding_progress',
    'client_reports','invoices','contracts','tasks',
    'kpi_daily_snapshots','meta_ads_cache'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END; $$;
