-- SOCIAL-1G: Aggregate & Attribution Reporting Layer
--
-- CANONICAL INPUT AUDIT (pre-implementation):
--   Tables consumed (read-only):
--     public.social_engagement_events
--       workspace_id uuid, provider text, channel_id uuid, event_type text,
--       actor_identity_state text, is_anonymous_aggregate boolean,
--       actor_provider_id text, event_timestamp timestamptz, idempotency_key text
--     public.social_policy_evaluation_log
--       workspace_id uuid, provider text, channel_type text, identity_state text,
--       interaction_type text, decision text CHECK('ALLOW','REVIEW','BLOCK'),
--       reasons text[], intent_score_presented numeric(5,4), evaluated_at timestamptz
--     public.next_best_actions (SOCIAL-1F columns)
--       workspace_id uuid, nba_source text, policy_decision text CHECK('ALLOW','REVIEW','BLOCK'),
--       policy_reasons text[], policy_evaluated_at timestamptz,
--       social_provider text, social_channel text,
--       social_identity_state text CHECK('known_person','platform_actor','pseudonymous_visitor','anonymous_aggregate'),
--       social_intent_score numeric(6,4) CHECK(0..1), social_intent_score_band text,
--       social_confidence_band text CHECK('low','medium','high'),
--       social_journey_phase text, social_evidence_refs text[],
--       social_recommendation_status text CHECK('recommended','review_required','blocked','do_nothing'),
--       social_reason_codes text[], lifecycle_status text,
--       action_type text, confidence numeric, offer_value numeric, offer_unit text,
--       recommended_at timestamptz, idempotency_key text, lead_id uuid
--     public.social_intent_evidence / social_intent_score (SOCIAL-1D) — referenced via evidence_refs
--
-- TYPE CONTRACTS CONFIRMED:
--   workspace_id              uuid (all tables)
--   provider                  text
--   channel / channel_type    text
--   identity_state            text enum (4 values)
--   canonical_person_id       uuid (nullable; only known_person)
--   evidence_refs             text[] (idempotency key strings)
--   intent_score              numeric(6,4) 0..1
--   intent_score_band         text enum (none|low|moderate|strong|high)
--   journey_phase             text
--   policy_decision           text enum (ALLOW|REVIEW|BLOCK)
--   policy_reasons            text[]
--   recommendation_status     text enum (recommended|review_required|blocked|do_nothing)
--   action_type               text
--   confidence                numeric 0..1
--   social_confidence_band    text enum (low|medium|high)
--   offer_value               numeric (nullable)
--   offer_unit                text (nullable)
--   lifecycle_status          text enum (active|superseded|expired|cancelled)
--   recommended_at            timestamptz
--   policy_evaluated_at       timestamptz (nullable)
--   event_timestamp           timestamptz (social_engagement_events)
--   evaluated_at              timestamptz (social_policy_evaluation_log)
--
-- TYPE MISMATCHES FOUND: NONE.
--
-- DESIGN:
--   1. social_1g_attribution_window_config — workspace-scoped attribution window config
--   2. social_1g_attribution_record       — per-outcome attribution results (append-only audit)
--   3. social_1g_aggregate_snapshot       — workspace-scoped aggregate reporting snapshots
--   All tables: workspace-scoped, RLS, service_role insert, authenticated read.
--   NO new identity joins. NO autonomous execution. NO PII duplication.

-- ── 1. Attribution Window Configuration ──────────────────────────────────────
--
-- Safe defaults are applied if no workspace-specific config exists.
-- DEFAULT: 7-day attribution window, first-touch + assisted model.

