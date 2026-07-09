-- ============================================================
-- WHATSAPP CHANNEL ADAPTER
-- Pulse AI 2.0 — Patch-et e skemës + konfigurimi
-- ============================================================
-- Unified-agent e mbështet tashmë WhatsApp (platform='whatsapp')
-- Ky file shtron:
--   1. Fushat shtesë te customers për WhatsApp
--   2. Fushat shtesë te channels për WhatsApp Business
--   3. Fushat shtesë te messages për journey tracking
--   4. Template messages (WhatsApp kërkon template për mesazhe jashtë 24h)
-- ============================================================

-- ----------------------------------------------------------------
-- 1. CUSTOMERS: fushat WhatsApp
-- ----------------------------------------------------------------
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS whatsapp_phone        text,
  ADD COLUMN IF NOT EXISTS whatsapp_name         text,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_in     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_in_at  timestamptz;

-- Index unik: një numër telefoni per biznes
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_wa_phone
  ON customers(business_id, whatsapp_phone)
  WHERE whatsapp_phone IS NOT NULL;

-- ----------------------------------------------------------------
-- 2. CHANNELS: fusha shtesë per WhatsApp Business
-- ----------------------------------------------------------------
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS external_account_id  text,
  ADD COLUMN IF NOT EXISTS waba_id              text,  -- WhatsApp Business Account ID
  ADD COLUMN IF NOT EXISTS phone_number_id      text,  -- ID e numrit të telefonit
  ADD COLUMN IF NOT EXISTS display_phone_number text;  -- "+355 69 XXX XXXX"

-- ----------------------------------------------------------------
-- 3. MESSAGES: kolona shtesë për journey tracking
-- ----------------------------------------------------------------
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS external_message_id  text,
  ADD COLUMN IF NOT EXISTS journey_phase_at_time text,
  ADD COLUMN IF NOT EXISTS ai_confidence        numeric(3,2);

-- De-duplikimi: një mesazh i jashtëm = një rresht
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_id
  ON messages(external_message_id)
  WHERE external_message_id IS NOT NULL;

-- ----------------------------------------------------------------
-- 4. WHATSAPP TEMPLATES (mesazhe jashtë dritares 24-orëshe)
-- ----------------------------------------------------------------
-- WhatsApp ndalon dërgimin e mesazheve "të lira" pas 24 orësh
-- Pa reagim nga klienti. Nevojiten template të aprovuara nga Meta.
-- ----------------------------------------------------------------
CREATE TABLE whatsapp_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  template_name   text NOT NULL,    -- emri në Meta (p.sh. "winback_offer_al")
  language        text NOT NULL DEFAULT 'sq', -- 'sq' = shqip
  category        text NOT NULL     -- 'MARKETING', 'UTILITY', 'AUTHENTICATION'
                  CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','paused')),
  -- Struktura e template-it
  header_text     text,             -- tekst opsional në krye
  body_text       text NOT NULL,    -- trupi me variabla: {{1}}, {{2}}
  footer_text     text,             -- tekst opsional në fund
  button_type     text,             -- 'QUICK_REPLY', 'CALL_TO_ACTION', null
  button_text     text,
  -- Meta IDs
  meta_template_id text,
  submitted_at    timestamptz,
  approved_at     timestamptz,
  -- Meta
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_template UNIQUE (business_id, template_name, language)
);

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY wt_business_member ON whatsapp_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM business_members bm
            WHERE bm.business_id = whatsapp_templates.business_id
              AND bm.user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- 5. LOG I TEMPLATE SENDS
-- ----------------------------------------------------------------
CREATE TABLE whatsapp_template_sends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  template_id     uuid NOT NULL REFERENCES whatsapp_templates(id),
  customer_id     uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  variables       jsonb NOT NULL DEFAULT '{}',   -- {"1": "Juliana", "2": "20%"}
  status          text NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent','delivered','read','failed')),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  read_at         timestamptz
);

-- ----------------------------------------------------------------
-- 6. SEED: Template bazë për bizneset shqiptare
-- ----------------------------------------------------------------
-- SHËNIM: Këto template duhen dorëzuar te Meta për aprovim.
-- Emri dhe gjuha duhet të përputhen saktë me çfarë vendos Meta.
-- ----------------------------------------------------------------

-- Template 1: Winback (Rikthim klienti)
-- Kategoria: MARKETING
-- Variablat: {{1}} = emri, {{2}} = oferta specifike
INSERT INTO whatsapp_templates
  (business_id, template_name, language, category, body_text, footer_text, button_type, button_text)
SELECT
  id,
  'winback_offer',
  'sq',
  'MARKETING',
  'Përshëndetje {{1}}! Ju kemi humbur. Kemi diçka speciale për ju: {{2}}. Oferta skadon brenda 48 orëve.',
  'Mund të çregjistroheni duke dërguar STOP.',
  'QUICK_REPLY',
  'Më intereson!'
FROM businesses
LIMIT 0; -- bosh — plotësohet me business_id real gjatë onboarding-ut

-- Template 2: Konfirmim porosie
-- Kategoria: UTILITY (nuk kërkon 24h dritare)
-- Variablat: {{1}} = emri, {{2}} = detajet e porosisë, {{3}} = koha e dorëzimit
-- INSERT INTO whatsapp_templates ... (e njëjta strukturë)

-- ----------------------------------------------------------------
-- 7. VIEW: Klientë WhatsApp pa dritare aktive (>24h)
--    (për të vendosur kur duhet template vs mesazh i lirë)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW whatsapp_customers_outside_window AS
SELECT
  c.id           AS customer_id,
  c.business_id,
  c.whatsapp_phone,
  c.whatsapp_name,
  c.whatsapp_opted_in,
  m.last_inbound_at,
  EXTRACT(EPOCH FROM (now() - m.last_inbound_at)) / 3600 AS hours_since_last_message,
  CASE
    WHEN m.last_inbound_at IS NULL                              THEN 'never_messaged'
    WHEN m.last_inbound_at > now() - INTERVAL '24 hours'       THEN 'in_window'
    WHEN m.last_inbound_at > now() - INTERVAL '7 days'         THEN 'needs_template'
    ELSE                                                             'dormant'
  END AS window_status
FROM customers c
LEFT JOIN (
  SELECT
    cu.id AS customer_id,
    MAX(ms.created_at) AS last_inbound_at
  FROM customers cu
  JOIN conversations cv ON cv.customer_id = cu.id
  JOIN messages ms ON ms.conversation_id = cv.id AND ms.role = 'user'
  GROUP BY cu.id
) m ON m.customer_id = c.id
WHERE c.whatsapp_phone IS NOT NULL
  AND c.whatsapp_opted_in = true;
