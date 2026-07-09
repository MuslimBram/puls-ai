-- ============================================================
-- CUSTOMER JOURNEY INTELLIGENCE
-- Pulse AI 2.0 — Shtresa e udhëtimit të klientit
-- ============================================================
-- Integrohet me:
--   customers, conversations, messages,
--   customer_revenue_profile, business_memory
-- ============================================================

-- ----------------------------------------------------------------
-- 1. FAZAT E UDHËTIMIT
-- ----------------------------------------------------------------
-- Shënim: lead_stage nga revenue_intelligence mbulon blerjet.
-- journey_phase është diçka tjetër — është toni dhe lloji i
-- komunikimit që AI duhet të përdorë, jo vetëm statusi financiar.
-- ----------------------------------------------------------------
CREATE TYPE journey_phase AS ENUM (
  'first_touch',     -- mesazhi i parë, nuk di asgjë për ne
  'exploring',       -- po shfleton, pyet, krahason
  'considering',     -- po mendohet seriozisht, ka pyetje specifike
  'converting',      -- tregon sinjale të forta blerjeje / ka blerë
  'onboarding',      -- bleu, tani po mëson si ta përdorë
  'active',          -- klient aktiv dhe i kënaqur
  'at_risk',         -- ka heshtur ose ka treguar pakënaqësi
  'dormant',         -- ishte aktiv, ka kohë që nuk komunikon
  'champion'         -- ka referuar, ka LTV të lartë, dashamirës i markës
);

CREATE TYPE communication_style AS ENUM (
  'welcoming',       -- i ngrohtë, i thjeshtë, pa supozime
  'educational',     -- shpjegues, jo shitës
  'consultative',    -- pyetje, kuptim nevojash, këshilla
  'closing',         -- oferta konkrete, ngut i lehtë
  'supportive',      -- udhëzues, durimtar, teknik
  'nurturing',       -- mirëmbajtës, lajme, tip-e vlera
  'reengaging',      -- rikthyes, me ofertë specifike
  'appreciative'     -- falënderim, ekskluzivitet, VIP
);

CREATE TYPE touchpoint_type AS ENUM (
  'inbound_message',    -- klienti shkroi
  'ai_reply',           -- AI u përgjigj
  'human_reply',        -- stafi u përgjigj
  'offer_sent',         -- u dërgua ofertë
  'offer_accepted',     -- oferta u pranua
  'offer_rejected',     -- oferta u refuzua
  'purchase_made',      -- blerje e konfirmuar
  'complaint_filed',    -- ankesë
  'complaint_resolved', -- ankesë e zgjidhur
  'referral_made',      -- referoi dikë
  'phase_transition',   -- ndryshim i fazës
  'opted_out',          -- çkëputje nga oferta
  'reengaged'           -- u kthye pas heshtjes
);

-- ----------------------------------------------------------------
-- 2. PROFILI I UDHËTIMIT PER-KLIENT
-- ----------------------------------------------------------------
CREATE TABLE customer_journey (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id           uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Faza aktuale
  current_phase         journey_phase NOT NULL DEFAULT 'first_touch',
  phase_started_at      timestamptz NOT NULL DEFAULT now(),
  days_in_current_phase integer NOT NULL DEFAULT 0,

  -- Si duhet komunikuar me këtë klient
  communication_style   communication_style NOT NULL DEFAULT 'welcoming',

  -- Metrikat e udhëtimit
  total_touchpoints     integer NOT NULL DEFAULT 0,
  response_rate         numeric(4,2) NOT NULL DEFAULT 0.0,  -- % e mesazheve të AI ku klienti u përgjigj
  avg_response_time_min integer NOT NULL DEFAULT 0,          -- minuta mesatare për t'u përgjigjur
  satisfaction_score    numeric(3,1),                        -- 1.0–5.0, nxirret nga analiza e bisedave

  -- Konteksti i fazës (çfarë ndodhi që shkaktoi tranzicionin e fundit)
  phase_trigger         text,
  phase_notes           text,

  -- Parashikime
  predicted_next_phase  journey_phase,
  next_phase_probability numeric(3,2) DEFAULT 0.0,
  predicted_at          timestamptz,

  -- Meta
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_customer_journey UNIQUE (business_id, customer_id)
);

-- ----------------------------------------------------------------
-- 3. HISTORIA E TRANZICIONEVE
-- ----------------------------------------------------------------
CREATE TABLE journey_transitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  from_phase      journey_phase,
  to_phase        journey_phase NOT NULL,
  trigger_type    touchpoint_type NOT NULL,
  trigger_details text,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  transitioned_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 4. LOG I PIKAVE TË KONTAKTIT (Touchpoints)
