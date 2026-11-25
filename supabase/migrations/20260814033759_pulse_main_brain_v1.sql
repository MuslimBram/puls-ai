
-- PULSE AI MAIN BRAIN v1
-- Extends existing tables, adds new Brain tables

-- 1. CUSTOMER 360 PROFILE extensions on leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS customer_since      timestamptz,
  ADD COLUMN IF NOT EXISTS first_purchase_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_purchase_at    timestamptz,
  ADD COLUMN IF NOT EXISTS purchase_count      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spend         numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_basket          numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_value      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS products_purchased  text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS services_purchased  text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS categories          text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS favorites           jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS viewed_products     text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS abandoned_interest  jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS objections          text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_channel   text,
  ADD COLUMN IF NOT EXISTS language            text,
  ADD COLUMN IF NOT EXISTS timezone            text,
  ADD COLUMN IF NOT EXISTS birthday            date,
  ADD COLUMN IF NOT EXISTS customer_anniversary date,
  ADD COLUMN IF NOT EXISTS is_vip              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS loyalty_tier        text,
  ADD COLUMN IF NOT EXISTS referral_count      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_offer_at       timestamptz,
  ADD COLUMN IF NOT EXISTS last_contacted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_offer_result   text,
  ADD COLUMN IF NOT EXISTS inactivity_days     integer,
  ADD COLUMN IF NOT EXISTS predicted_next_need text,
  ADD COLUMN IF NOT EXISTS churn_risk          numeric,
  ADD COLUMN IF NOT EXISTS nba_action          text,
  ADD COLUMN IF NOT EXISTS nba_reason          text,
  ADD COLUMN IF NOT EXISTS nba_confidence      numeric,
  ADD COLUMN IF NOT EXISTS nba_expires_at      timestamptz,
  ADD COLUMN IF NOT EXISTS nba_calculated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS scored_at           timestamptz;

-- 2. BUSINESS RULES ENGINE
CREATE TABLE IF NOT EXISTS business_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  rule_type     text NOT NULL,
  rule_name     text NOT NULL,
  is_enabled    boolean DEFAULT true,
  config        jsonb NOT NULL DEFAULT '{}',
  priority      integer DEFAULT 0,
  valid_from    date,
  valid_until   date,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id),
  CONSTRAINT br_type CHECK (rule_type IN ('discount','installment','referral','loyalty','frequency_cap','campaign','vip','other'))
);
ALTER TABLE business_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_read_rules" ON business_rules FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM user_roles WHERE user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "admin_manage_rules" ON business_rules FOR ALL USING (
  EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin','business_owner'))
);
CREATE INDEX IF NOT EXISTS idx_business_rules_ws ON business_rules(workspace_id, rule_type);

-- 3. NEXT BEST ACTIONS
CREATE TABLE IF NOT EXISTS next_best_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL,
  lead_id           uuid REFERENCES leads(id),
  action_type       text NOT NULL,
  reason            text NOT NULL,
  evidence          jsonb DEFAULT '{}',
  confidence        numeric NOT NULL DEFAULT 0.5,
  priority          integer DEFAULT 0,
  suggested_channel text,
  suggested_timing  timestamptz,
  rule_id           uuid REFERENCES business_rules(id),
  rule_allows       boolean DEFAULT true,
  offer_value       numeric,
  offer_unit        text,
  offer_details     jsonb DEFAULT '{}',
  status            text DEFAULT 'pending',
  expires_at        timestamptz,
  sent_at           timestamptz,
  result_at         timestamptz,
  result            text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
ALTER TABLE next_best_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_read_nba" ON next_best_actions FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM user_roles WHERE user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "service_manage_nba" ON next_best_actions FOR ALL USING (auth.uid() IS NULL);
CREATE INDEX IF NOT EXISTS idx_nba_workspace ON next_best_actions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_nba_lead ON next_best_actions(lead_id);

