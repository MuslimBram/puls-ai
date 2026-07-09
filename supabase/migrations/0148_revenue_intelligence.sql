-- ============================================================
-- REVENUE INTELLIGENCE LAYER
-- Pulse AI 2.0 — Motori i inteligjencës së shitjeve
-- ============================================================
-- Integrohet me: businesses, customers, conversations,
--                messages, business_memory, service_packages
-- ============================================================

-- ----------------------------------------------------------------
-- 1. ENUM-ET
-- ----------------------------------------------------------------

CREATE TYPE lead_stage AS ENUM (
  'stranger',      -- nuk ka komunikuar kurrë
  'aware',         -- dërgoi 1 mesazh, nuk u përgjigj ofertës
  'interested',    -- pyet çmime / detaje
  'evaluating',    -- po krahason, pyet shumë
  'ready_to_buy',  -- sinjale të forta blerjeje
  'customer',      -- ka blerë të paktën 1 herë
  'loyal',         -- 3+ blerje ose referim aktiv
  'churned'        -- ishte klient, nuk ka komunikuar 60+ ditë
);

CREATE TYPE signal_type AS ENUM (
  -- Sinjale blerjeje
  'price_inquiry',         -- pyeti çmimin
  'availability_check',    -- pyeti "a keni / a mundeni"
  'urgency_expressed',     -- "duhet sot", "urgjent"
  'comparison_shopping',   -- "ju vs X", "a është më lirë se"
  'multiple_item_interest',-- interes për 2+ produkte njëherësh
  'return_visitor',        -- kthehet pas 24+ orësh

  -- Sinjale upsell
  'purchased_base_tier',   -- bleu paketën bazë
  'high_engagement',       -- mesatarisht 10+ mesazhe/ditë
  'referred_others',       -- ka referuar dikë

  -- Sinjale churn
  'no_response_7d',        -- nuk ka shkruar 7 ditë
  'no_response_30d',       -- nuk ka shkruar 30 ditë
  'complaint_unresolved',  -- ankesë e hapur pa zgjidhje
  'price_objection',       -- tha çmimi është i lartë
  'competitor_mention',    -- përmendi konkurrent

  -- Sinjale referimi
  'expressed_satisfaction',-- "shumë mirë", "jam i kënaqur"
  'asked_about_referral',  -- pyeti si funksionon referimi
  'high_ltv_customer'      -- LTV > 5x çmimi mesatar
);

CREATE TYPE revenue_action_type AS ENUM (
  'send_upsell_offer',      -- dërgo ofertë të nivelit tjetër
  'send_loyalty_reward',    -- dërgo bonus për besnikëri
  'schedule_followup',      -- planifiko kontakt manual
  'send_winback_offer',     -- dërgo ofertë rikthimi
  'request_referral',       -- kërko referim
  'flag_for_human',         -- stafi duhet kontaktojë vetë
  'do_nothing'              -- nuk ka veprim optimal akoma
);

-- ----------------------------------------------------------------
-- 2. TABELA KRYESORE: customer_revenue_profile
-- ----------------------------------------------------------------
CREATE TABLE customer_revenue_profile (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id           uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Lead scoring (0–100)
  lead_score            integer NOT NULL DEFAULT 0
                        CHECK (lead_score >= 0 AND lead_score <= 100),
  lead_stage            lead_stage NOT NULL DEFAULT 'stranger',

  -- Vlera financiare
  total_revenue_lek     integer NOT NULL DEFAULT 0,   -- sa ka gjeneruar ky klient
  purchase_count        integer NOT NULL DEFAULT 0,
  avg_order_value_lek   integer NOT NULL DEFAULT 0,
  predicted_ltv_lek     integer NOT NULL DEFAULT 0,   -- lifetime value i parashikuar

  -- Sinjalet aktive
  active_signals        signal_type[] NOT NULL DEFAULT '{}',

  -- Aksioni i rekomanduar nga motori
  recommended_action    revenue_action_type NOT NULL DEFAULT 'do_nothing',
  action_reason         text,
  action_priority       integer NOT NULL DEFAULT 0 CHECK (action_priority >= 0 AND action_priority <= 10),

  -- Koha e fundit e aktivitetit
  last_message_at       timestamptz,
  last_purchase_at      timestamptz,
  first_contact_at      timestamptz NOT NULL DEFAULT now(),

  -- Churn risk (0.0–1.0)
  churn_risk_score      numeric(3,2) NOT NULL DEFAULT 0.0,
  churn_risk_updated_at timestamptz NOT NULL DEFAULT now(),

  -- Best time to contact (ora e ditës, 0–23)
  best_contact_hour     integer CHECK (best_contact_hour >= 0 AND best_contact_hour <= 23),

  -- Meta
  last_scored_at        timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_customer_revenue_profile UNIQUE (business_id, customer_id)
);