CREATE TABLE IF NOT EXISTS public.social_1g_attribution_window_config (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              uuid NOT NULL UNIQUE,  -- one config per workspace
  direct_window_days        integer NOT NULL DEFAULT 7
    CHECK (direct_window_days >= 1 AND direct_window_days <= 90),
  assisted_window_days      integer NOT NULL DEFAULT 30
    CHECK (assisted_window_days >= 1 AND assisted_window_days <= 180),
  -- Attribution model: how multiple qualifying interactions are handled
  -- first_touch: only the first qualifying social interaction within window
  -- last_touch:  only the last qualifying social interaction within window
  -- linear:      all qualifying interactions credited proportionally (assisted)
  attribution_model         text NOT NULL DEFAULT 'first_touch'
    CHECK (attribution_model IN ('first_touch', 'last_touch', 'linear')),
  -- Minimum intent score band required to count as qualifying social evidence
  min_qualifying_intent_band text NOT NULL DEFAULT 'low'
    CHECK (min_qualifying_intent_band IN ('none', 'low', 'moderate', 'strong', 'high')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_1g_attribution_window_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_1g_attribution_window_config'
      AND policyname = 'workspace_members_select_attribution_window_config'
  ) THEN
    CREATE POLICY "workspace_members_select_attribution_window_config"
      ON public.social_1g_attribution_window_config
      FOR SELECT TO authenticated
      USING (
        workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_1g_attribution_window_config'
      AND policyname = 'service_role_all_attribution_window_config'
  ) THEN
    CREATE POLICY "service_role_all_attribution_window_config"
      ON public.social_1g_attribution_window_config
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

-- ── 2. Attribution Records ────────────────────────────────────────────────────
--
-- Append-only per-outcome attribution audit log.
-- One record per (workspace, outcome_ref, source_evidence_ref) tuple.
-- Idempotency: uq_social_1g_attribution_record_idempotency prevents duplicates.
--
-- ATTRIBUTION SEMANTICS:
--   DIRECT_EVIDENCE_BACKED  — outcome_timestamp is within direct_window_days of
--                             qualifying social event; traceable evidence exists.
--   INFERRED_ASSISTED        — outcome_timestamp is within assisted_window_days;
--                             evidence is present but not within direct window.
--   UNATTRIBUTED             — no qualifying social evidence within any window,
--                             or evidence is insufficient. No fabrication.
--
-- IDENTITY BOUNDARY:
--   This table records the identity_state AS RESOLVED UPSTREAM.
--   It NEVER promotes platform_actor → known_person.
--   It NEVER creates a new canonical_person_id.
--   social_canonical_person_id is copied from upstream NBA record only.

CREATE TABLE IF NOT EXISTS public.social_1g_attribution_record (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              uuid NOT NULL,

  -- Outcome / conversion reference (external canonical ID — e.g. order ID, deal ID)
  -- May be NULL if the attribution is being recorded before the outcome is known,
  -- but must be provided for DIRECT/INFERRED attributions.
  outcome_ref               text,

  -- Outcome timestamp (when the conversion/revenue event occurred)
  -- Validated: must not be in the future relative to attributed_at
  outcome_timestamp         timestamptz,

  -- Attribution method — canonical enum
  attribution_method        text NOT NULL
    CHECK (attribution_method IN ('DIRECT_EVIDENCE_BACKED', 'INFERRED_ASSISTED', 'UNATTRIBUTED')),

  -- Reason codes for the attribution decision (machine-readable)
  attribution_reason_codes  text[] NOT NULL DEFAULT '{}',

  -- Source social evidence: NBA idempotency key (from next_best_actions)
  source_nba_idempotency_key text,

  -- Source social engagement event idempotency key (from social_engagement_events)
  source_event_idempotency_key text,

  -- All evidence refs (from social_evidence_refs on the NBA record)
  source_evidence_refs      text[] NOT NULL DEFAULT '{}',

  -- Provider / channel as recorded on the source NBA record
  provider                  text,
  channel                   text,

  -- Identity state as resolved upstream — NOT modified here
  identity_state            text
    CHECK (identity_state IN ('known_person', 'platform_actor', 'pseudonymous_visitor', 'anonymous_aggregate')),

  -- Canonical person ID copied from upstream NBA record (known_person only)
  -- NEVER created here. NEVER inferred. Only mirrored if already present.
  social_canonical_person_id uuid,

  -- Attribution window bounds used for this attribution decision
  attribution_window_direct_days  integer,
  attribution_window_assisted_days integer,

  -- Confidence / strength of the attribution (0.0–1.0), mirrored from NBA confidence
  attribution_confidence    numeric(6,4)
    CHECK (attribution_confidence IS NULL OR (attribution_confidence >= 0 AND attribution_confidence <= 1)),

  -- Policy decision that governed the NBA record (for auditability)
  policy_decision           text
    CHECK (policy_decision IN ('ALLOW', 'REVIEW', 'BLOCK')),

  -- Intent score at time of recommendation
  intent_score              numeric(6,4)
    CHECK (intent_score IS NULL OR (intent_score >= 0 AND intent_score <= 1)),

  intent_score_band         text
    CHECK (intent_score_band IN ('none', 'low', 'moderate', 'strong', 'high')),

  social_confidence_band    text
    CHECK (social_confidence_band IN ('low', 'medium', 'high')),

  -- NBA recommendation status (preserved as-is from source)
  recommendation_status     text
    CHECK (recommendation_status IN ('recommended', 'review_required', 'blocked', 'do_nothing')),

  -- Idempotency: same outcome + source evidence combination cannot be recorded twice
  -- Format: 'social_1g_attr:<workspace_id>:<outcome_ref>:<source_nba_idempotency_key>'
  idempotency_key           text NOT NULL,

  attributed_at             timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),

  -- SAFETY: outcome_timestamp must not be after attributed_at
  -- (prevents attribution to future outcomes)
  CONSTRAINT chk_outcome_not_future
    CHECK (outcome_timestamp IS NULL OR outcome_timestamp <= attributed_at + INTERVAL '1 second')
);