-- ----------------------------------------------------------------
CREATE TABLE journey_touchpoints (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  touchpoint_type   touchpoint_type NOT NULL,
  conversation_id   uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message_id        uuid REFERENCES messages(id) ON DELETE SET NULL,
  value_lek         integer DEFAULT 0,   -- vlera financiare e kësaj pike (p.sh. blerje)
  sentiment         text CHECK (sentiment IN ('positive','neutral','negative')),
  notes             text,
  occurred_at       timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 5. RREGULLAT E KOMUNIKIMIT PER-FAZË
-- (Të lexuara nga AI para çdo përgjigje)
-- ----------------------------------------------------------------
CREATE TABLE journey_communication_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase               journey_phase NOT NULL,
  style               communication_style NOT NULL,

  -- Udhëzime për AI
  tone_instruction    text NOT NULL,   -- si duhet të tingëllojë
  what_to_do          text NOT NULL,   -- çfarë duhet të bëjë AI
  what_to_avoid       text NOT NULL,   -- çfarë NUK duhet të bëjë AI
  example_opener      text,            -- shembull i hapjes së mesazhit

  -- Kur kalon te faza tjetër
  transition_signals  text NOT NULL,   -- çfarë sinjal shkakton tranzicion

  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 6. SEED DATA: Rregullat e komunikimit
-- ----------------------------------------------------------------
INSERT INTO journey_communication_rules
  (phase, style, tone_instruction, what_to_do, what_to_avoid, example_opener, transition_signals)
VALUES

('first_touch', 'welcoming',
 'I ngrohtë, i thjeshtë, mirëpritës. Mos supuzo asgjë për klientin.',
 'Prezanto biznesin shkurt. Pyet çfarë mund të ndihmosh. Jep 1-2 informacione kyçe (produkte, orar) pa mbingarkuar.',
 'Mos dërgo lista të gjata. Mos ofrosh zbritje menjëherë. Mos pyet shumë pyetje njëherësh.',
 'Mirë se vini! Jam këtu për çdo pyetje. Si mund t''ju ndihmoj sot?',
 'Klienti bën 2+ pyetje specifike → kaloj te exploring'),

('exploring', 'educational',
 'Informues, i qartë, pa presion. Si një shok që di shumë për produktin.',
 'Shpjego produktet/shërbimet me detaje konkrete. Jep çmime kur pyeten. Sugjero produktin që i përshtatet nevojës.',
 'Mos shtyp për blerje. Mos dërgo oferta me zbritje. Mos jep shumë opsione njëherësh (max 2-3).',
 'Sigurisht! Ja çfarë ofrojmë dhe çmimet tona...',
 'Klienti pyet çmim specifik ose tregon interes konkret → kaloj te considering'),

('considering', 'consultative',
 'Këshillues, si ekspert që ndihmon të marrësh vendimin e duhur.',
 'Pyet çfarë kanë nevojë saktësisht. Krahaso opsionet sipas nevojës së tyre. Trajtoji dyshimet me fakte.',
 'Mos shtyp me urgence false. Mos minimizo dyshimet. Mos dërgo oferta pa kuptuar nevojën.',
 'Kuptoj. Bazuar te çfarë po kërkoni, do ju sugjeroja...',
 'Klienti thotë "po mendohem" / "do e marr" / "sa shpejt" → kaloj te converting'),

('converting', 'closing',
 'I drejtpërdrejtë, konfident, i ndihmës. Bëj të lehtë veprimin.',
 'Konfirmo detajet. Jep hap konkret (si të porosisë / rezervojë / paguajë). Ofroji ndihmë të menjëhershme.',
 'Mos hezito. Mos shto opsione të reja. Mos zgjat bisedën pa qëllim.',
 'Perfekt! Për të vazhduar, ja hapat e thjeshtë...',
 'Konfirmon blerjen / bën pagesën → kaloj te onboarding'),

('onboarding', 'supportive',
 'Mbështetës, durimtar, teknik kur duhet. Fokus: klienti të ketë sukses me blerjen.',
 'Konfirmo porosinë/rezervimin. Jep udhëzime të qarta. Kontrollo pas 24-48 orësh nëse gjithçka është ok.',
 'Mos ofroj produkte të reja menjëherë. Mos supuzo që e di si funksionon. Mos nxito.',
 'Faleminderit! Ja çfarë ndodh tani dhe si mund t''ju ndihmoj...',
 'Klienti konfirmon se gjithçka është ok → kaloj te active'),

('active', 'nurturing',
 'Miqësor, i vlerës, i përshpejtuar. Klienti tashmë të njeh — komunikoji si shok.',
 'Ndaj tip-e/lajme relevante. Kujto opsione që nuk i ka provuar. Dëgjo feedback-un aktiv.',
 'Mos dërgo oferta çdo ditë. Mos bëj të ndihet si "numër". Mos injoron pyetjet e vogla.',
 'Mirë ta shohim sërish! Doja të ndaj diçka të dobishme...',
 'Ndalon komunikimin 14+ ditë → kaloj te at_risk'),

('at_risk', 'reengaging',
 'I shqetësuar me sinqeritet, i drejtpërdrejtë, pa presion komercial.',
 'Kontrollo nëse gjithçka është ok. Pyet nëse ka problem të pazgjidhur. Ofroji vlerë pa kërkuar asgjë.',
 'Mos dërgo oferta komerciale. Mos injoron heshtjen. Mos shtyp.',
 'Kohë ka që nuk dëgjohemi — doja të sigurohesha që gjithçka është mirë...',
 'Përgjigjet pozitivisht → kaloj te active; nuk përgjigjet 30 ditë → kaloj te dormant'),

('dormant', 'reengaging',
 'Shumë i qetë, ofertë e vlerës pa presion, rikujton çfarë ka humbur.',
 'Dërgo mesazh të shkurtër me lajm/ndryshim pozitiv. Ofroji diçka speciale pa e bërë të ndihet "i targetuar".',
 'Mos dërgo shumë mesazhe. Mos pyet pse nuk ka komunikuar. Mos dërgo lista gjata.',
 'Kemi pasur disa risi që mendova mund t''ju interesojnë...',
 'Përgjigjet ose bën blerje → kaloj te active/converting'),

('champion', 'appreciative',
 'VIP, ekskluziv, i çmuar. Klienti e di se është i posaçëm.',
 'Trajtoji si partner. Jep akses të hershëm, zbritje ekskluzive, pyet mendimin e tyre. Kërko referim natyrshëm.',
 'Mos i drejtohu si klient i zakonshëm. Mos ofroji gjërat bazë. Mos injoron feedback-un e tij.',
 'Si njëri nga klientët tanë më besnikë, doja t''ju tregoja të parët...',
 'Ankesohet seriozisht → kaloj te at_risk');

-- ----------------------------------------------------------------
-- 7. INDEKSE
-- ----------------------------------------------------------------
CREATE INDEX idx_journey_business_phase
  ON customer_journey(business_id, current_phase);

CREATE INDEX idx_journey_at_risk
  ON customer_journey(business_id, updated_at DESC)
  WHERE current_phase IN ('at_risk', 'dormant');

CREATE INDEX idx_touchpoints_customer
  ON journey_touchpoints(business_id, customer_id, occurred_at DESC);

CREATE INDEX idx_transitions_customer
  ON journey_transitions(business_id, customer_id, transitioned_at DESC);

-- ----------------------------------------------------------------
-- 8. RLS
-- ----------------------------------------------------------------
ALTER TABLE customer_journey ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_communication_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY cj_business_member ON customer_journey
  FOR ALL USING (
    EXISTS (SELECT 1 FROM business_members bm
            WHERE bm.business_id = customer_journey.business_id
              AND bm.user_id = auth.uid())
  );

CREATE POLICY jt_business_member ON journey_transitions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM business_members bm
            WHERE bm.business_id = journey_transitions.business_id
              AND bm.user_id = auth.uid())
  );

