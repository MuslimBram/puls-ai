-- SOCIAL-1D: Evidence-Based Social Intent Score + Journey Integration
--
-- Purpose:
--   Add a canonical, workspace-scoped, explainable and retry-safe persistence
--   layer for SOCIAL-1D intent evidence and derived intent scores.
--
-- Reuses (does not recreate):
--   - SOCIAL-1A: public.social_engagement_events
--   - SOCIAL-1B: public.canonical_persons / identity_nodes / identity_links
--   - SOCIAL-1C: public.social_interest_memory / social_interest_evidence
--   - Existing Journey tables/functions (no second Journey taxonomy is created here)
--
-- Important boundaries:
--   - anonymous_aggregate never receives person-level intent state
--   - non-known identities never carry canonical_person_id
--   - known_person requires a current, same-workspace canonical person
--   - duplicate evidence is counted exactly once
--   - concurrent distinct evidence for one identity is serialized transactionally
--   - revoked evidence is retained for audit and excluded from active scores
--   - no messages, offers, campaigns, NBA execution, bookings, or other commercial
--     actions are performed by this migration
--
-- Scoring boundary:
--   Runtime supplies deterministic base weight + recency_factor (both 0..1).
--   PostgreSQL persists and recomputes the bounded score transactionally from
--   canonical active evidence. This avoids embedding opaque AI/ML logic in SQL.
--
-- Rollback implication:
--   Dropping social_intent_score and social_intent_evidence removes SOCIAL-1D
--   durable intent state only; SOCIAL-1A/1B/1C and Journey data remain intact.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'set_updated_at'
      AND n.nspname = 'public'
      AND p.pronargs = 0
  ) THEN
    CREATE FUNCTION public.set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.social_intent_evidence (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL,
  resolved_identity_key text NOT NULL,
  actor_identity_state  text NOT NULL
    CHECK (actor_identity_state IN ('known_person','platform_actor','pseudonymous_visitor')),
  canonical_person_id   uuid REFERENCES public.canonical_persons(id) ON DELETE RESTRICT,
  engagement_event_id   uuid REFERENCES public.social_engagement_events(id) ON DELETE RESTRICT,
  interest_memory_id    uuid REFERENCES public.social_interest_memory(id) ON DELETE SET NULL,
  evidence_type         text NOT NULL
    CHECK (evidence_type IN (
      'inbound_message','pricing_inquiry','demo_booking_request',
      'purchase_related_language','explicit_product_interest',
      'repeated_interest_signal','objection_signal','support_only_language',
      'recency_decay'
    )),
  evidence_timestamp    timestamptz NOT NULL,
  direction             text NOT NULL CHECK (direction IN ('positive','negative','neutral')),
  weight                 numeric(5,4) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  recency_factor         numeric(5,4) NOT NULL DEFAULT 1.0000
    CHECK (recency_factor >= 0 AND recency_factor <= 1),
  effective_contribution numeric(7,6)
    GENERATED ALWAYS AS (
      CASE direction
        WHEN 'positive' THEN weight * recency_factor
        WHEN 'negative' THEN -weight * recency_factor
        ELSE 0::numeric
      END
    ) STORED,
  source_ref             text NOT NULL,
  idempotency_key        text NOT NULL,
  state                  text NOT NULL DEFAULT 'active' CHECK (state IN ('active','revoked')),
  revoked_at             timestamptz,
  revocation_reason      text,
  revoked_by_rpc         text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_social_intent_evidence_source
    CHECK (engagement_event_id IS NOT NULL OR interest_memory_id IS NOT NULL),
  CONSTRAINT chk_social_intent_known_person_has_person
    CHECK (actor_identity_state <> 'known_person' OR canonical_person_id IS NOT NULL),
  CONSTRAINT chk_social_intent_nonknown_has_no_person
    CHECK (actor_identity_state = 'known_person' OR canonical_person_id IS NULL),
  CONSTRAINT chk_social_intent_revocation_shape
    CHECK (
      (state = 'active' AND revoked_at IS NULL)
      OR (state = 'revoked' AND revoked_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_intent_evidence_idempotency
  ON public.social_intent_evidence (workspace_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_social_intent_evidence_identity
  ON public.social_intent_evidence (workspace_id,resolved_identity_key,state,evidence_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_social_intent_evidence_event
  ON public.social_intent_evidence (workspace_id,engagement_event_id)
  WHERE engagement_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_intent_evidence_memory
  ON public.social_intent_evidence (workspace_id,interest_memory_id)
  WHERE interest_memory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_intent_evidence_person
  ON public.social_intent_evidence (workspace_id,canonical_person_id,state,evidence_timestamp DESC)
  WHERE canonical_person_id IS NOT NULL;

ALTER TABLE public.social_intent_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_select_social_intent_evidence"
  ON public.social_intent_evidence FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "service_role_all_social_intent_evidence"
  ON public.social_intent_evidence FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.social_intent_score (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            uuid NOT NULL,
  resolved_identity_key   text NOT NULL,
  canonical_person_id     uuid REFERENCES public.canonical_persons(id) ON DELETE RESTRICT,
  identity_state          text NOT NULL
    CHECK (identity_state IN ('known_person','platform_actor','pseudonymous_visitor')),
  score                   numeric(6,4) NOT NULL DEFAULT 0.0000 CHECK (score >= 0 AND score <= 1),
  score_band              text NOT NULL DEFAULT 'none'
    CHECK (score_band IN ('none','low','moderate','strong','high')),
  evidence_count          integer NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  positive_evidence_count integer NOT NULL DEFAULT 0 CHECK (positive_evidence_count >= 0),
  negative_evidence_count integer NOT NULL DEFAULT 0 CHECK (negative_evidence_count >= 0),
  confidence              text NOT NULL DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  evidence_contributions  jsonb NOT NULL DEFAULT '[]'::jsonb,
  scoring_rule_version    text NOT NULL DEFAULT '1.0.0',
  first_observed_at       timestamptz NOT NULL,
  last_calculated_at      timestamptz NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_social_intent_score_known_person_has_person
    CHECK (identity_state <> 'known_person' OR canonical_person_id IS NOT NULL),
  CONSTRAINT chk_social_intent_score_nonknown_has_no_person
    CHECK (identity_state = 'known_person' OR canonical_person_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_intent_score_identity
  ON public.social_intent_score (workspace_id,resolved_identity_key);
CREATE INDEX IF NOT EXISTS idx_social_intent_score_workspace
  ON public.social_intent_score (workspace_id,score DESC,last_calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_intent_score_person
  ON public.social_intent_score (workspace_id,canonical_person_id,score DESC)
  WHERE canonical_person_id IS NOT NULL;

ALTER TABLE public.social_intent_score ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_select_social_intent_score"
  ON public.social_intent_score FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "service_role_all_social_intent_score"
  ON public.social_intent_score FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_social_intent_score_updated_at
  BEFORE UPDATE ON public.social_intent_score
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_social_intent_evidence_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_workspace uuid;
  v_event_provider text;
  v_event_scope text;
  v_event_actor_id text;
  v_event_identity_state text;
  v_memory_workspace uuid;
  v_memory_identity_key text;
  v_memory_identity_state text;
  v_memory_person_id uuid;
  v_memory_state text;
  v_person_workspace uuid;
  v_valid_link_count integer;
BEGIN
  IF NEW.actor_identity_state NOT IN ('known_person','platform_actor','pseudonymous_visitor') THEN
    RAISE EXCEPTION 'social_intent_evidence: anonymous/unsupported identity state %', NEW.actor_identity_state;
  END IF;

  IF NEW.actor_identity_state = 'known_person' THEN
    IF NEW.canonical_person_id IS NULL THEN
      RAISE EXCEPTION 'social_intent_evidence: known_person requires canonical_person_id';
    END IF;
    SELECT workspace_id INTO v_person_workspace
      FROM public.canonical_persons WHERE id = NEW.canonical_person_id;
    IF v_person_workspace IS NULL THEN
      RAISE EXCEPTION 'social_intent_evidence: canonical_person_id % not found', NEW.canonical_person_id;
    END IF;
    IF v_person_workspace IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'social_intent_evidence: canonical person workspace (%) does not match evidence workspace (%)',
        v_person_workspace, NEW.workspace_id;
    END IF;
  ELSIF NEW.canonical_person_id IS NOT NULL THEN
    RAISE EXCEPTION 'social_intent_evidence: non-known identity may not carry canonical_person_id';
  END IF;

  IF NEW.engagement_event_id IS NOT NULL THEN
    SELECT workspace_id,provider,account_identifier,actor_provider_id,actor_identity_state
    INTO v_event_workspace,v_event_provider,v_event_scope,v_event_actor_id,v_event_identity_state
    FROM public.social_engagement_events WHERE id = NEW.engagement_event_id;
    IF v_event_workspace IS NULL THEN
      RAISE EXCEPTION 'social_intent_evidence: engagement_event_id % not found', NEW.engagement_event_id;
    END IF;
    IF v_event_workspace IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'social_intent_evidence: event workspace (%) does not match evidence workspace (%)',
        v_event_workspace, NEW.workspace_id;
    END IF;
    IF v_event_identity_state = 'anonymous_aggregate' THEN
      RAISE EXCEPTION 'social_intent_evidence: anonymous_aggregate event cannot create person-level intent evidence';
    END IF;
    IF NEW.actor_identity_state = 'known_person' THEN
      IF v_event_actor_id IS NULL THEN
        RAISE EXCEPTION 'social_intent_evidence: known_person source event requires actor_provider_id';
      END IF;
      SELECT COUNT(*) INTO v_valid_link_count
      FROM public.identity_nodes n
      JOIN public.identity_links l
        ON l.identity_node_id = n.id AND l.workspace_id = n.workspace_id
      WHERE n.workspace_id = NEW.workspace_id
        AND n.node_type = 'provider_actor'
        AND n.provider = v_event_provider
        AND n.provider_scope = v_event_scope
        AND n.normalized_value = LOWER(TRIM(v_event_actor_id))
        AND l.canonical_person_id = NEW.canonical_person_id
        AND l.is_revoked = false
        AND l.confidence = 'deterministic';
      IF v_valid_link_count = 0 THEN
        RAISE EXCEPTION 'social_intent_evidence: known_person source no longer has an active deterministic linkage';
      END IF;
    END IF;
  END IF;

  IF NEW.interest_memory_id IS NOT NULL THEN
    SELECT workspace_id,resolved_identity_key,actor_identity_state,canonical_person_id,state
    INTO v_memory_workspace,v_memory_identity_key,v_memory_identity_state,v_memory_person_id,v_memory_state
    FROM public.social_interest_memory WHERE id = NEW.interest_memory_id;
    IF v_memory_workspace IS NULL THEN
      RAISE EXCEPTION 'social_intent_evidence: interest_memory_id % not found', NEW.interest_memory_id;
    END IF;
    IF v_memory_workspace IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'social_intent_evidence: interest memory workspace (%) does not match evidence workspace (%)',
        v_memory_workspace, NEW.workspace_id;
    END IF;
    IF v_memory_identity_key IS DISTINCT FROM NEW.resolved_identity_key THEN
      RAISE EXCEPTION 'social_intent_evidence: interest memory identity key does not match evidence identity key';
    END IF;
    IF v_memory_identity_state IS DISTINCT FROM NEW.actor_identity_state THEN
      RAISE EXCEPTION 'social_intent_evidence: interest memory identity state (%) does not match evidence identity state (%)',
        v_memory_identity_state, NEW.actor_identity_state;
    END IF;
    IF v_memory_state <> 'active' AND NEW.state = 'active' THEN
      RAISE EXCEPTION 'social_intent_evidence: active intent evidence cannot derive from inactive interest memory';
    END IF;
    IF NEW.actor_identity_state = 'known_person' AND v_memory_person_id IS DISTINCT FROM NEW.canonical_person_id THEN
      RAISE EXCEPTION 'social_intent_evidence: interest memory canonical person does not match intent evidence canonical person';
    END IF;
    IF NEW.actor_identity_state <> 'known_person' AND v_memory_person_id IS NOT NULL THEN
      RAISE EXCEPTION 'social_intent_evidence: non-known interest memory may not carry canonical person attribution';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_social_intent_evidence_workspace
  BEFORE INSERT OR UPDATE ON public.social_intent_evidence
  FOR EACH ROW EXECUTE FUNCTION public.enforce_social_intent_evidence_workspace();

CREATE OR REPLACE FUNCTION public.classify_intent_score_band(p_score numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_score,0) < 0.2 THEN 'none'
    WHEN p_score < 0.4 THEN 'low'
    WHEN p_score < 0.6 THEN 'moderate'
    WHEN p_score < 0.8 THEN 'strong'
    ELSE 'high'
  END;
$$;

CREATE OR REPLACE FUNCTION public.classify_intent_confidence(p_evidence_count integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_evidence_count,0) <= 1 THEN 'low'
    WHEN p_evidence_count <= 3 THEN 'medium'
    ELSE 'high'
  END;
$$;

CREATE OR REPLACE FUNCTION public._recompute_intent_score_from_evidence(
  p_workspace_id uuid,
  p_resolved_identity_key text
)
RETURNS TABLE (
  raw_score numeric,
  evidence_count integer,
  positive_evidence_count integer,
  negative_evidence_count integer,
  first_observed_at timestamptz,
  evidence_contributions jsonb
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    ROUND(LEAST(1::numeric,GREATEST(0::numeric,COALESCE(SUM(e.effective_contribution),0::numeric))),4),
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE e.direction = 'positive')::integer,
    COUNT(*) FILTER (WHERE e.direction = 'negative')::integer,
    MIN(e.evidence_timestamp),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'evidence_id',e.id,'evidence_type',e.evidence_type,'direction',e.direction,
          'weight',e.weight,'recency_factor',e.recency_factor,
          'contribution',e.effective_contribution,'source_ref',e.source_ref,
          'evidence_timestamp',e.evidence_timestamp
        ) ORDER BY e.evidence_timestamp,e.id
      ),
      '[]'::jsonb
    )
  FROM public.social_intent_evidence e
  WHERE e.workspace_id = p_workspace_id
    AND e.resolved_identity_key = p_resolved_identity_key
    AND e.state = 'active';
$$;

CREATE OR REPLACE FUNCTION public.accumulate_social_intent_signal(
  p_workspace_id uuid,
  p_resolved_identity_key text,
  p_actor_identity_state text,
  p_canonical_person_id uuid,
  p_engagement_event_id uuid,
  p_interest_memory_id uuid,
  p_evidence_type text,
  p_evidence_timestamp timestamptz,
  p_direction text,
  p_weight numeric,
  p_recency_factor numeric,
  p_source_ref text,
  p_idempotency_key text,
  p_scoring_rule_version text DEFAULT '1.0.0'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evidence_id uuid;
  v_existing_identity_key text;
  v_existing_state text;
  v_inserted boolean := false;
  v_score_id uuid;
  v_raw_score numeric;
  v_evidence_count integer;
  v_pos_count integer;
  v_neg_count integer;
  v_first_observed_at timestamptz;
  v_contributions jsonb;
  v_score_band text;
  v_confidence text;
BEGIN
  IF p_workspace_id IS NULL THEN RAISE EXCEPTION 'accumulate_social_intent_signal: workspace_id is required'; END IF;
  IF NULLIF(TRIM(p_resolved_identity_key),'') IS NULL THEN RAISE EXCEPTION 'accumulate_social_intent_signal: resolved_identity_key is required'; END IF;
  IF p_actor_identity_state NOT IN ('known_person','platform_actor','pseudonymous_visitor') THEN
    RAISE EXCEPTION 'accumulate_social_intent_signal: invalid/anonymous identity_state %',p_actor_identity_state;
  END IF;
  IF p_actor_identity_state = 'known_person' AND p_canonical_person_id IS NULL THEN
    RAISE EXCEPTION 'accumulate_social_intent_signal: known_person requires canonical_person_id';
  END IF;
  IF p_actor_identity_state <> 'known_person' AND p_canonical_person_id IS NOT NULL THEN
    RAISE EXCEPTION 'accumulate_social_intent_signal: non-known identity may not carry canonical_person_id';
  END IF;
  IF p_engagement_event_id IS NULL AND p_interest_memory_id IS NULL THEN
    RAISE EXCEPTION 'accumulate_social_intent_signal: canonical source event or interest memory is required';
  END IF;
  IF p_evidence_type NOT IN ('inbound_message','pricing_inquiry','demo_booking_request','purchase_related_language','explicit_product_interest','repeated_interest_signal','objection_signal','support_only_language','recency_decay') THEN
    RAISE EXCEPTION 'accumulate_social_intent_signal: invalid evidence_type %',p_evidence_type;
  END IF;
  IF p_direction NOT IN ('positive','negative','neutral') THEN
    RAISE EXCEPTION 'accumulate_social_intent_signal: invalid direction %',p_direction;
  END IF;
  IF p_weight IS NULL OR p_weight < 0 OR p_weight > 1 THEN
    RAISE EXCEPTION 'accumulate_social_intent_signal: weight must be between 0 and 1';
  END IF;
  IF p_recency_factor IS NULL OR p_recency_factor < 0 OR p_recency_factor > 1 THEN
    RAISE EXCEPTION 'accumulate_social_intent_signal: recency_factor must be between 0 and 1';
  END IF;
  IF NULLIF(TRIM(p_source_ref),'') IS NULL THEN RAISE EXCEPTION 'accumulate_social_intent_signal: source_ref is required'; END IF;
  IF NULLIF(TRIM(p_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'accumulate_social_intent_signal: idempotency_key is required'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text),hashtext(p_resolved_identity_key));

  INSERT INTO public.social_intent_evidence (
    workspace_id,resolved_identity_key,actor_identity_state,canonical_person_id,
    engagement_event_id,interest_memory_id,evidence_type,evidence_timestamp,direction,
    weight,recency_factor,source_ref,idempotency_key,state
  ) VALUES (
    p_workspace_id,p_resolved_identity_key,p_actor_identity_state,p_canonical_person_id,
    p_engagement_event_id,p_interest_memory_id,p_evidence_type,p_evidence_timestamp,p_direction,
    p_weight,p_recency_factor,p_source_ref,p_idempotency_key,'active'
  )
  ON CONFLICT (workspace_id,idempotency_key) DO NOTHING
  RETURNING id INTO v_evidence_id;

  IF v_evidence_id IS NOT NULL THEN
    v_inserted := true;
  ELSE
    SELECT id,resolved_identity_key,state
    INTO v_evidence_id,v_existing_identity_key,v_existing_state
    FROM public.social_intent_evidence
    WHERE workspace_id = p_workspace_id AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_evidence_id IS NULL THEN
      RAISE EXCEPTION 'accumulate_social_intent_signal: duplicate evidence could not be reloaded';
    END IF;
    IF v_existing_identity_key IS DISTINCT FROM p_resolved_identity_key THEN
      RAISE EXCEPTION 'accumulate_social_intent_signal: idempotency key already belongs to another identity';
    END IF;
    IF v_existing_state = 'revoked' THEN
      RETURN jsonb_build_object('evidence_inserted',false,'evidence_id',v_evidence_id,'evidence_state','revoked','score_recomputed',false);
    END IF;
  END IF;

  SELECT r.raw_score,r.evidence_count,r.positive_evidence_count,r.negative_evidence_count,
         r.first_observed_at,r.evidence_contributions
  INTO v_raw_score,v_evidence_count,v_pos_count,v_neg_count,v_first_observed_at,v_contributions
  FROM public._recompute_intent_score_from_evidence(p_workspace_id,p_resolved_identity_key) r;

  v_score_band := public.classify_intent_score_band(v_raw_score);
  v_confidence := public.classify_intent_confidence(v_evidence_count);

  INSERT INTO public.social_intent_score (
    workspace_id,resolved_identity_key,canonical_person_id,identity_state,score,score_band,
    evidence_count,positive_evidence_count,negative_evidence_count,confidence,
    evidence_contributions,scoring_rule_version,first_observed_at,last_calculated_at
  ) VALUES (
    p_workspace_id,p_resolved_identity_key,p_canonical_person_id,p_actor_identity_state,
    v_raw_score,v_score_band,v_evidence_count,v_pos_count,v_neg_count,v_confidence,
    v_contributions,COALESCE(NULLIF(TRIM(p_scoring_rule_version),''),'1.0.0'),
    COALESCE(v_first_observed_at,p_evidence_timestamp),now()
  )
  ON CONFLICT (workspace_id,resolved_identity_key) DO UPDATE SET
    canonical_person_id = EXCLUDED.canonical_person_id,
    identity_state = EXCLUDED.identity_state,
    score = EXCLUDED.score,
    score_band = EXCLUDED.score_band,
    evidence_count = EXCLUDED.evidence_count,
    positive_evidence_count = EXCLUDED.positive_evidence_count,
    negative_evidence_count = EXCLUDED.negative_evidence_count,
    confidence = EXCLUDED.confidence,
    evidence_contributions = EXCLUDED.evidence_contributions,
    scoring_rule_version = EXCLUDED.scoring_rule_version,
    first_observed_at = LEAST(public.social_intent_score.first_observed_at,EXCLUDED.first_observed_at),
    last_calculated_at = EXCLUDED.last_calculated_at
  RETURNING id INTO v_score_id;

  RETURN jsonb_build_object(
    'evidence_inserted',v_inserted,'evidence_id',v_evidence_id,'score_id',v_score_id,
    'score',v_raw_score,'score_band',v_score_band,'evidence_count',v_evidence_count,
    'confidence',v_confidence
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_social_intent_evidence_recency(
  p_workspace_id uuid,
  p_evidence_id uuid,
  p_recency_factor numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identity_key text;
  v_score_id uuid;
  v_raw_score numeric;
  v_evidence_count integer;
  v_pos_count integer;
  v_neg_count integer;
  v_first_observed_at timestamptz;
  v_contributions jsonb;
  v_score_band text;
  v_confidence text;
BEGIN
  IF p_recency_factor IS NULL OR p_recency_factor < 0 OR p_recency_factor > 1 THEN
    RAISE EXCEPTION 'refresh_social_intent_evidence_recency: recency_factor must be between 0 and 1';
  END IF;
  SELECT resolved_identity_key INTO v_identity_key
  FROM public.social_intent_evidence
  WHERE id = p_evidence_id AND workspace_id = p_workspace_id;
  IF v_identity_key IS NULL THEN
    RETURN jsonb_build_object('updated',false,'reason','evidence_not_found','evidence_id',p_evidence_id);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text),hashtext(v_identity_key));
  UPDATE public.social_intent_evidence
  SET recency_factor = p_recency_factor
  WHERE id = p_evidence_id AND workspace_id = p_workspace_id AND state = 'active';

  SELECT r.raw_score,r.evidence_count,r.positive_evidence_count,r.negative_evidence_count,
         r.first_observed_at,r.evidence_contributions
  INTO v_raw_score,v_evidence_count,v_pos_count,v_neg_count,v_first_observed_at,v_contributions
  FROM public._recompute_intent_score_from_evidence(p_workspace_id,v_identity_key) r;
  v_score_band := public.classify_intent_score_band(v_raw_score);
  v_confidence := public.classify_intent_confidence(v_evidence_count);

  UPDATE public.social_intent_score SET
    score = v_raw_score,score_band = v_score_band,evidence_count = v_evidence_count,
    positive_evidence_count = v_pos_count,negative_evidence_count = v_neg_count,
    confidence = v_confidence,evidence_contributions = v_contributions,
    first_observed_at = COALESCE(v_first_observed_at,first_observed_at),
    last_calculated_at = now()
  WHERE workspace_id = p_workspace_id AND resolved_identity_key = v_identity_key
  RETURNING id INTO v_score_id;

  RETURN jsonb_build_object('updated',true,'evidence_id',p_evidence_id,'score_id',v_score_id,
    'score',v_raw_score,'score_band',v_score_band,'evidence_count',v_evidence_count,
    'confidence',v_confidence);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_social_intent_evidence(
  p_workspace_id uuid,
  p_evidence_id uuid,
  p_revocation_reason text,
  p_revoked_by_rpc text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved_identity_key text;
  v_score_id uuid;
  v_raw_score numeric;
  v_evidence_count integer;
  v_pos_count integer;
  v_neg_count integer;
  v_first_observed_at timestamptz;
  v_contributions jsonb;
  v_score_band text;
  v_confidence text;
BEGIN
  SELECT resolved_identity_key INTO v_resolved_identity_key
  FROM public.social_intent_evidence
  WHERE id = p_evidence_id AND workspace_id = p_workspace_id;
  IF v_resolved_identity_key IS NULL THEN
    RETURN jsonb_build_object('revoked',false,'reason','evidence_not_found','evidence_id',p_evidence_id);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text),hashtext(v_resolved_identity_key));
  UPDATE public.social_intent_evidence SET
    state = 'revoked',revoked_at = now(),
    revocation_reason = COALESCE(NULLIF(TRIM(p_revocation_reason),''),'revoked'),
    revoked_by_rpc = NULLIF(TRIM(p_revoked_by_rpc),'')
  WHERE id = p_evidence_id AND workspace_id = p_workspace_id AND state = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('revoked',false,'reason','evidence_already_revoked','evidence_id',p_evidence_id);
  END IF;

  SELECT r.raw_score,r.evidence_count,r.positive_evidence_count,r.negative_evidence_count,
         r.first_observed_at,r.evidence_contributions
  INTO v_raw_score,v_evidence_count,v_pos_count,v_neg_count,v_first_observed_at,v_contributions
  FROM public._recompute_intent_score_from_evidence(p_workspace_id,v_resolved_identity_key) r;
  v_score_band := public.classify_intent_score_band(v_raw_score);
  v_confidence := public.classify_intent_confidence(v_evidence_count);

  UPDATE public.social_intent_score SET
    score = v_raw_score,score_band = v_score_band,evidence_count = v_evidence_count,
    positive_evidence_count = v_pos_count,negative_evidence_count = v_neg_count,
    confidence = v_confidence,evidence_contributions = v_contributions,
    first_observed_at = COALESCE(v_first_observed_at,first_observed_at),
    last_calculated_at = now()
  WHERE workspace_id = p_workspace_id AND resolved_identity_key = v_resolved_identity_key
  RETURNING id INTO v_score_id;

  RETURN jsonb_build_object('revoked',true,'evidence_id',p_evidence_id,'score_id',v_score_id,
    'score',v_raw_score,'score_band',v_score_band,'evidence_count',v_evidence_count,
    'confidence',v_confidence);
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_social_intent_evidence_workspace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classify_intent_score_band(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classify_intent_confidence(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._recompute_intent_score_from_evidence(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accumulate_social_intent_signal(uuid,text,text,uuid,uuid,uuid,text,timestamptz,text,numeric,numeric,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_social_intent_evidence_recency(uuid,uuid,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_social_intent_evidence(uuid,uuid,text,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.classify_intent_score_band(numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.classify_intent_confidence(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public._recompute_intent_score_from_evidence(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.accumulate_social_intent_signal(uuid,text,text,uuid,uuid,uuid,text,timestamptz,text,numeric,numeric,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_social_intent_evidence_recency(uuid,uuid,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_social_intent_evidence(uuid,uuid,text,text) TO service_role;
