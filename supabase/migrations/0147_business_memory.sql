-- ============================================================
-- BUSINESS MEMORY ENGINE
-- Pulse AI 2.0 — Shtresa e kujtesës AI per-biznes
-- ============================================================
-- Integrohet me skemën ekzistuese:
--   businesses(id), customers(id), conversations(id), messages(id)
-- ============================================================

-- ----------------------------------------------------------------
-- 1. LLOJET E MEMORIES (enum)
-- ----------------------------------------------------------------
CREATE TYPE memory_entity_type AS ENUM (
  -- Çfarë shet biznesi
  'product',          -- produkt specifik me çmim
  'service',          -- shërbim i ofruar
  'price_point',      -- çmim i një gjëje specifike

  -- Si funksionon biznesi
  'business_hour',    -- orari i punës
  'location',         -- adresa/zona e shërbimit
  'policy',           -- politikë (kthim, anulim, dorëzim)
  'faq_answer',       -- përgjigje e shpeshtë

  -- Çfarë di biznesi për klientin e tij
  'customer_preference',   -- preferencë e shprehur nga klienti
  'customer_purchase',     -- blerje e bërë
  'customer_complaint',    -- ankesë e regjistruar
  'customer_interest',     -- interes i treguar (jo blerje ende)

  -- Logjika e bisedave
  'conversation_pattern',  -- "klientët pyesin shpesh për X"
  'objection',            -- "klientët refuzojnë kur dëgjojnë Y"
  'successful_upsell'     -- "kjo ofertë ka funksionuar"
);

-- ----------------------------------------------------------------
-- 2. TABELA KRYESORE: business_memory
-- ----------------------------------------------------------------
CREATE TABLE business_memory (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Çfarë lloj gjëje kemi mësuar
  entity_type       memory_entity_type NOT NULL,

  -- Çelësi unik brenda business+type (p.sh. "espresso", "wifi_password")
  memory_key        text NOT NULL,

  -- Vlera e strukturuar (çmimi, orari, etc.)
  memory_value      jsonb NOT NULL,

  -- Sa e sigurt është kjo info (0.0–1.0)
  -- Zbret me kohë, rritet kur konfirmohet sërish
  confidence        numeric(3,2) NOT NULL DEFAULT 0.80
                    CHECK (confidence >= 0.0 AND confidence <= 1.0),

  -- Sa herë është konfirmuar kjo memorie (rrit besueshmërinë)
  confirmation_count integer NOT NULL DEFAULT 1,

  -- Nga ku e morëm (skanim, bisedë, manual nga stafi)
  source            text NOT NULL DEFAULT 'scan',
  -- 'scan'         → scan-instagram-channel / website scraper
  -- 'conversation' → u tha nga klienti gjatë bisedës
  -- 'ai_inference' → AI e nxori nga konteksti
  -- 'staff_manual' → stafi e shkroi vetë

  -- Lidhje opsionale me bisedën / mesazhin ku u mësuea
  learned_from_conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  learned_from_message_id      uuid REFERENCES messages(id) ON DELETE SET NULL,

  -- Lidhje opsionale me klientin (për memoria customer-specifike)
  customer_id       uuid REFERENCES customers(id) ON DELETE CASCADE,

  -- Koha
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,
  -- NULL = nuk skadon (politika, produkte)
  -- e vendosur = info e përkohshme (ofertë javore, orar pushimesh)

  -- Index unik: një biznes nuk mund të ketë dy memoria me të njëjtin key+type
  -- Por memoria customer-specifike lejohet dyfishim (customer_id e bën unique)
  CONSTRAINT uq_business_memory_key
    UNIQUE (business_id, entity_type, memory_key, customer_id)
);

-- ----------------------------------------------------------------
-- 3. LOG I NDRYSHIMEVE (audit trail)
-- ----------------------------------------------------------------
CREATE TABLE business_memory_changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id     uuid NOT NULL REFERENCES business_memory(id) ON DELETE CASCADE,
  business_id   uuid NOT NULL,
  change_type   text NOT NULL CHECK (change_type IN ('created','updated','confirmed','expired','deleted')),
  old_value     jsonb,
  new_value     jsonb,
  old_confidence numeric(3,2),
  new_confidence numeric(3,2),
  changed_by    text NOT NULL DEFAULT 'system',
  changed_at    timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 4. STATISTIKA PER-BIZNES (agregat i shpejtë)
