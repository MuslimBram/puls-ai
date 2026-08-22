-- SOCIAL-1F: Controlled Social NBA (canonical adapter extension)
--
-- Canonical NBA storage is public.next_best_actions.
-- SOCIAL-1F extends canonical primitives and MUST NOT create a parallel store.

ALTER TABLE public.next_best_actions
  ADD COLUMN IF NOT EXISTS nba_source text NOT NULL DEFAULT 'customer_brain',
  ADD COLUMN IF NOT EXISTS policy_decision text
    CHECK (policy_decision IN ('ALLOW','REVIEW','BLOCK')),
  ADD COLUMN IF NOT EXISTS policy_reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS policy_evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS human_approval_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS social_provider text,
  ADD COLUMN IF NOT EXISTS social_channel text,
  ADD COLUMN IF NOT EXISTS social_identity_state text
    CHECK (social_identity_state IN ('known_person','platform_actor','pseudonymous_visitor','anonymous_aggregate')),
  ADD COLUMN IF NOT EXISTS social_resolved_identity_key text,
  ADD COLUMN IF NOT EXISTS social_canonical_person_id uuid,
  ADD COLUMN IF NOT EXISTS social_intent_score numeric(6,4)
    CHECK (social_intent_score >= 0 AND social_intent_score <= 1),
  ADD COLUMN IF NOT EXISTS social_intent_score_band text
    CHECK (social_intent_score_band IN ('none','low','moderate','strong','high')),
  ADD COLUMN IF NOT EXISTS social_journey_phase text,
  ADD COLUMN IF NOT EXISTS social_evidence_refs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS social_recommendation_status text
    CHECK (social_recommendation_status IN ('recommended','review_required','blocked','do_nothing')),
  ADD COLUMN IF NOT EXISTS social_reason_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active','superseded','expired','cancelled')),
  ADD COLUMN IF NOT EXISTS recommended_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_next_best_actions_social_identity
  ON public.next_best_actions (workspace_id, social_resolved_identity_key)
  WHERE social_resolved_identity_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_next_best_actions_social_active_idempotency
  ON public.next_best_actions (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND lifecycle_status = 'active';

ALTER TABLE public.next_best_actions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'next_best_actions'
      AND policyname = 'workspace_members_select_next_best_actions'
  ) THEN
    CREATE POLICY "workspace_members_select_next_best_actions"
      ON public.next_best_actions
      FOR SELECT
      TO authenticated
      USING (
        workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'next_best_actions'
      AND policyname = 'service_role_all_next_best_actions'
  ) THEN
    CREATE POLICY "service_role_all_next_best_actions"
      ON public.next_best_actions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_social_nba_next_best_action(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_action_type text,
  p_reason text,
  p_confidence text,
  p_priority integer,
  p_suggested_channel text,
  p_offer_value numeric,
  p_offer_unit text,
  p_expires_at timestamptz,
  p_rule_id uuid,
  p_rule_allows boolean,
  p_status text,
  p_policy_decision text,
  p_policy_reasons text[],
  p_policy_evaluated_at timestamptz,
  p_human_approval_required boolean,
  p_provider text,
  p_channel text,
  p_identity_state text,
  p_resolved_identity_key text,
  p_canonical_person_id uuid,
  p_intent_score numeric,
  p_intent_score_band text,
  p_journey_phase text,
  p_evidence_refs text[],
  p_recommendation_status text,
  p_reason_codes text[],
  p_idempotency_key text,
  p_recommended_at timestamptz
)
RETURNS TABLE (id uuid, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.next_best_actions (
    workspace_id,
    lead_id,
    action_type,
    reason,
    evidence,
    confidence,
    priority,
    suggested_channel,
    rule_id,
    rule_allows,
    offer_value,
    offer_unit,
    expires_at,
    status,
    nba_source,
    policy_decision,
    policy_reasons,
    policy_evaluated_at,
    human_approval_required,
    social_provider,
    social_channel,
    social_identity_state,
    social_resolved_identity_key,
    social_canonical_person_id,
    social_intent_score,
    social_intent_score_band,
    social_journey_phase,
    social_evidence_refs,
    social_recommendation_status,
    social_reason_codes,
    idempotency_key,
    lifecycle_status,
    recommended_at,
    updated_at
  ) VALUES (
    p_workspace_id,
    p_lead_id,
    p_action_type,
    p_reason,
    jsonb_build_object(
      'source', 'social-1f',
      'provider', p_provider,
      'channel', p_channel,
      'identity_state', p_identity_state,
      'resolved_identity_key', p_resolved_identity_key,
      'canonical_person_id', p_canonical_person_id,
      'intent_score', p_intent_score,
      'intent_score_band', p_intent_score_band,
      'journey_phase', p_journey_phase,
      'policy_decision', p_policy_decision,
      'policy_reasons', p_policy_reasons,
      'policy_evaluated_at', p_policy_evaluated_at,
      'recommendation_status', p_recommendation_status,
      'reason_codes', p_reason_codes,
      'evidence_refs', p_evidence_refs
    ),
    p_confidence,
    p_priority,
    p_suggested_channel,
    p_rule_id,
    p_rule_allows,
    p_offer_value,
    p_offer_unit,
    p_expires_at,
    p_status,
    'social_1f',
    p_policy_decision,
    COALESCE(p_policy_reasons, '{}'),
    p_policy_evaluated_at,
    COALESCE(p_human_approval_required, true),
    p_provider,
    p_channel,
    p_identity_state,
    p_resolved_identity_key,
    p_canonical_person_id,
    p_intent_score,
    p_intent_score_band,
    p_journey_phase,
    COALESCE(p_evidence_refs, '{}'),
    p_recommendation_status,
    COALESCE(p_reason_codes, '{}'),
    p_idempotency_key,
    'active',
    COALESCE(p_recommended_at, now()),
    now()
  )
  ON CONFLICT (workspace_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND lifecycle_status = 'active'
  DO UPDATE
    SET updated_at = now()
  RETURNING next_best_actions.id, (xmax = 0) AS inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_social_nba_next_best_action(
  uuid, uuid, text, text, text, integer, text, numeric, text, timestamptz,
  uuid, boolean, text, text, text[], timestamptz, boolean, text, text, text,
  text, uuid, numeric, text, text, text[], text, text[], text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_social_nba_next_best_action(
  uuid, uuid, text, text, text, integer, text, numeric, text, timestamptz,
  uuid, boolean, text, text, text[], timestamptz, boolean, text, text, text,
  text, uuid, numeric, text, text, text[], text, text[], text, timestamptz
) TO service_role;