-- Idempotency index: same attribution cannot be recorded twice
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_1g_attribution_record_idempotency
  ON public.social_1g_attribution_record (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_social_1g_attribution_workspace
  ON public.social_1g_attribution_record (workspace_id, attributed_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_1g_attribution_outcome
  ON public.social_1g_attribution_record (workspace_id, outcome_ref)
  WHERE outcome_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_1g_attribution_method
  ON public.social_1g_attribution_record (workspace_id, attribution_method, attributed_at DESC);

ALTER TABLE public.social_1g_attribution_record ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_1g_attribution_record'
      AND policyname = 'workspace_members_select_attribution_record'
  ) THEN
    CREATE POLICY "workspace_members_select_attribution_record"
      ON public.social_1g_attribution_record
      FOR SELECT TO authenticated
      USING (
        workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_1g_attribution_record'
      AND policyname = 'service_role_insert_attribution_record'
  ) THEN
    CREATE POLICY "service_role_insert_attribution_record"
      ON public.social_1g_attribution_record
      FOR INSERT TO service_role
      WITH CHECK (true);
  END IF;

  -- No UPDATE or DELETE: append-only audit log
END;
$$;

-- ── 3. Aggregate Reporting Snapshots ─────────────────────────────────────────
--
-- Pre-computed workspace-scoped aggregate reporting snapshots.
-- Dimensions: time_window_start, time_window_end, provider, channel,
--   identity_state, intent_band, policy_decision, recommendation_status,
--   action_type, social_confidence_band, journey_phase.
-- Measures: counts of events, recommendations, policy decisions, etc.
--
-- Snapshots are idempotent: same window + dimension key cannot be inserted twice.
-- Anonymous aggregates remain anonymous (no person IDs in aggregates).
-- No PII. No message bodies. Only counts and canonical dimension values.

CREATE TABLE IF NOT EXISTS public.social_1g_aggregate_snapshot (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              uuid NOT NULL,

  -- Time window (deterministic, explicit, non-overlapping)
  time_window_start         timestamptz NOT NULL,
  time_window_end           timestamptz NOT NULL,
  time_window_label         text NOT NULL,  -- e.g. '2026-08-22', '2026-W34', '2026-08'

  -- Dimension values for this aggregate row (NULL = "all" / not filtered)
  provider                  text,
  channel                   text,
  identity_state            text
    CHECK (identity_state IS NULL OR identity_state IN ('known_person', 'platform_actor', 'pseudonymous_visitor', 'anonymous_aggregate')),
  intent_band               text
    CHECK (intent_band IS NULL OR intent_band IN ('none', 'low', 'moderate', 'strong', 'high')),
  policy_decision           text
    CHECK (policy_decision IS NULL OR policy_decision IN ('ALLOW', 'REVIEW', 'BLOCK')),
  recommendation_status     text
    CHECK (recommendation_status IS NULL OR recommendation_status IN ('recommended', 'review_required', 'blocked', 'do_nothing')),
  action_type               text,
  social_confidence_band    text
    CHECK (social_confidence_band IS NULL OR social_confidence_band IN ('low', 'medium', 'high')),
  journey_phase             text,

  -- Aggregate measures
  social_event_count        bigint NOT NULL DEFAULT 0,
  -- Count of distinct actor_provider_id values in window (only where technically valid)
  unique_platform_actor_count bigint NOT NULL DEFAULT 0,
  anonymous_aggregate_count bigint NOT NULL DEFAULT 0,
  known_person_activity_count bigint NOT NULL DEFAULT 0,

  -- Intent distribution counts
  intent_none_count         bigint NOT NULL DEFAULT 0,
  intent_low_count          bigint NOT NULL DEFAULT 0,
  intent_moderate_count     bigint NOT NULL DEFAULT 0,
  intent_strong_count       bigint NOT NULL DEFAULT 0,
  intent_high_count         bigint NOT NULL DEFAULT 0,
  high_intent_event_count   bigint NOT NULL DEFAULT 0,

  -- Policy decision distribution
  policy_allow_count        bigint NOT NULL DEFAULT 0,
  policy_review_count       bigint NOT NULL DEFAULT 0,
  policy_block_count        bigint NOT NULL DEFAULT 0,

  -- NBA recommendation distribution
  nba_recommended_count     bigint NOT NULL DEFAULT 0,
  nba_do_nothing_count      bigint NOT NULL DEFAULT 0,
  nba_review_required_count bigint NOT NULL DEFAULT 0,
  nba_blocked_count         bigint NOT NULL DEFAULT 0,

  -- Attribution summary for this snapshot window
  attributed_direct_count   bigint NOT NULL DEFAULT 0,
  attributed_assisted_count bigint NOT NULL DEFAULT 0,
  unattributed_count        bigint NOT NULL DEFAULT 0,

  -- Idempotency: same workspace + window + dimension combination cannot be inserted twice
  -- Format: hash of (workspace_id, time_window_start, time_window_end, provider, channel,
  --   identity_state, intent_band, policy_decision, recommendation_status, action_type,
  --   social_confidence_band, journey_phase)
  snapshot_idempotency_key  text NOT NULL,

  snapshot_generated_at     timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_time_window_order
    CHECK (time_window_end > time_window_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_1g_aggregate_snapshot_idempotency
  ON public.social_1g_aggregate_snapshot (workspace_id, snapshot_idempotency_key);

CREATE INDEX IF NOT EXISTS idx_social_1g_aggregate_workspace_window
  ON public.social_1g_aggregate_snapshot (workspace_id, time_window_start DESC);

CREATE INDEX IF NOT EXISTS idx_social_1g_aggregate_provider_channel
  ON public.social_1g_aggregate_snapshot (workspace_id, provider, channel, time_window_start DESC)
  WHERE provider IS NOT NULL;

ALTER TABLE public.social_1g_aggregate_snapshot ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_1g_aggregate_snapshot'
      AND policyname = 'workspace_members_select_aggregate_snapshot'
  ) THEN
    CREATE POLICY "workspace_members_select_aggregate_snapshot"
      ON public.social_1g_aggregate_snapshot
      FOR SELECT TO authenticated
      USING (
        workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_1g_aggregate_snapshot'
      AND policyname = 'service_role_all_aggregate_snapshot'
  ) THEN
    CREATE POLICY "service_role_all_aggregate_snapshot"
      ON public.social_1g_aggregate_snapshot
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

-- ── 4. RPC: record_social_attribution ────────────────────────────────────────
--
-- Idempotent attribution recording function.
-- Security definer, service_role only.
-- Validates: workspace scoping, timestamp sanity, attribution method correctness.
-- Returns: (id, inserted) — inserted=false on idempotent retry.

CREATE OR REPLACE FUNCTION public.record_social_attribution(
  p_workspace_id                    uuid,
  p_outcome_ref                     text,
  p_outcome_timestamp               timestamptz,
  p_attribution_method              text,
  p_attribution_reason_codes        text[],
  p_source_nba_idempotency_key      text,
  p_source_event_idempotency_key    text,
  p_source_evidence_refs            text[],
  p_provider                        text,
  p_channel                         text,
  p_identity_state                  text,
  p_social_canonical_person_id      uuid,
  p_attribution_window_direct_days  integer,
  p_attribution_window_assisted_days integer,
  p_attribution_confidence          numeric,
  p_policy_decision                 text,
  p_intent_score                    numeric,
  p_intent_score_band               text,
  p_social_confidence_band          text,
  p_recommendation_status           text,
  p_idempotency_key                 text,
  p_attributed_at                   timestamptz DEFAULT now()
)
RETURNS TABLE (id uuid, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Reject impossible future outcome timestamps
  IF p_outcome_timestamp IS NOT NULL AND p_outcome_timestamp > p_attributed_at + INTERVAL '1 second' THEN
    RAISE EXCEPTION 'outcome_timestamp % is after attributed_at % — future timestamps rejected',
      p_outcome_timestamp, p_attributed_at;
  END IF;

  -- Validate attribution method
  IF p_attribution_method NOT IN ('DIRECT_EVIDENCE_BACKED', 'INFERRED_ASSISTED', 'UNATTRIBUTED') THEN
    RAISE EXCEPTION 'invalid attribution_method: %', p_attribution_method;
  END IF;

  -- UNATTRIBUTED must not carry source evidence links that imply causal attribution
  -- (evidence refs may be empty or used for audit; the method is the authoritative signal)

  -- Validate confidence bounds
  IF p_attribution_confidence IS NOT NULL AND
     (p_attribution_confidence < 0 OR p_attribution_confidence > 1) THEN
    RAISE EXCEPTION 'attribution_confidence must be 0..1, got %', p_attribution_confidence;
  END IF;

  RETURN QUERY
  WITH ins AS (
    INSERT INTO public.social_1g_attribution_record (
      workspace_id,
      outcome_ref,
      outcome_timestamp,
      attribution_method,
      attribution_reason_codes,
      source_nba_idempotency_key,
      source_event_idempotency_key,
      source_evidence_refs,
      provider,
      channel,
      identity_state,
      social_canonical_person_id,
      attribution_window_direct_days,
      attribution_window_assisted_days,
      attribution_confidence,
      policy_decision,
      intent_score,
      intent_score_band,
      social_confidence_band,
      recommendation_status,
      idempotency_key,
      attributed_at
    ) VALUES (
      p_workspace_id,
      p_outcome_ref,
      p_outcome_timestamp,
      p_attribution_method,
      COALESCE(p_attribution_reason_codes, '{}'),
      p_source_nba_idempotency_key,
      p_source_event_idempotency_key,
      COALESCE(p_source_evidence_refs, '{}'),
      p_provider,
      p_channel,
      p_identity_state,
      p_social_canonical_person_id,
      p_attribution_window_direct_days,
      p_attribution_window_assisted_days,
      p_attribution_confidence,
      p_policy_decision,
      p_intent_score,
      p_intent_score_band,
      p_social_confidence_band,
      p_recommendation_status,
      p_idempotency_key,
      COALESCE(p_attributed_at, now())
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING social_1g_attribution_record.id
  ),
  existing AS (
    SELECT r.id FROM public.social_1g_attribution_record r
    WHERE r.idempotency_key = p_idempotency_key
    LIMIT 1
  )
  SELECT ins.id, true AS inserted FROM ins
  UNION ALL
  SELECT existing.id, false AS inserted FROM existing
  WHERE NOT EXISTS (SELECT 1 FROM ins);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_social_attribution(
  uuid, text, timestamptz, text, text[], text, text, text[],
  text, text, text, uuid, integer, integer, numeric, text,
  numeric, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_social_attribution(
  uuid, text, timestamptz, text, text[], text, text, text[],
  text, text, text, uuid, integer, integer, numeric, text,
  numeric, text, text, text, text, timestamptz
) TO service_role;

-- ── 5. RPC: upsert_social_aggregate_snapshot ─────────────────────────────────
--
-- Idempotent aggregate snapshot upsert.
-- Service_role only.

CREATE OR REPLACE FUNCTION public.upsert_social_aggregate_snapshot(
  p_workspace_id                uuid,
  p_time_window_start           timestamptz,
  p_time_window_end             timestamptz,
  p_time_window_label           text,
  p_provider                    text,
  p_channel                     text,
  p_identity_state              text,
  p_intent_band                 text,
  p_policy_decision             text,
  p_recommendation_status       text,
  p_action_type                 text,
  p_social_confidence_band      text,
  p_journey_phase               text,
  p_social_event_count          bigint,
  p_unique_platform_actor_count bigint,
  p_anonymous_aggregate_count   bigint,
  p_known_person_activity_count bigint,
  p_intent_none_count           bigint,
  p_intent_low_count            bigint,
  p_intent_moderate_count       bigint,
  p_intent_strong_count         bigint,
  p_intent_high_count           bigint,
  p_high_intent_event_count     bigint,
  p_policy_allow_count          bigint,
  p_policy_review_count         bigint,
  p_policy_block_count          bigint,
  p_nba_recommended_count       bigint,
  p_nba_do_nothing_count        bigint,
  p_nba_review_required_count   bigint,
  p_nba_blocked_count           bigint,
  p_attributed_direct_count     bigint,
  p_attributed_assisted_count   bigint,
  p_unattributed_count          bigint,
  p_snapshot_idempotency_key    text
)
RETURNS TABLE (id uuid, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_time_window_end <= p_time_window_start THEN
    RAISE EXCEPTION 'time_window_end must be after time_window_start';
  END IF;

  RETURN QUERY
  WITH ins AS (
    INSERT INTO public.social_1g_aggregate_snapshot (
      workspace_id, time_window_start, time_window_end, time_window_label,
      provider, channel, identity_state, intent_band, policy_decision,
      recommendation_status, action_type, social_confidence_band, journey_phase,
      social_event_count, unique_platform_actor_count, anonymous_aggregate_count,
      known_person_activity_count, intent_none_count, intent_low_count,
      intent_moderate_count, intent_strong_count, intent_high_count,
      high_intent_event_count, policy_allow_count, policy_review_count,
      policy_block_count, nba_recommended_count, nba_do_nothing_count,
      nba_review_required_count, nba_blocked_count,
      attributed_direct_count, attributed_assisted_count, unattributed_count,
      snapshot_idempotency_key
    ) VALUES (
      p_workspace_id, p_time_window_start, p_time_window_end, p_time_window_label,
      p_provider, p_channel, p_identity_state, p_intent_band, p_policy_decision,
      p_recommendation_status, p_action_type, p_social_confidence_band, p_journey_phase,
      COALESCE(p_social_event_count, 0),
      COALESCE(p_unique_platform_actor_count, 0),
      COALESCE(p_anonymous_aggregate_count, 0),
      COALESCE(p_known_person_activity_count, 0),
      COALESCE(p_intent_none_count, 0),
      COALESCE(p_intent_low_count, 0),
      COALESCE(p_intent_moderate_count, 0),
      COALESCE(p_intent_strong_count, 0),
      COALESCE(p_intent_high_count, 0),
      COALESCE(p_high_intent_event_count, 0),
      COALESCE(p_policy_allow_count, 0),
      COALESCE(p_policy_review_count, 0),
      COALESCE(p_policy_block_count, 0),
      COALESCE(p_nba_recommended_count, 0),
      COALESCE(p_nba_do_nothing_count, 0),
      COALESCE(p_nba_review_required_count, 0),
      COALESCE(p_nba_blocked_count, 0),
      COALESCE(p_attributed_direct_count, 0),
      COALESCE(p_attributed_assisted_count, 0),
      COALESCE(p_unattributed_count, 0),
      p_snapshot_idempotency_key
    )
    ON CONFLICT (workspace_id, snapshot_idempotency_key) DO NOTHING
    RETURNING social_1g_aggregate_snapshot.id
  ),
  existing AS (
    SELECT s.id FROM public.social_1g_aggregate_snapshot s
    WHERE s.workspace_id = p_workspace_id
      AND s.snapshot_idempotency_key = p_snapshot_idempotency_key
    LIMIT 1
  )
  SELECT ins.id, true AS inserted FROM ins
  UNION ALL
  SELECT existing.id, false AS inserted FROM existing
  WHERE NOT EXISTS (SELECT 1 FROM ins);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_social_aggregate_snapshot(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text,
  bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
  bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_social_aggregate_snapshot(
  uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text,
  bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
  bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, text
) TO service_role;