-- ----------------------------------------------------------------
CREATE TABLE business_memory_stats (
  business_id           uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  total_memories        integer NOT NULL DEFAULT 0,
  product_count         integer NOT NULL DEFAULT 0,
  faq_count             integer NOT NULL DEFAULT 0,
  customer_insight_count integer NOT NULL DEFAULT 0,
  avg_confidence        numeric(3,2) NOT NULL DEFAULT 0.0,
  last_scan_at          timestamptz,
  last_conversation_learned_at timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 5. INDEKSE — kritike për performancën
-- ----------------------------------------------------------------

-- Kërkim kryesor: "gjej të gjitha memoria e biznesit X të tipit Y"
CREATE INDEX idx_memory_business_type
  ON business_memory(business_id, entity_type)
  WHERE expires_at IS NULL OR expires_at > now();

-- Kërkim për memoria të klientëve specifikë
CREATE INDEX idx_memory_customer
  ON business_memory(business_id, customer_id)
  WHERE customer_id IS NOT NULL;

-- Kërkim sipas besueshmërisë (AI lexon vetëm >0.5)
CREATE INDEX idx_memory_confidence
  ON business_memory(business_id, confidence DESC)
  WHERE confidence > 0.5;

-- Kërkim i memories që po skadon (për refresim)
CREATE INDEX idx_memory_expiry
  ON business_memory(expires_at ASC)
  WHERE expires_at IS NOT NULL;

-- ----------------------------------------------------------------
-- 6. FUNKSIONI I DECAY (zbret confidence me kohë)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION decay_memory_confidence()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  days_threshold integer := 30;
  decay_rate numeric := 0.05; -- -5% besueshmëri çdo 30 ditë
BEGIN
  -- Zbrit confidence-n për memoria të pakonfermuara prej 30+ ditësh
  UPDATE business_memory
  SET
    confidence = GREATEST(0.1, confidence - decay_rate),
    -- NUK e fshijmë — e mbajmë me confidence të ulët si "e pasigurt"
    updated_at = now()
  WHERE
    last_confirmed_at < now() - make_interval(days => days_threshold)
    AND source != 'staff_manual'  -- stafi e di çfarë ka shkruar
    AND (expires_at IS NULL OR expires_at > now());

  -- Shëno si expired memoria e kaluar datës
  UPDATE business_memory
  SET confidence = 0.0
  WHERE expires_at IS NOT NULL AND expires_at <= now() AND confidence > 0.0;

  -- Përditëso statistikat
  UPDATE business_memory_stats bms
  SET
    total_memories = (SELECT COUNT(*) FROM business_memory WHERE business_id = bms.business_id AND confidence > 0.1),
    avg_confidence = (SELECT COALESCE(AVG(confidence),0) FROM business_memory WHERE business_id = bms.business_id AND confidence > 0.1),
    updated_at = now()
  WHERE business_id IN (
    SELECT DISTINCT business_id FROM business_memory
    WHERE last_confirmed_at < now() - make_interval(days => days_threshold)
  );
END;
$$;

-- ----------------------------------------------------------------
-- 7. FUNKSIONI I KONFIRMIMIT (rritet confidence kur konfirmohet)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_memory(
  p_business_id uuid,
  p_entity_type memory_entity_type,
  p_memory_key  text,
  p_customer_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE business_memory
  SET
    confidence         = LEAST(1.0, confidence + 0.10),
    confirmation_count = confirmation_count + 1,
    last_confirmed_at  = now()
  WHERE
    business_id  = p_business_id
    AND entity_type  = p_entity_type
    AND memory_key   = p_memory_key
    AND (customer_id = p_customer_id OR (customer_id IS NULL AND p_customer_id IS NULL));

  -- Log
  INSERT INTO business_memory_changes(memory_id, business_id, change_type, changed_by)
  SELECT id, business_id, 'confirmed', 'system'
  FROM business_memory
  WHERE business_id = p_business_id AND entity_type = p_entity_type AND memory_key = p_memory_key;
END;
$$;

-- ----------------------------------------------------------------
-- 8. TRIGGER: stat update automatik
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_memory_stats()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO business_memory_stats(business_id)
  VALUES (COALESCE(NEW.business_id, OLD.business_id))
  ON CONFLICT (business_id) DO UPDATE SET
    total_memories = (
      SELECT COUNT(*) FROM business_memory
      WHERE business_id = EXCLUDED.business_id AND confidence > 0.1
    ),
    product_count = (
      SELECT COUNT(*) FROM business_memory
      WHERE business_id = EXCLUDED.business_id AND entity_type = 'product' AND confidence > 0.1
    ),
    faq_count = (
      SELECT COUNT(*) FROM business_memory
      WHERE business_id = EXCLUDED.business_id AND entity_type = 'faq_answer' AND confidence > 0.1
    ),
    customer_insight_count = (
      SELECT COUNT(*) FROM business_memory
      WHERE business_id = EXCLUDED.business_id
        AND entity_type IN ('customer_preference','customer_purchase','customer_interest')
        AND confidence > 0.1
    ),
    avg_confidence = (
      SELECT COALESCE(AVG(confidence),0) FROM business_memory
      WHERE business_id = EXCLUDED.business_id AND confidence > 0.1
    ),
    last_conversation_learned_at = CASE
      WHEN (COALESCE(NEW.source,'') = 'conversation' OR COALESCE(NEW.source,'') = 'ai_inference')
      THEN now()
      ELSE (SELECT last_conversation_learned_at FROM business_memory_stats WHERE business_id = EXCLUDED.business_id)
    END,
    updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_memory_stats
AFTER INSERT OR UPDATE OR DELETE ON business_memory
FOR EACH ROW EXECUTE FUNCTION update_memory_stats();

-- ----------------------------------------------------------------
-- 9. TRIGGER: audit log automatik
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_memory_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO business_memory_changes(memory_id, business_id, change_type, new_value, new_confidence, changed_by)
    VALUES (NEW.id, NEW.business_id, 'created', NEW.memory_value, NEW.confidence, NEW.source);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.memory_value IS DISTINCT FROM NEW.memory_value OR OLD.confidence IS DISTINCT FROM NEW.confidence THEN
      INSERT INTO business_memory_changes(memory_id, business_id, change_type, old_value, new_value, old_confidence, new_confidence, changed_by)
      VALUES (NEW.id, NEW.business_id, 'updated', OLD.memory_value, NEW.memory_value, OLD.confidence, NEW.confidence, 'system');
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_memory_audit
AFTER INSERT OR UPDATE ON business_memory
FOR EACH ROW EXECUTE FUNCTION log_memory_change();

-- ----------------------------------------------------------------
-- 10. RLS (Row Level Security) — kritike per multi-tenant
-- ----------------------------------------------------------------
ALTER TABLE business_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_memory_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_memory_stats ENABLE ROW LEVEL SECURITY;

-- Anëtarët e biznesit shohin vetëm memoriat e biznesit të tyre
CREATE POLICY memory_business_member ON business_memory
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_memory.business_id
        AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY memory_stats_business_member ON business_memory_stats
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_memory_stats.business_id
        AND bm.user_id = auth.uid()
    )
  );

