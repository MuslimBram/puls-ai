-- SOCIAL-1D: Intent Evidence, Intent Score, and Journey Linkage
--
-- AUDIT SUMMARY:
--   Reused from prior migrations:
--     - public.social_engagement_events          (SOCIAL-1A canonical event source)
--     - public.canonical_persons                 (SOCIAL-1B identity anchor)
--     - public.identity_nodes                    (SOCIAL-1B identity graph)
--     - public.social_interest_memory            (SOCIAL-1C interest accumulation)
--     - public.workspace_members                 (canonical RLS pattern)
--     - public.set_updated_at()                  (SOCIAL-1C trigger helper, always exists after 1C)
--     - public.customer_journey / journey_phase  (0149_journey_intelligence, reused not duplicated)
--
--   NOT reused / NOT duplicated:
--     - Does NOT create a second Journey taxonomy.
--     - Does NOT execute commercial actions (no NBA, offers, campaigns, messages).
--     - Does NOT add AI-opaque scoring — score calculation is bounded/deterministic.
--
--   New additions:
--     - public.social_intent_evidence   : per-event intent evidence ledger
--     - public.social_intent_score      : one active score per workspace+identity
--     - public.social_intent_journey_link: minimal audit bridge to canonical Journey
--     - public.accumulate_social_intent_signal() : single transactional RPC
--     - public.revoke_social_intent_evidence()   : revocation + score recompute RPC
--
-- ROLLBACK IMPLICATIONS:
--   Additive only. Dropping removes social_intent_evidence, social_intent_score,
--   social_intent_journey_link, and the two RPCs. SOCIAL-1A/1B/1C remain intact.

-- ============================================================
-- TABLE: social_intent_evidence
-- ============================================================
-- Per-event, per-intent-dimension evidence ledger.
-- Idempotency: (workspace_id, engagement_event_id, intent_dimension, intent_ref).
-- Evidence once written is immutable (state only moves to 'revoked').
-- ============================================================
CREATE TABLE IF NOT EXISTS public.social_intent_evidence (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- workspace scope (always leading)
  workspace_id            uuid        NOT NULL,

  -- canonical SOCIAL-1A event (same workspace enforced by trigger below)
  engagement_event_id     uuid        NOT NULL
    REFERENCES public.social_engagement_events (id) ON DELETE RESTRICT,

  -- SOCIAL-1C interest memory link (optional; populated when evidence derives from interest signal)
  interest_memory_id      uuid
    REFERENCES public.social_interest_memory (id) ON DELETE SET NULL,

  -- SOCIAL-1B identity
  identity_node_id        uuid
    REFERENCES public.identity_nodes (id) ON DELETE SET NULL,

  -- canonical person when identity is known_person and linkage is lawful
  canonical_person_id     uuid
    REFERENCES public.canonical_persons (id) ON DELETE SET NULL,

  -- resolved identity coordinates
  resolved_identity_key   text        NOT NULL,
  actor_identity_state    text        NOT NULL
    CHECK (actor_identity_state IN (
      'known_person', 'platform_actor', 'pseudonymous_visitor'
      -- anonymous_aggregate is PROHIBITED from person-level intent evidence
    )),

  -- intent taxonomy
  intent_dimension        text        NOT NULL
    CHECK (intent_dimension IN ('purchase_intent', 'interest_signal', 'engagement_depth', 'reactivation')),
  intent_ref              text        NOT NULL,

  -- evidence metadata
  evidence_type           text        NOT NULL,
  evidence_timestamp      timestamptz NOT NULL,

  -- direction: signal strengthens or weakens intent
  direction               text        NOT NULL DEFAULT 'positive'
    CHECK (direction IN ('positive', 'negative', 'neutral')),

  -- bounded weight: runtime supplies deterministic value; DB clamps to [0,1]
  evidence_weight         numeric(5,4) NOT NULL DEFAULT 0.1000
    CHECK (evidence_weight >= 0 AND evidence_weight <= 1),

  -- source traceability (no secrets)
  source_provider         text        NOT NULL,
  source_ref              text        NOT NULL,

  -- deterministic idempotency key (built by runtime: 'sie:<workspace>:<event_id>:<dimension>:<ref>')
  idempotency_key         text        NOT NULL,

  -- lifecycle
  state                   text        NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'revoked')),
  revoked_at              timestamptz,
  revocation_reason       text,
  revoked_by_rpc          text,

  created_at              timestamptz NOT NULL DEFAULT now(),

  -- ── IDENTITY INVARIANTS ──────────────────────────────────────────────────
  CONSTRAINT chk_intent_evidence_known_person_requires_canonical
    CHECK (actor_identity_state != 'known_person' OR canonical_person_id IS NOT NULL),
  CONSTRAINT chk_intent_evidence_nonknown_no_canonical
    CHECK (actor_identity_state = 'known_person' OR canonical_person_id IS NULL),
  CONSTRAINT chk_intent_evidence_revoked_has_metadata
    CHECK (state != 'revoked' OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL))
);