-- ----------------------------------------------------------------
-- 3. SINJALET E DETEKTUARA (log)
-- ----------------------------------------------------------------
CREATE TABLE revenue_signals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  signal_type       signal_type NOT NULL,
  signal_strength   numeric(3,2) NOT NULL DEFAULT 1.0  -- 0.1 e dobët, 1.0 e fortë
                    CHECK (signal_strength >= 0.0 AND signal_strength <= 1.0),
  detected_from     text NOT NULL, -- 'message', 'inactivity', 'purchase', 'memory'
  message_id        uuid REFERENCES messages(id) ON DELETE SET NULL,
  raw_excerpt       text,          -- fragmenti i mesazhit ku u detektua (max 200 char)
  processed         boolean NOT NULL DEFAULT false,
  detected_at       timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 4. AKSIONET E GJENERUARA
-- ----------------------------------------------------------------
CREATE TABLE revenue_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  action_type       revenue_action_type NOT NULL,
  priority          integer NOT NULL DEFAULT 5 CHECK (priority >= 0 AND priority <= 10),

  -- Konteksti
  triggered_by      signal_type[],   -- cilat sinjale e nxorën
  lead_score_at_time integer,
  churn_risk_at_time numeric(3,2),

  -- Propozimi konkret (nëse ka)
  proposed_offer_id uuid REFERENCES service_recommendations(id) ON DELETE SET NULL,
  custom_message    text,            -- mesazh i personalizuar i sugjeruar

  -- Statusi
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','dismissed','converted')),
  sent_at           timestamptz,
  result_revenue_lek integer,        -- mbushet kur konvertohet
  dismissed_reason  text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 5. STATISTIKA PER-BIZNES (Dashboard)
-- ----------------------------------------------------------------
CREATE TABLE business_revenue_stats (
  business_id               uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,

  -- Pipeline aktuale
  total_leads               integer NOT NULL DEFAULT 0,
  hot_leads_count           integer NOT NULL DEFAULT 0,  -- score > 70
  at_risk_customers         integer NOT NULL DEFAULT 0,  -- churn_risk > 0.6
  upsell_opportunities      integer NOT NULL DEFAULT 0,

  -- Financiare (muaji aktual)
  mrr_lek                   integer NOT NULL DEFAULT 0,
  revenue_this_month_lek    integer NOT NULL DEFAULT 0,
  revenue_last_month_lek    integer NOT NULL DEFAULT 0,
  revenue_growth_pct        numeric(5,2) NOT NULL DEFAULT 0.0,

  -- Konvertimet
  ai_offer_conversion_rate  numeric(4,2) NOT NULL DEFAULT 0.0, -- %
  avg_lead_score            numeric(5,2) NOT NULL DEFAULT 0.0,

  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 6. INDEKSE
-- ----------------------------------------------------------------

-- Leads me score të lartë (dashboard "Hot Leads")
CREATE INDEX idx_crp_hot_leads
  ON customer_revenue_profile(business_id, lead_score DESC)
  WHERE lead_score > 50;

-- Klientë në rrezik churn
CREATE INDEX idx_crp_churn_risk
  ON customer_revenue_profile(business_id, churn_risk_score DESC)
  WHERE churn_risk_score > 0.5;

-- Sinjale të pa-processuara
CREATE INDEX idx_signals_unprocessed
  ON revenue_signals(business_id, detected_at DESC)
  WHERE processed = false;

-- Aksione pending (Dashboard "To Do")
CREATE INDEX idx_actions_pending
  ON revenue_actions(business_id, priority DESC, created_at DESC)
  WHERE status = 'pending';

-- Best contact time (për dërgime të optimizuara)
CREATE INDEX idx_crp_contact_hour
  ON customer_revenue_profile(business_id, best_contact_hour)
  WHERE best_contact_hour IS NOT NULL;

-- ----------------------------------------------------------------
-- 7. RLS
-- ----------------------------------------------------------------
ALTER TABLE customer_revenue_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_revenue_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY crp_business_member ON customer_revenue_profile
  FOR ALL USING (
    EXISTS (SELECT 1 FROM business_members bm
            WHERE bm.business_id = customer_revenue_profile.business_id
              AND bm.user_id = auth.uid())
  );

CREATE POLICY signals_business_member ON revenue_signals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM business_members bm
            WHERE bm.business_id = revenue_signals.business_id
              AND bm.user_id = auth.uid())
  );