CREATE POLICY jtp_business_member ON journey_touchpoints
  FOR ALL USING (
    EXISTS (SELECT 1 FROM business_members bm
            WHERE bm.business_id = journey_touchpoints.business_id
              AND bm.user_id = auth.uid())
  );

-- Rregullat e komunikimit: lexim publik (nevojiten nga Edge Functions)
CREATE POLICY jcr_read_all ON journey_communication_rules
  FOR SELECT USING (active = true);

-- ----------------------------------------------------------------
-- 9. TRIGGER: updated_at
-- ----------------------------------------------------------------
CREATE TRIGGER trg_journey_updated
  BEFORE UPDATE ON customer_journey
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  -- touch_updated_at() ekziston nga revenue_intelligence_schema

-- ----------------------------------------------------------------
-- 10. VIEW: Pamje e plotë per-klient (për dashboard)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW customer_journey_summary AS
SELECT
  cj.business_id,
  cj.customer_id,
  c.name                          AS customer_name,
  cj.current_phase,
  cj.communication_style,
  cj.days_in_current_phase,
  cj.total_touchpoints,
  cj.response_rate,
  cj.satisfaction_score,
  cj.phase_trigger,
  cj.predicted_next_phase,
  cj.next_phase_probability,
  crp.lead_score,
  crp.churn_risk_score,
  crp.recommended_action,
  crp.total_revenue_lek,
  crp.purchase_count,
  crp.last_message_at,
  -- Lloji i aksionit të ri që duhet ndërmarrë
  CASE
    WHEN cj.current_phase = 'at_risk'  AND crp.churn_risk_score > 0.6 THEN 'urgent_reengagement'
    WHEN cj.current_phase = 'champion' AND crp.purchase_count >= 3    THEN 'request_referral'
    WHEN cj.current_phase = 'active'   AND crp.lead_score > 70        THEN 'upsell_ready'
    WHEN cj.current_phase = 'converting'                               THEN 'close_sale'
    WHEN cj.current_phase = 'dormant'                                  THEN 'winback_campaign'
    ELSE 'continue_nurturing'
  END                             AS suggested_next_action,
  cj.updated_at
FROM customer_journey cj
JOIN customers c         ON c.id = cj.customer_id
LEFT JOIN customer_revenue_profile crp
  ON crp.customer_id = cj.customer_id
  AND crp.business_id = cj.business_id;