-- 4. LIFECYCLE TRIGGERS
CREATE TABLE IF NOT EXISTS lifecycle_triggers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  trigger_type  text NOT NULL,
  trigger_name  text NOT NULL,
  is_enabled    boolean DEFAULT true,
  config        jsonb NOT NULL DEFAULT '{}',
  channel       text DEFAULT 'any',
  requires_consent boolean DEFAULT true,
  cooldown_days integer DEFAULT 30,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT lt_type CHECK (trigger_type IN (
    'birthday','customer_anniversary','first_purchase_anniversary','nth_purchase',
    'spend_milestone','inactivity','vip_qualification','replenishment','high_basket',
    'multi_product','new_product_match','referral_success','expiring_offer','custom'
  ))
);
ALTER TABLE lifecycle_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_manage_triggers" ON lifecycle_triggers FOR ALL USING (
  workspace_id IN (SELECT workspace_id FROM user_roles WHERE user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id=auth.uid())
);

-- Lifecycle trigger log (prevents duplicate/repeated fires)
CREATE TABLE IF NOT EXISTS lifecycle_trigger_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id  uuid REFERENCES lifecycle_triggers(id),
  workspace_id uuid NOT NULL,
  lead_id     uuid REFERENCES leads(id),
  fired_at    timestamptz DEFAULT now(),
  fire_date   date NOT NULL DEFAULT CURRENT_DATE,
  result      text,
  nba_id      uuid REFERENCES next_best_actions(id),
  UNIQUE(trigger_id, lead_id, fire_date)
);
ALTER TABLE lifecycle_trigger_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_manage_trigger_log" ON lifecycle_trigger_log FOR ALL USING (auth.uid() IS NULL);

-- 5. CONTACT CONSENT
CREATE TABLE IF NOT EXISTS contact_consent (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  lead_id         uuid REFERENCES leads(id),
  channel         text NOT NULL,
  consented       boolean NOT NULL DEFAULT false,
  consent_method  text,
  consent_date    timestamptz,
  opt_out_date    timestamptz,
  opt_out_reason  text,
  is_suppressed   boolean DEFAULT false,
  suppressed_at   timestamptz,
  suppression_reason text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(workspace_id, lead_id, channel)
);
ALTER TABLE contact_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_read_consent" ON contact_consent FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM user_roles WHERE user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "service_manage_consent" ON contact_consent FOR ALL USING (auth.uid() IS NULL);
CREATE INDEX IF NOT EXISTS idx_consent_lead ON contact_consent(lead_id, channel);

-- 6. FREQUENCY CAP LOG
CREATE TABLE IF NOT EXISTS frequency_cap_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  lead_id       uuid REFERENCES leads(id),
  channel       text,
  message_type  text NOT NULL DEFAULT 'marketing',
  sent_at       timestamptz DEFAULT now(),
  broadcast_id  uuid,
  nba_id        uuid
);
ALTER TABLE frequency_cap_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_manage_freq_log" ON frequency_cap_log FOR ALL USING (auth.uid() IS NULL);
CREATE INDEX IF NOT EXISTS idx_freq_cap ON frequency_cap_log(workspace_id, lead_id, sent_at DESC);

-- 7. AI CAMPAIGN SEGMENTS
CREATE TABLE IF NOT EXISTS ai_campaign_segments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  segment_name    text NOT NULL,
  segment_type    text NOT NULL DEFAULT 'ai_dynamic',
  description     text,
  criteria        jsonb NOT NULL DEFAULT '{}',
  ai_reasoning    text,
  estimated_size  integer,
  actual_size     integer,
  last_evaluated  timestamptz,
  broadcast_id    uuid,
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT seg_type CHECK (segment_type IN ('ai_dynamic','manual','all_eligible'))
);
ALTER TABLE ai_campaign_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_manage_segments" ON ai_campaign_segments FOR ALL USING (
  workspace_id IN (SELECT workspace_id FROM user_roles WHERE user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id=auth.uid())
);