CREATE POLICY actions_business_member ON revenue_actions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM business_members bm
            WHERE bm.business_id = revenue_actions.business_id
              AND bm.user_id = auth.uid())
  );

CREATE POLICY stats_business_member ON business_revenue_stats
  FOR ALL USING (
    EXISTS (SELECT 1 FROM business_members bm
            WHERE bm.business_id = business_revenue_stats.business_id
              AND bm.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- 8. TRIGGER: updated_at automatik
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_crp_updated
  BEFORE UPDATE ON customer_revenue_profile
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_actions_updated
  BEFORE UPDATE ON revenue_actions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ----------------------------------------------------------------
-- 9. FUNKSIONI I LLOGARITJES SË LEAD SCORE
-- (SQL e pastër — thirrur nga Edge Function ose direkt)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_lead_score(
  p_purchase_count      integer,
  p_total_revenue_lek   integer,
  p_days_since_contact  integer,   -- sa ditë kanë kaluar nga mesazhi i fundit
  p_active_signals      signal_type[]
) RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  score integer := 0;
BEGIN
  -- Baza: blerjet e kaluara (max 30 pikë)
  score := score + LEAST(30, p_purchase_count * 10);

  -- Vlera financiare (max 20 pikë)
  score := score + CASE
    WHEN p_total_revenue_lek > 50000 THEN 20
    WHEN p_total_revenue_lek > 20000 THEN 15
    WHEN p_total_revenue_lek > 5000  THEN 10
    WHEN p_total_revenue_lek > 0     THEN 5
    ELSE 0
  END;

  -- Aktiviteti i fundit (max 20 pikë)
  score := score + CASE
    WHEN p_days_since_contact <= 1  THEN 20
    WHEN p_days_since_contact <= 7  THEN 15
    WHEN p_days_since_contact <= 30 THEN 8
    WHEN p_days_since_contact <= 60 THEN 3
    ELSE 0
  END;

  -- Sinjale aktive (max 30 pikë)
  IF 'urgency_expressed'      = ANY(p_active_signals) THEN score := score + 15; END IF;
  IF 'price_inquiry'          = ANY(p_active_signals) THEN score := score + 10; END IF;
  IF 'availability_check'     = ANY(p_active_signals) THEN score := score + 8;  END IF;
  IF 'multiple_item_interest' = ANY(p_active_signals) THEN score := score + 12; END IF;
  IF 'return_visitor'         = ANY(p_active_signals) THEN score := score + 7;  END IF;
  IF 'comparison_shopping'    = ANY(p_active_signals) THEN score := score + 6;  END IF;
  IF 'expressed_satisfaction' = ANY(p_active_signals) THEN score := score + 5;  END IF;

  -- Sinjale negative
  IF 'price_objection'   = ANY(p_active_signals) THEN score := score - 10; END IF;
  IF 'competitor_mention'= ANY(p_active_signals) THEN score := score - 8;  END IF;
  IF 'no_response_30d'   = ANY(p_active_signals) THEN score := score - 15; END IF;

  RETURN GREATEST(0, LEAST(100, score));
END;
$$;

-- ----------------------------------------------------------------
-- 10. pg_cron: reskor çdo orë + zbulo inaktivitet
-- ----------------------------------------------------------------
-- SELECT cron.schedule('revenue-signals-hourly', '0 * * * *',
--   'SELECT detect_inactivity_signals()');
