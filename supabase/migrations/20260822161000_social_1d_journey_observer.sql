-- SOCIAL-1D correction: atomic, idempotent Journey observation
--
-- The primary 20260822160000 migration owns intent evidence/score persistence.
-- This additive correction gives SOCIAL-1D one safe write boundary into the
-- EXISTING customer_journey / journey_transitions model without creating a
-- second Journey taxonomy or any commercial action execution.

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_intent_journey_observation
  ON public.journey_transitions (business_id, customer_id, trigger_details)
  WHERE trigger_type = 'phase_transition'
    AND trigger_details LIKE 'SOCIAL-1D:%';

CREATE OR REPLACE FUNCTION public.observe_social_intent_journey(
  p_workspace_id uuid,
  p_canonical_person_id uuid,
  p_business_id uuid,
  p_customer_id uuid,
  p_resolved_identity_key text,
  p_intent_score numeric,
  p_evidence_count integer,
  p_observation_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_workspace uuid;
  v_customer_business uuid;
  v_crm_node_id uuid;
  v_valid_link_count integer;
  v_journey_id uuid;
  v_current_phase journey_phase;
  v_target_phase journey_phase;
  v_trigger_details text;
  v_existing_transition_id uuid;
  v_min_score numeric;
  v_min_evidence integer;
BEGIN
  IF p_workspace_id IS NULL
    OR p_canonical_person_id IS NULL
    OR p_business_id IS NULL
    OR p_customer_id IS NULL THEN
    RETURN jsonb_build_object(
      'status','blocked_unverified_customer',
      'error','required identity/customer scope missing'
    );
  END IF;

  IF NULLIF(TRIM(p_resolved_identity_key),'') IS NULL
    OR NULLIF(TRIM(p_observation_key),'') IS NULL THEN
    RETURN jsonb_build_object(
      'status','blocked_unverified_customer',
      'error','resolved identity / observation key missing'
    );
  END IF;

  IF p_intent_score IS NULL OR p_intent_score < 0 OR p_intent_score > 1 THEN
    RETURN jsonb_build_object('status','error','error','intent score outside 0..1');
  END IF;

  IF p_evidence_count IS NULL OR p_evidence_count < 0 THEN
    RETURN jsonb_build_object('status','error','error','invalid evidence count');
  END IF;

  SELECT workspace_id INTO v_person_workspace
  FROM public.canonical_persons
  WHERE id = p_canonical_person_id;

  IF v_person_workspace IS NULL OR v_person_workspace IS DISTINCT FROM p_workspace_id THEN
    RETURN jsonb_build_object(
      'status','blocked_unverified_customer',
      'error','canonical person not in workspace'
    );
  END IF;

  SELECT business_id INTO v_customer_business
  FROM public.customers
  WHERE id = p_customer_id;

  IF v_customer_business IS NULL OR v_customer_business IS DISTINCT FROM p_business_id THEN
    RETURN jsonb_build_object(
      'status','blocked_unverified_customer',
      'error','customer not in requested business'
    );
  END IF;

  -- SOCIAL-1B deterministic bridge: the customer must already be represented
  -- as a crm_contact identity node in this workspace. SOCIAL-1D never creates
  -- or promotes identity links itself.
  SELECT id INTO v_crm_node_id
  FROM public.identity_nodes
  WHERE workspace_id = p_workspace_id
    AND node_type = 'crm_contact'
    AND external_id = p_customer_id::text
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_crm_node_id IS NULL THEN
    RETURN jsonb_build_object(
      'status','blocked_unverified_customer',
      'error','no verified crm_contact identity node'
    );
  END IF;

  SELECT COUNT(*) INTO v_valid_link_count
  FROM public.identity_links
  WHERE workspace_id = p_workspace_id
    AND identity_node_id = v_crm_node_id
    AND canonical_person_id = p_canonical_person_id
    AND is_revoked = false
    AND confidence = 'deterministic';

  IF v_valid_link_count <> 1 THEN
    RETURN jsonb_build_object(
      'status','blocked_unverified_customer',
      'error','deterministic canonical-person/customer linkage missing or ambiguous'
    );
  END IF;

  v_trigger_details := 'SOCIAL-1D:' || p_observation_key;

  -- Lock the one canonical Journey row. This serializes concurrent observations
  -- for the same business/customer and makes transition + state update atomic.
  SELECT id,current_phase INTO v_journey_id,v_current_phase
  FROM public.customer_journey
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
  FOR UPDATE;

  IF v_journey_id IS NULL THEN
    RETURN jsonb_build_object('status','journey_not_found');
  END IF;

  SELECT id INTO v_existing_transition_id
  FROM public.journey_transitions
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
    AND trigger_type = 'phase_transition'
    AND trigger_details = v_trigger_details
  LIMIT 1;

  IF v_existing_transition_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status','duplicate_transition',
      'previous_phase',v_current_phase,
      'transition_trigger',v_trigger_details
    );
  END IF;

  -- SOCIAL intent may only advance PRE-PURCHASE Journey phases, one step at a time.
  -- Post-purchase/onboarding/active/churn/champion phases require their own
  -- canonical evidence and are never inferred from social intent score alone.
  CASE v_current_phase
    WHEN 'first_touch' THEN
      v_target_phase := 'exploring';
      v_min_score := 0.20;
      v_min_evidence := 2;
    WHEN 'exploring' THEN
      v_target_phase := 'considering';
      v_min_score := 0.40;
      v_min_evidence := 2;
    WHEN 'considering' THEN
      v_target_phase := 'converting';
      v_min_score := 0.70;
      v_min_evidence := 3;
    ELSE
      RETURN jsonb_build_object(
        'status','journey_unchanged',
        'previous_phase',v_current_phase
      );
  END CASE;

  IF p_intent_score < v_min_score OR p_evidence_count < v_min_evidence THEN
    RETURN jsonb_build_object(
      'status','journey_unchanged',
      'previous_phase',v_current_phase
    );
  END IF;

  BEGIN
    INSERT INTO public.journey_transitions (
      business_id,
      customer_id,
      from_phase,
      to_phase,
      trigger_type,
      trigger_details
    ) VALUES (
      p_business_id,
      p_customer_id,
      v_current_phase,
      v_target_phase,
      'phase_transition',
      v_trigger_details
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'status','duplicate_transition',
      'previous_phase',v_current_phase,
      'new_phase',v_target_phase,
      'transition_trigger',v_trigger_details
    );
  END;

  UPDATE public.customer_journey
  SET current_phase = v_target_phase,
      phase_started_at = now(),
      days_in_current_phase = 0,
      phase_trigger = 'social_intent',
      phase_notes = format(
        'SOCIAL-1D evidence-backed observation; identity=%s score=%s evidence=%s',
        p_resolved_identity_key,
        p_intent_score,
        p_evidence_count
      )
  WHERE id = v_journey_id;

  RETURN jsonb_build_object(
    'status','journey_updated',
    'previous_phase',v_current_phase,
    'new_phase',v_target_phase,
    'transition_trigger',v_trigger_details
  );
END;
$$;

REVOKE ALL ON FUNCTION public.observe_social_intent_journey(
  uuid,uuid,uuid,uuid,text,numeric,integer,text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.observe_social_intent_journey(
  uuid,uuid,uuid,uuid,text,numeric,integer,text
) TO service_role;