-- Edge Functions lexojnë pa RLS (service_role key)
-- Kjo është e sigurt pasi Edge Functions kanë autentifikim të vet

-- ----------------------------------------------------------------
-- 11. pg_cron: decay çdo natë në 02:00
-- ----------------------------------------------------------------
-- Ekzekuto vetëm nëse pg_cron është i aktivizuar te Supabase
-- SELECT cron.schedule('decay-memory-confidence', '0 2 * * *', 'SELECT decay_memory_confidence()');

-- ----------------------------------------------------------------
-- SHEMBUJ MEMORY_VALUE për reference
-- ----------------------------------------------------------------
-- product:
--   {"name": "Espresso", "price_lek": 150, "available": true, "category": "kafe"}
--
-- business_hour:
--   {"weekdays": "08:00-22:00", "saturday": "09:00-23:00", "sunday": "10:00-20:00"}
--
-- faq_answer:
--   {"question": "A keni wifi?", "answer": "Po, kodi është KAFE2024", "category": "amenities"}
--
-- customer_preference (me customer_id):
--   {"prefers": "espresso", "avoids": "milk", "budget_tier": "medium"}
--
-- customer_purchase:
--   {"product": "Espresso", "quantity": 1, "price_paid": 150, "date": "2026-06-20"}
--
-- objection:
--   {"trigger": "çmimi", "response_that_works": "oferta 3+1", "conversion_rate": 0.65}