-- 8. BROADCAST SEND QUEUE EXTENSIONS (jitter delivery)
ALTER TABLE broadcast_send_queue
  ADD COLUMN IF NOT EXISTS jitter_seconds       integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheduled_send_at    timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count          integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries          integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_retry_at        timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key      text,
  ADD COLUMN IF NOT EXISTS message_type         text DEFAULT 'marketing',
  ADD COLUMN IF NOT EXISTS personalized_content text;

-- 9. CUSTOMER REFERRAL PROGRAMS (distinct from platform partner referrals)
CREATE TABLE IF NOT EXISTS customer_referral_programs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL,
  program_name          text NOT NULL,
  is_enabled            boolean DEFAULT false,
  rule_id               uuid REFERENCES business_rules(id),
  qualifying_purchase_min numeric,
  reward_type           text,
  reward_value          numeric,
  reward_unit           text,
  reward_expires_days   integer DEFAULT 30,
  new_customer_only     boolean DEFAULT true,
  fraud_prevention_days integer DEFAULT 7,
  created_at            timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_referral_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL,
  program_id        uuid REFERENCES customer_referral_programs(id),
  referrer_lead_id  uuid REFERENCES leads(id),
  referred_lead_id  uuid REFERENCES leads(id),
  referral_code     text,
  status            text DEFAULT 'pending',
  referred_at       timestamptz DEFAULT now(),
  qualified_at      timestamptz,
  rewarded_at       timestamptz,
  reward_sent       boolean DEFAULT false,
  reward_type       text,
  reward_value      numeric,
  rejection_reason  text,
  CONSTRAINT ref_status CHECK (status IN ('pending','qualifying','qualified','rewarded','rejected','expired')),
  CONSTRAINT no_self_referral CHECK (referrer_lead_id <> referred_lead_id)
);
ALTER TABLE customer_referral_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_referral_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_manage_ref_programs" ON customer_referral_programs FOR ALL USING (
  workspace_id IN (SELECT workspace_id FROM user_roles WHERE user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "workspace_read_ref_events" ON customer_referral_events FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM user_roles WHERE user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "service_manage_ref_events" ON customer_referral_events FOR ALL USING (auth.uid() IS NULL);

-- 10. CONVERSION FEEDBACK LOOP
CREATE TABLE IF NOT EXISTS conversion_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  lead_id       uuid REFERENCES leads(id),
  broadcast_id  uuid,
  nba_id        uuid REFERENCES next_best_actions(id),
  event_type    text NOT NULL,
  channel       text,
  event_data    jsonb DEFAULT '{}',
  revenue_amount numeric,
  recorded_at   timestamptz DEFAULT now(),
  CONSTRAINT ce_type CHECK (event_type IN (
    'delivered','failed','opened','clicked','replied','ignored',
    'purchased','booked','referred','converted','declined','unsubscribed','opted_out'
  ))
);
ALTER TABLE conversion_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_read_conversions" ON conversion_events FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM user_roles WHERE user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "service_manage_conversions" ON conversion_events FOR ALL USING (auth.uid() IS NULL);
CREATE INDEX IF NOT EXISTS idx_conversions_lead ON conversion_events(lead_id, recorded_at DESC);