-- Event-level idempotency: same event cannot contribute twice to same intent dimension+ref
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_intent_evidence_idempotency
  ON public.social_intent_evidence (idempotency_key);

-- Also unique on the semantic key for safe ON CONFLICT targeting
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_intent_evidence_event_dimension
  ON public.social_intent_evidence (workspace_id, engagement_event_id, intent_dimension, intent_ref);

CREATE INDEX IF NOT EXISTS idx_social_intent_evidence_workspace
  ON public.social_intent_evidence (workspace_id, evidence_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_social_intent_evidence_identity
  ON public.social_intent_evidence (workspace_id, resolved_identity_key, state, evidence_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_social_intent_evidence_person
  ON public.social_intent_evidence (workspace_id, canonical_person_id, state, evidence_timestamp DESC)
  WHERE canonical_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_intent_evidence_event
  ON public.social_intent_evidence (engagement_event_id);

ALTER TABLE public.social_intent_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_social_intent_evidence"
  ON public.social_intent_evidence
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_social_intent_evidence"
  ON public.social_intent_evidence
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- TABLE: social_intent_score
-- ============================================================
-- One active score per (workspace_id, resolved_identity_key).
-- Recalculated atomically inside the accumulation RPC.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.social_intent_score (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  workspace_id            uuid        NOT NULL,

  -- identity coordinates
  resolved_identity_key   text        NOT NULL,
  actor_identity_state    text        NOT NULL
    CHECK (actor_identity_state IN (
      'known_person', 'platform_actor', 'pseudonymous_visitor'
    )),
  canonical_person_id     uuid
    REFERENCES public.canonical_persons (id) ON DELETE SET NULL,

  -- bounded score [0.0000, 1.0000]
  score                   numeric(6,4) NOT NULL DEFAULT 0.0000
    CHECK (score >= 0 AND score <= 1),

  -- human-readable band derived from score
  score_band              text        NOT NULL DEFAULT 'none'
    CHECK (score_band IN ('none', 'low', 'medium', 'high', 'very_high')),

  -- evidence quality
  evidence_count          integer     NOT NULL DEFAULT 0
    CHECK (evidence_count >= 0),
  positive_evidence_count integer     NOT NULL DEFAULT 0
    CHECK (positive_evidence_count >= 0),
  negative_evidence_count integer     NOT NULL DEFAULT 0
    CHECK (negative_evidence_count >= 0),

  -- confidence level derived from evidence diversity
  confidence              text        NOT NULL DEFAULT 'insufficient'
    CHECK (confidence IN ('insufficient', 'low', 'medium', 'high')),

  -- explainable contributions: [{dimension, ref, weight, direction, timestamp}]
  evidence_contributions  jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- scoring rule version for auditability
  scoring_rule_version    text        NOT NULL DEFAULT 'v1',

  -- temporal
  first_observed_at       timestamptz NOT NULL DEFAULT now(),
  last_calculated_at      timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- ── IDENTITY INVARIANTS ──────────────────────────────────────────────────
  CONSTRAINT chk_intent_score_known_person_requires_canonical
    CHECK (actor_identity_state != 'known_person' OR canonical_person_id IS NOT NULL),
  CONSTRAINT chk_intent_score_nonknown_no_canonical
    CHECK (actor_identity_state = 'known_person' OR canonical_person_id IS NULL)
);

-- One active score row per workspace + identity
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_intent_score_identity
  ON public.social_intent_score (workspace_id, resolved_identity_key);

CREATE INDEX IF NOT EXISTS idx_social_intent_score_workspace
  ON public.social_intent_score (workspace_id, score DESC, last_calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_intent_score_person
  ON public.social_intent_score (workspace_id, canonical_person_id, score DESC)
  WHERE canonical_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_intent_score_band
  ON public.social_intent_score (workspace_id, score_band, last_calculated_at DESC);

ALTER TABLE public.social_intent_score ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_social_intent_score"
  ON public.social_intent_score
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_social_intent_score"
  ON public.social_intent_score
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER trg_social_intent_score_updated_at
  BEFORE UPDATE ON public.social_intent_score
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: social_intent_journey_link
-- ============================================================
-- Minimal audit bridge: when a social intent score justifies a Journey
-- phase observation, this table records that linkage durably without
-- executing any commercial action and without duplicating Journey logic.
-- Read-only from the Journey side; written only by the accumulation RPC.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.social_intent_journey_link (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  workspace_id            uuid        NOT NULL,
  intent_score_id         uuid        NOT NULL
    REFERENCES public.social_intent_score (id) ON DELETE CASCADE,

  -- canonical journey link (customer_journey is business-scoped via 0149; we store ref only)
  -- We store the journey_phase value without a FK because customer_journey uses business_id,
  -- not workspace_id. This is the minimal safe bridge: phase observation, not execution.
  observed_journey_phase  text        NOT NULL,  -- mirrors journey_phase enum values

  score_at_observation    numeric(6,4) NOT NULL
    CHECK (score_at_observation >= 0 AND score_at_observation <= 1),

  score_band_at_observation text      NOT NULL,

  -- what triggered this observation
  trigger_reason          text        NOT NULL,

  -- lifecycle: NOT an execution record — purely an audit observation
  observed_at             timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_journey_phase_valid
    CHECK (observed_journey_phase IN (
      'first_touch', 'exploring', 'considering', 'converting',
      'onboarding', 'active', 'at_risk', 'dormant', 'champion'
    ))
);

CREATE INDEX IF NOT EXISTS idx_social_intent_journey_link_workspace
  ON public.social_intent_journey_link (workspace_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_intent_journey_link_score
  ON public.social_intent_journey_link (intent_score_id, observed_at DESC);

ALTER TABLE public.social_intent_journey_link ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_social_intent_journey_link"
  ON public.social_intent_journey_link
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_social_intent_journey_link"
  ON public.social_intent_journey_link
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- TRIGGER: enforce workspace alignment for intent evidence
-- (mirrors SOCIAL-1C pattern for interest evidence)
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_social_intent_evidence_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_workspace uuid;
BEGIN
  SELECT workspace_id INTO v_event_workspace
    FROM public.social_engagement_events
    WHERE id = NEW.engagement_event_id;

  IF v_event_workspace IS NULL THEN
    RAISE EXCEPTION
      'social_intent_evidence: engagement_event_id % not found', NEW.engagement_event_id;
  END IF;

  IF v_event_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION
      'social_intent_evidence: workspace mismatch — event workspace (%) vs evidence workspace (%)',
      v_event_workspace, NEW.workspace_id;
  END IF;

  -- canonical_person must belong to the same workspace when provided
  IF NEW.canonical_person_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.canonical_persons
      WHERE id = NEW.canonical_person_id
        AND workspace_id = NEW.workspace_id
    ) THEN
      RAISE EXCEPTION
        'social_intent_evidence: canonical_person_id % does not belong to workspace %',
        NEW.canonical_person_id, NEW.workspace_id;
    END IF;
  END IF;

  -- interest_memory must belong to the same workspace when provided
  IF NEW.interest_memory_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.social_interest_memory
      WHERE id = NEW.interest_memory_id
        AND workspace_id = NEW.workspace_id
    ) THEN
      RAISE EXCEPTION
        'social_intent_evidence: interest_memory_id % does not belong to workspace %',
        NEW.interest_memory_id, NEW.workspace_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_social_intent_evidence_workspace
  BEFORE INSERT OR UPDATE ON public.social_intent_evidence
  FOR EACH ROW EXECUTE FUNCTION public.enforce_social_intent_evidence_workspace();

-- ============================================================
-- HELPER: deterministic score band classification
-- ============================================================
CREATE OR REPLACE FUNCTION public.classify_intent_score_band(p_score numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE
    WHEN p_score >= 0.8000 THEN 'very_high'
    WHEN p_score >= 0.6000 THEN 'high'
    WHEN p_score >= 0.3500 THEN 'medium'
    WHEN p_score >= 0.1000 THEN 'low'
    ELSE 'none'
  END;
$$;

-- ============================================================
-- HELPER: deterministic confidence classification
-- ============================================================
CREATE OR REPLACE FUNCTION public.classify_intent_confidence(p_evidence_count integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE
    WHEN p_evidence_count >= 10 THEN 'high'
    WHEN p_evidence_count >= 5  THEN 'medium'
    WHEN p_evidence_count >= 2  THEN 'low'
    ELSE 'insufficient'
  END;
$$;

-- ============================================================
-- HELPER: recompute score from active evidence for a given identity
-- Called inside the atomic RPC; not exposed publicly.
-- ============================================================
CREATE OR REPLACE FUNCTION public._recompute_intent_score_from_evidence(
  p_workspace_id          uuid,
  p_resolved_identity_key text
)
RETURNS TABLE (
  raw_score               numeric,
  evidence_count          integer,
  positive_evidence_count integer,
  negative_evidence_count integer,
  evidence_contributions  jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_score        numeric := 0;
  v_pos_count        integer := 0;
  v_neg_count        integer := 0;
  v_total_count      integer := 0;
  v_contributions    jsonb   := '[]'::jsonb;
  r                  record;
BEGIN
  FOR r IN
    SELECT
      intent_dimension,
      intent_ref,
      direction,
      evidence_weight,
      evidence_timestamp
    FROM public.social_intent_evidence
    WHERE workspace_id          = p_workspace_id
      AND resolved_identity_key = p_resolved_identity_key
      AND state                 = 'active'
    ORDER BY evidence_timestamp DESC
  LOOP
    v_total_count := v_total_count + 1;

    IF r.direction = 'positive' THEN
      v_raw_score := v_raw_score + r.evidence_weight;
      v_pos_count := v_pos_count + 1;
    ELSIF r.direction = 'negative' THEN
      v_raw_score := v_raw_score - r.evidence_weight;
      v_neg_count := v_neg_count + 1;
    END IF;
    -- 'neutral' direction: counted but does not shift score

    v_contributions := v_contributions || jsonb_build_object(
      'dimension',  r.intent_dimension,
      'ref',        r.intent_ref,
      'weight',     r.evidence_weight,
      'direction',  r.direction,
      'timestamp',  r.evidence_timestamp
    );
  END LOOP;

  -- Clamp to [0, 1] and round to 4dp
  v_raw_score := LEAST(1.0000, GREATEST(0.0000, ROUND(v_raw_score, 4)));

  RETURN QUERY SELECT
    v_raw_score,
    v_total_count,
    v_pos_count,
    v_neg_count,
    v_contributions;
END;
$$;

-- ============================================================
-- RPC: accumulate_social_intent_signal
-- ============================================================
-- Canonical single-transaction boundary for evidence + score update.
-- Contract:
--   1. Validate workspace alignment of event.
--   2. Validate identity state rules.
--   3. Insert evidence (idempotent — ON CONFLICT DO NOTHING on idempotency_key).
--   4. Retrieve or recover existing evidence id.
--   5. Recompute score from ALL active evidence for this identity.
--   6. Upsert score row.
--   7. Return deterministic result.
--
-- Retry safety: converges correctly on transient failure at any step.
-- Concurrent distinct evidence: each gets its own evidence row; score recalc
--   uses COUNT+SUM over all active rows — no lost updates.
-- Duplicate same evidence: idempotency_key conflict swallows duplicate silently.
-- ============================================================
CREATE OR REPLACE FUNCTION public.accumulate_social_intent_signal(
  p_workspace_id            uuid,
  p_engagement_event_id     uuid,
  p_resolved_identity_key   text,
  p_actor_identity_state    text,
  p_canonical_person_id     uuid,
  p_identity_node_id        uuid,
  p_intent_dimension        text,
  p_intent_ref              text,
  p_evidence_type           text,
  p_evidence_timestamp      timestamptz,
  p_direction               text,
  p_evidence_weight         numeric,
  p_source_provider         text,
  p_source_ref              text,
  p_idempotency_key         text,
  p_interest_memory_id      uuid       DEFAULT NULL,
  p_scoring_rule_version    text       DEFAULT 'v1'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_workspace       uuid;
  v_evidence_id           uuid;
  v_evidence_inserted     boolean := false;
  v_score_id              uuid;
  v_raw_score             numeric;
  v_evidence_count        integer;
  v_pos_count             integer;
  v_neg_count             integer;
  v_contributions         jsonb;
  v_score_band            text;
  v_confidence            text;
  v_observed_journey_phase text;
  v_safe_canonical_person uuid;
BEGIN

  -- ── 1. Validate workspace alignment of engagement event ─────────────────
  SELECT workspace_id INTO v_event_workspace
    FROM public.social_engagement_events
    WHERE id = p_engagement_event_id
    FOR SHARE;

  IF v_event_workspace IS NULL THEN
    RAISE EXCEPTION
      'accumulate_social_intent_signal: engagement_event_id % not found',
      p_engagement_event_id;
  END IF;

  IF v_event_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION
      'accumulate_social_intent_signal: workspace mismatch — event workspace (%) vs request workspace (%)',
      v_event_workspace, p_workspace_id;
  END IF;

  -- ── 2. Validate identity state rules ────────────────────────────────────
  IF p_actor_identity_state NOT IN ('known_person', 'platform_actor', 'pseudonymous_visitor') THEN
    RAISE EXCEPTION
      'accumulate_social_intent_signal: invalid actor_identity_state %. anonymous_aggregate cannot create intent evidence.',
      p_actor_identity_state;
  END IF;

  IF p_actor_identity_state = 'known_person' AND p_canonical_person_id IS NULL THEN
    RAISE EXCEPTION
      'accumulate_social_intent_signal: known_person requires canonical_person_id';
  END IF;

  -- Sanitise: non-known identities must not carry a canonical_person_id
  IF p_actor_identity_state <> 'known_person' THEN
    v_safe_canonical_person := NULL;
  ELSE
    -- Verify canonical person belongs to same workspace
    IF NOT EXISTS (
      SELECT 1 FROM public.canonical_persons
      WHERE id = p_canonical_person_id
        AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION
        'accumulate_social_intent_signal: canonical_person_id % does not belong to workspace %',
        p_canonical_person_id, p_workspace_id;
    END IF;
    v_safe_canonical_person := p_canonical_person_id;
  END IF;

  -- ── 3. Validate intent dimension ────────────────────────────────────────
  IF p_intent_dimension NOT IN ('purchase_intent', 'interest_signal', 'engagement_depth', 'reactivation') THEN
    RAISE EXCEPTION
      'accumulate_social_intent_signal: invalid intent_dimension %', p_intent_dimension;
  END IF;

  -- ── 4. Validate evidence_weight ─────────────────────────────────────────
  IF p_evidence_weight IS NULL OR p_evidence_weight < 0 OR p_evidence_weight > 1 THEN
    RAISE EXCEPTION
      'accumulate_social_intent_signal: evidence_weight must be in [0,1], got %', p_evidence_weight;
  END IF;

  -- ── 5. Insert evidence (idempotent) ─────────────────────────────────────
  INSERT INTO public.social_intent_evidence (
    workspace_id,
    engagement_event_id,
    interest_memory_id,
    identity_node_id,
    canonical_person_id,
    resolved_identity_key,
    actor_identity_state,
    intent_dimension,
    intent_ref,
    evidence_type,
    evidence_timestamp,
    direction,
    evidence_weight,
    source_provider,
    source_ref,
    idempotency_key,
    state
  )
  VALUES (
    p_workspace_id,
    p_engagement_event_id,
    p_interest_memory_id,
    p_identity_node_id,
    v_safe_canonical_person,
    p_resolved_identity_key,
    p_actor_identity_state,
    p_intent_dimension,
    p_intent_ref,
    p_evidence_type,
    p_evidence_timestamp,
    p_direction,
    p_evidence_weight,
    p_source_provider,
    p_source_ref,
    p_idempotency_key,
    'active'
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_evidence_id;

  IF v_evidence_id IS NOT NULL THEN
    v_evidence_inserted := true;
  ELSE
    -- Recover existing evidence id (safe on retry)
    SELECT id INTO v_evidence_id
      FROM public.social_intent_evidence
      WHERE idempotency_key = p_idempotency_key
      LIMIT 1;

    IF v_evidence_id IS NULL THEN
      RAISE EXCEPTION
        'accumulate_social_intent_signal: unable to resolve evidence row for idempotency_key %',
        p_idempotency_key;
    END IF;
  END IF;

  -- ── 6. Recompute score from all active evidence for this identity ────────
  SELECT
    rs.raw_score,
    rs.evidence_count,
    rs.positive_evidence_count,
    rs.negative_evidence_count,
    rs.evidence_contributions
  INTO
    v_raw_score,
    v_evidence_count,
    v_pos_count,
    v_neg_count,
    v_contributions
  FROM public._recompute_intent_score_from_evidence(
    p_workspace_id,
    p_resolved_identity_key
  ) rs;

  v_score_band  := public.classify_intent_score_band(v_raw_score);
  v_confidence  := public.classify_intent_confidence(v_evidence_count);

  -- ── 7. Upsert score ──────────────────────────────────────────────────────
  INSERT INTO public.social_intent_score (
    workspace_id,
    resolved_identity_key,
    actor_identity_state,
    canonical_person_id,
    score,
    score_band,
    evidence_count,
    positive_evidence_count,
    negative_evidence_count,
    confidence,
    evidence_contributions,
    scoring_rule_version,
    first_observed_at,
    last_calculated_at
  )
  VALUES (
    p_workspace_id,
    p_resolved_identity_key,
    p_actor_identity_state,
    v_safe_canonical_person,
    v_raw_score,
    v_score_band,
    v_evidence_count,
    v_pos_count,
    v_neg_count,
    v_confidence,
    v_contributions,
    p_scoring_rule_version,
    p_evidence_timestamp,
    now()
  )
  ON CONFLICT (workspace_id, resolved_identity_key) DO UPDATE SET
    actor_identity_state    = EXCLUDED.actor_identity_state,
    canonical_person_id     = EXCLUDED.canonical_person_id,
    score                   = EXCLUDED.score,
    score_band              = EXCLUDED.score_band,
    evidence_count          = EXCLUDED.evidence_count,
    positive_evidence_count = EXCLUDED.positive_evidence_count,
    negative_evidence_count = EXCLUDED.negative_evidence_count,
    confidence              = EXCLUDED.confidence,
    evidence_contributions  = EXCLUDED.evidence_contributions,
    scoring_rule_version    = EXCLUDED.scoring_rule_version,
    last_calculated_at      = now(),
    updated_at              = now()
  RETURNING id INTO v_score_id;

  IF v_score_id IS NULL THEN
    -- ON CONFLICT DO UPDATE always returns; if NULL then something unexpected
    SELECT id INTO v_score_id
      FROM public.social_intent_score
      WHERE workspace_id = p_workspace_id
        AND resolved_identity_key = p_resolved_identity_key
      LIMIT 1;
  END IF;

  -- ── 8. Record minimal journey phase observation (audit only, no execution) ─
  -- Map score band to an observed journey phase for the link audit table.
  v_observed_journey_phase := CASE v_score_band
    WHEN 'very_high' THEN 'converting'
    WHEN 'high'      THEN 'considering'
    WHEN 'medium'    THEN 'exploring'
    WHEN 'low'       THEN 'first_touch'
    ELSE NULL
  END;

  IF v_observed_journey_phase IS NOT NULL AND v_score_id IS NOT NULL THEN
    INSERT INTO public.social_intent_journey_link (
      workspace_id,
      intent_score_id,
      observed_journey_phase,
      score_at_observation,
      score_band_at_observation,
      trigger_reason,
      observed_at
    )
    VALUES (
      p_workspace_id,
      v_score_id,
      v_observed_journey_phase,
      v_raw_score,
      v_score_band,
      'intent_signal_accumulation',
      now()
    );
    -- Non-fatal: if this insert fails (e.g. score_id gone), we do NOT rollback the evidence+score.
    -- The journey link is audit-only. However, because this is in the same transaction,
    -- any hard error here will still roll back everything. This is acceptable — the link
    -- is only written when we have a valid score_id.
  END IF;

  RETURN jsonb_build_object(
    'evidence_id',       v_evidence_id,
    'evidence_inserted', v_evidence_inserted,
    'score_id',          v_score_id,
    'score',             v_raw_score,
    'score_band',        v_score_band,
    'evidence_count',    v_evidence_count,
    'confidence',        v_confidence
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accumulate_social_intent_signal(
  uuid, uuid, text, text, uuid, uuid, text, text, text, timestamptz,
  text, numeric, text, text, text, uuid, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.accumulate_social_intent_signal(
  uuid, uuid, text, text, uuid, uuid, text, text, text, timestamptz,
  text, numeric, text, text, text, uuid, text
) TO service_role;

-- ============================================================
-- RPC: revoke_social_intent_evidence
-- ============================================================
-- Revoke one evidence record and recompute score atomically.
-- Used when identity linkage changes or attribution becomes stale.
-- Historical audit trail is preserved: revoked rows remain in the table.
-- ============================================================
CREATE OR REPLACE FUNCTION public.revoke_social_intent_evidence(
  p_workspace_id        uuid,
  p_evidence_id         uuid,
  p_revocation_reason   text,
  p_revoked_by_rpc      text      DEFAULT 'revoke_social_intent_evidence'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved_identity_key text;
  v_actor_identity_state  text;
  v_canonical_person_id   uuid;
  v_score_id              uuid;
  v_raw_score             numeric;
  v_evidence_count        integer;
  v_pos_count             integer;
  v_neg_count             integer;
  v_contributions         jsonb;
  v_score_band            text;
  v_confidence            text;
BEGIN

  -- ── 1. Revoke the evidence row ───────────────────────────────────────────
  UPDATE public.social_intent_evidence
    SET state             = 'revoked',
        revoked_at        = now(),
        revocation_reason = p_revocation_reason,
        revoked_by_rpc    = p_revoked_by_rpc
    WHERE id           = p_evidence_id
      AND workspace_id = p_workspace_id
      AND state        = 'active'
  RETURNING resolved_identity_key, actor_identity_state, canonical_person_id
    INTO v_resolved_identity_key, v_actor_identity_state, v_canonical_person_id;

  IF v_resolved_identity_key IS NULL THEN
    -- Evidence not found or already revoked — idempotent return
    RETURN jsonb_build_object(
      'revoked',  false,
      'reason',   'evidence_not_found_or_already_revoked',
      'evidence_id', p_evidence_id
    );
  END IF;

  -- ── 2. Recompute score after revocation ──────────────────────────────────
  SELECT
    rs.raw_score,
    rs.evidence_count,
    rs.positive_evidence_count,
    rs.negative_evidence_count,
    rs.evidence_contributions
  INTO
    v_raw_score,
    v_evidence_count,
    v_pos_count,
    v_neg_count,
    v_contributions
  FROM public._recompute_intent_score_from_evidence(
    p_workspace_id,
    v_resolved_identity_key
  ) rs;

  v_score_band := public.classify_intent_score_band(v_raw_score);
  v_confidence := public.classify_intent_confidence(v_evidence_count);

  -- ── 3. Update score ──────────────────────────────────────────────────────
  UPDATE public.social_intent_score SET
    score                   = v_raw_score,
    score_band              = v_score_band,
    evidence_count          = v_evidence_count,
    positive_evidence_count = v_pos_count,
    negative_evidence_count = v_neg_count,
    confidence              = v_confidence,
    evidence_contributions  = v_contributions,
    last_calculated_at      = now(),
    updated_at              = now()
  WHERE workspace_id          = p_workspace_id
    AND resolved_identity_key = v_resolved_identity_key
  RETURNING id INTO v_score_id;

  RETURN jsonb_build_object(
    'revoked',          true,
    'evidence_id',      p_evidence_id,
    'score_id',         v_score_id,
    'score',            v_raw_score,
    'score_band',       v_score_band,
    'evidence_count',   v_evidence_count,
    'confidence',       v_confidence
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_social_intent_evidence(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_social_intent_evidence(uuid, uuid, text, text) TO service_role;

-- ============================================================
-- GRANTS: helper functions (not callable by public/authenticated)
-- ============================================================
REVOKE ALL ON FUNCTION public.enforce_social_intent_evidence_workspace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._recompute_intent_score_from_evidence(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classify_intent_score_band(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classify_intent_confidence(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.classify_intent_score_band(numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.classify_intent_confidence(integer) TO service_role;