-- 11. SERVER-SIDE RULE VALIDATION
CREATE OR REPLACE FUNCTION validate_nba_against_rules(
  p_workspace_id uuid, p_action_type text, p_offer_value numeric,
  p_offer_unit text, p_lead_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_rule business_rules%ROWTYPE; v_max numeric; v_inst_enabled boolean;
BEGIN
  IF p_action_type IN ('personalized_offer','vip_reward','birthday_offer','anniversary_reward',
    'nth_purchase_reward','high_basket_reward','win_back') AND p_offer_unit='pct' THEN
    SELECT * INTO v_rule FROM business_rules
    WHERE workspace_id=p_workspace_id AND rule_type='discount' AND is_enabled=true
    AND (valid_until IS NULL OR valid_until>=CURRENT_DATE) ORDER BY priority DESC LIMIT 1;
    v_max := COALESCE((v_rule.config->>'max_pct')::numeric, 100);
    IF p_offer_value > v_max THEN
      RETURN jsonb_build_object('allowed',false,'reason',
        format('Discount %.1f%% exceeds maximum %.1f%%',p_offer_value,v_max),
        'clamped_value',v_max,'rule_id',v_rule.id);
    END IF;
  END IF;
  IF p_action_type='installment_option' THEN
    SELECT (config->>'enabled')::boolean INTO v_inst_enabled
    FROM business_rules WHERE workspace_id=p_workspace_id AND rule_type='installment' AND is_enabled=true LIMIT 1;
    IF NOT COALESCE(v_inst_enabled,false) THEN
      RETURN jsonb_build_object('allowed',false,'reason','Installments not enabled');
    END IF;
  END IF;
  SELECT * INTO v_rule FROM business_rules WHERE workspace_id=p_workspace_id AND rule_type='discount' AND is_enabled=true LIMIT 1;
  RETURN jsonb_build_object('allowed',true,'rule_id',v_rule.id,'clamped_value',p_offer_value);
END;$$;

-- 12. CONTACT POLICY EVALUATION
CREATE OR REPLACE FUNCTION evaluate_contact_policy(
  p_workspace_id uuid, p_lead_id uuid, p_channel text, p_message_type text DEFAULT 'marketing'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_consent contact_consent%ROWTYPE; v_freq business_rules%ROWTYPE; v_cnt integer;
  v_max_day numeric; v_max_week numeric; v_suppr boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM global_suppression_list WHERE identifier=(SELECT contact_identifier FROM leads WHERE id=p_lead_id)) INTO v_suppr;
  IF v_suppr THEN RETURN jsonb_build_object('allowed',false,'reason','globally_suppressed'); END IF;
  IF p_message_type='marketing' THEN
    SELECT * INTO v_consent FROM contact_consent WHERE workspace_id=p_workspace_id AND lead_id=p_lead_id AND channel=p_channel;
    IF FOUND AND (NOT v_consent.consented OR v_consent.opt_out_date IS NOT NULL OR v_consent.is_suppressed) THEN
      RETURN jsonb_build_object('allowed',false,'reason','no_channel_consent');
    END IF;
    SELECT * INTO v_freq FROM business_rules WHERE workspace_id=p_workspace_id AND rule_type='frequency_cap' AND is_enabled=true LIMIT 1;
    IF FOUND THEN
      v_max_day:=COALESCE((v_freq.config->>'max_marketing_per_day')::numeric,1);
      v_max_week:=COALESCE((v_freq.config->>'max_marketing_per_week')::numeric,3);
      SELECT COUNT(*) INTO v_cnt FROM frequency_cap_log WHERE workspace_id=p_workspace_id AND lead_id=p_lead_id AND message_type='marketing' AND sent_at>now()-INTERVAL '24 hours';
      IF v_cnt>=v_max_day THEN RETURN jsonb_build_object('allowed',false,'reason','daily_cap_reached'); END IF;
      SELECT COUNT(*) INTO v_cnt FROM frequency_cap_log WHERE workspace_id=p_workspace_id AND lead_id=p_lead_id AND message_type='marketing' AND sent_at>now()-INTERVAL '7 days';
      IF v_cnt>=v_max_week THEN RETURN jsonb_build_object('allowed',false,'reason','weekly_cap_reached'); END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('allowed',true);
END;$$;

-- 13. INDEXES
CREATE INDEX IF NOT EXISTS idx_leads_workspace_vip ON leads(workspace_id, is_vip);
CREATE INDEX IF NOT EXISTS idx_leads_nba ON leads(workspace_id, nba_action);
CREATE INDEX IF NOT EXISTS idx_leads_inactivity ON leads(workspace_id, inactivity_days DESC);
CREATE INDEX IF NOT EXISTS idx_leads_birthday ON leads(workspace_id, birthday);
CREATE INDEX IF NOT EXISTS idx_leads_purchase_count ON leads(workspace_id, purchase_count DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_triggers ON lifecycle_triggers(workspace_id, trigger_type);
;
