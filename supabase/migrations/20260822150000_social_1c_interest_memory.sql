-- SOCIAL-1C: Canonical Interest Memory (evidence-backed, workspace-scoped)
--
-- AUDIT + REUSE DECISION:
--   Reused directly:
--     - public.social_engagement_events (SOCIAL-1A canonical engagement source)
--     - public.canonical_persons / public.identity_nodes / public.identity_links (SOCIAL-1B identity graph)
--     - workspace_members-based RLS policy pattern
--
--   Audited but NOT reused for canonical interest evidence storage:
--     - public.business_memory: business-level generalized memory, not engagement-event-idempotent
--       and not identity-graph-bound to canonical persons/provider actors.
--     - public.customer_journey: journey-stage state store; SOCIAL-1D territory.
--     - AI/vector/knowledge tables: retrieval/knowledge stores, not canonical evidence ledgers.
--
-- GAP REQUIRING NEW STRUCTURE:
--   No existing table provides event-level idempotent, identity-safe, workspace-scoped,
--   evidence-traceable interest memory bound to canonical social_engagement_events.
--
-- ROLLBACK IMPLICATIONS:
--   Dropping these tables loses accumulated canonical interest memory/evidence.
--   SOCIAL-1A/SOCIAL-1B remain intact. Rollback is additive-only revert:
--   DROP TABLE social_interest_evidence, DROP TABLE social_interest_memory.

CREATE TABLE IF NOT EXISTS public.social_interest_memory (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL,

  -- known_person linkage when lawful deterministic evidence exists; NULL otherwise
  canonical_person_id   uuid REFERENCES public.canonical_persons(id) ON DELETE SET NULL,

  -- optional provider identity node reference used by SOCIAL-1B graph
  identity_node_id      uuid REFERENCES public.identity_nodes(id) ON DELETE SET NULL,

  -- provider-scoped actor coordinates (always retained for traceability)
  provider              text NOT NULL,
  account_identifier    text NOT NULL,
  actor_provider_id     text NOT NULL,

  -- canonical state at write time (never anonymous_aggregate for person-level memory)
  actor_identity_state  text NOT NULL CHECK (actor_identity_state IN (
    'known_person', 'platform_actor', 'pseudonymous_visitor'
  )),

  -- stable key that chooses person scope when known, otherwise provider-actor scope
  resolved_identity_key text NOT NULL,

  -- interest contract
  interest_type         text NOT NULL CHECK (interest_type IN ('topic', 'category', 'product', 'service')),
  interest_ref          text NOT NULL,

  source_provider       text NOT NULL,

  -- deterministic accumulation
  evidence_count        integer NOT NULL DEFAULT 1 CHECK (evidence_count >= 1),
  strength              numeric(5,4),

  first_seen_at         timestamptz NOT NULL,
  last_seen_at          timestamptz NOT NULL,

  state                 text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'revoked', 'expired')),
  revoked_at            timestamptz,
  revocation_reason     text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_social_interest_known_person_has_person
    CHECK (actor_identity_state != 'known_person' OR canonical_person_id IS NOT NULL),

  CONSTRAINT chk_social_interest_nonknown_person_has_no_person
    CHECK (actor_identity_state = 'known_person' OR canonical_person_id IS NULL),

  CONSTRAINT chk_social_interest_time_window
    CHECK (last_seen_at >= first_seen_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_interest_memory_active
  ON public.social_interest_memory (workspace_id, resolved_identity_key, interest_type, interest_ref)
  WHERE state = 'active';

CREATE INDEX IF NOT EXISTS idx_social_interest_memory_workspace
  ON public.social_interest_memory (workspace_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_interest_memory_person
  ON public.social_interest_memory (workspace_id, canonical_person_id, state, last_seen_at DESC)
  WHERE canonical_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_interest_memory_actor
  ON public.social_interest_memory (workspace_id, provider, account_identifier, actor_provider_id, state, last_seen_at DESC);

ALTER TABLE public.social_interest_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_social_interest_memory"
  ON public.social_interest_memory
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_social_interest_memory"
  ON public.social_interest_memory
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.social_interest_evidence (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL,

  engagement_event_id   uuid NOT NULL
    REFERENCES public.social_engagement_events(id) ON DELETE RESTRICT,

  interest_memory_id    uuid
    REFERENCES public.social_interest_memory(id) ON DELETE SET NULL,

  provider              text NOT NULL,
  source_provider       text NOT NULL,
  source_ref            text NOT NULL,

  actor_provider_id     text,

  interest_type         text NOT NULL CHECK (interest_type IN ('topic', 'category', 'product', 'service')),
  interest_ref          text NOT NULL,

  evidence_type         text NOT NULL,
  evidence_timestamp    timestamptz NOT NULL,
  evidence_count        integer NOT NULL DEFAULT 1 CHECK (evidence_count = 1),

  derived_metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,

  state                 text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'revoked', 'expired')),

  created_at            timestamptz NOT NULL DEFAULT now()
);

-- event-level idempotency; retries must not double count
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_interest_evidence_idempotency
  ON public.social_interest_evidence (workspace_id, engagement_event_id, interest_type, interest_ref);

CREATE INDEX IF NOT EXISTS idx_social_interest_evidence_workspace
  ON public.social_interest_evidence (workspace_id, evidence_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_social_interest_evidence_event
  ON public.social_interest_evidence (engagement_event_id);

ALTER TABLE public.social_interest_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_social_interest_evidence"
  ON public.social_interest_evidence
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_social_interest_evidence"
  ON public.social_interest_evidence
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Enforce evidence/event workspace alignment.
CREATE OR REPLACE FUNCTION public.enforce_social_interest_evidence_workspace()
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
    RAISE EXCEPTION 'social_interest_evidence: engagement_event_id % not found', NEW.engagement_event_id;
  END IF;

  IF v_event_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION
      'social_interest_evidence: workspace mismatch event workspace (%) vs evidence workspace (%)',
      v_event_workspace, NEW.workspace_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_social_interest_evidence_workspace
  BEFORE INSERT OR UPDATE ON public.social_interest_evidence
  FOR EACH ROW EXECUTE FUNCTION public.enforce_social_interest_evidence_workspace();

-- Reuse existing trigger function if already present; create only if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'set_updated_at'
      AND n.nspname = 'public'
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

CREATE TRIGGER trg_social_interest_memory_updated_at
  BEFORE UPDATE ON public.social_interest_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.accumulate_social_interest_signal(
  p_workspace_id          uuid,
  p_engagement_event_id   uuid,
  p_provider              text,
  p_account_identifier    text,
  p_actor_provider_id     text,
  p_interest_type         text,
  p_interest_ref          text,
  p_evidence_type         text,
  p_evidence_timestamp    timestamptz,
  p_source_provider       text,
  p_source_ref            text,
  p_canonical_person_id   uuid,
  p_identity_node_id      uuid,
  p_actor_identity_state  text,
  p_resolved_identity_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_workspace uuid;
  v_memory_id uuid;
  v_evidence_id uuid;
  v_linked_evidence_id uuid;
  v_existing_evidence_id uuid;
  v_evidence_inserted boolean := false;
  v_evidence_count integer;
BEGIN
  SELECT workspace_id INTO v_event_workspace
    FROM public.social_engagement_events
    WHERE id = p_engagement_event_id
    FOR SHARE;

  IF v_event_workspace IS NULL THEN
    RAISE EXCEPTION 'accumulate_social_interest_signal: engagement_event_id % not found', p_engagement_event_id;
  END IF;

  IF v_event_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION
      'accumulate_social_interest_signal: workspace mismatch event workspace (%) vs request workspace (%)',
      v_event_workspace, p_workspace_id;
  END IF;

  IF p_actor_provider_id IS NULL THEN
    RAISE EXCEPTION 'accumulate_social_interest_signal: actor_provider_id is required';
  END IF;

  IF p_interest_type NOT IN ('topic', 'category', 'product', 'service') THEN
    RAISE EXCEPTION 'accumulate_social_interest_signal: invalid interest_type %', p_interest_type;
  END IF;

  IF p_actor_identity_state NOT IN ('known_person', 'platform_actor', 'pseudonymous_visitor') THEN
    RAISE EXCEPTION 'accumulate_social_interest_signal: invalid actor_identity_state %', p_actor_identity_state;
  END IF;

  IF p_actor_identity_state = 'known_person' AND p_canonical_person_id IS NULL THEN
    RAISE EXCEPTION 'accumulate_social_interest_signal: known_person requires canonical_person_id';
  END IF;

  IF p_actor_identity_state <> 'known_person' THEN
    p_canonical_person_id := NULL;
  END IF;

  INSERT INTO public.social_interest_evidence (
    workspace_id,
    engagement_event_id,
    provider,
    source_provider,
    source_ref,
    actor_provider_id,
    interest_type,
    interest_ref,
    evidence_type,
    evidence_timestamp,
    evidence_count,
    derived_metadata
  )
  VALUES (
    p_workspace_id,
    p_engagement_event_id,
    p_provider,
    p_source_provider,
    p_source_ref,
    p_actor_provider_id,
    p_interest_type,
    p_interest_ref,
    p_evidence_type,
    p_evidence_timestamp,
    1,
    jsonb_build_object(
      'actor_identity_state', p_actor_identity_state,
      'derived', true,
      'deterministic', true
    )
  )
  ON CONFLICT (workspace_id, engagement_event_id, interest_type, interest_ref) DO NOTHING
  RETURNING id INTO v_evidence_id;

  IF v_evidence_id IS NOT NULL THEN
    v_evidence_inserted := true;
  ELSE
    SELECT id INTO v_existing_evidence_id
      FROM public.social_interest_evidence
      WHERE workspace_id = p_workspace_id
        AND engagement_event_id = p_engagement_event_id
        AND interest_type = p_interest_type
        AND interest_ref = p_interest_ref
      LIMIT 1;

    IF v_existing_evidence_id IS NULL THEN
      RAISE EXCEPTION
        'accumulate_social_interest_signal: expected existing evidence for event % interest %:%',
        p_engagement_event_id, p_interest_type, p_interest_ref;
    END IF;

    v_evidence_id := v_existing_evidence_id;
  END IF;

  SELECT id INTO v_memory_id
    FROM public.social_interest_memory
    WHERE workspace_id = p_workspace_id
      AND resolved_identity_key = p_resolved_identity_key
      AND interest_type = p_interest_type
      AND interest_ref = p_interest_ref
      AND state = 'active'
    LIMIT 1
    FOR UPDATE;

  IF v_memory_id IS NULL THEN
    BEGIN
      INSERT INTO public.social_interest_memory (
        workspace_id,
        canonical_person_id,
        identity_node_id,
        provider,
        account_identifier,
        actor_provider_id,
        actor_identity_state,
        resolved_identity_key,
        interest_type,
        interest_ref,
        source_provider,
        evidence_count,
        strength,
        first_seen_at,
        last_seen_at,
        state
      )
      VALUES (
        p_workspace_id,
        p_canonical_person_id,
        p_identity_node_id,
        p_provider,
        p_account_identifier,
        p_actor_provider_id,
        p_actor_identity_state,
        p_resolved_identity_key,
        p_interest_type,
        p_interest_ref,
        p_source_provider,
        1,
        LEAST(1::numeric, ROUND((1::numeric / 5), 4)),
        p_evidence_timestamp,
        p_evidence_timestamp,
        'active'
      )
      RETURNING id INTO v_memory_id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT id INTO v_memory_id
          FROM public.social_interest_memory
          WHERE workspace_id = p_workspace_id
            AND resolved_identity_key = p_resolved_identity_key
            AND interest_type = p_interest_type
            AND interest_ref = p_interest_ref
            AND state = 'active'
          LIMIT 1
          FOR UPDATE;
    END;
  END IF;

  IF v_memory_id IS NULL THEN
    RAISE EXCEPTION
      'accumulate_social_interest_signal: unable to resolve active memory row for identity % and interest %:%',
      p_resolved_identity_key, p_interest_type, p_interest_ref;
  END IF;

  UPDATE public.social_interest_evidence
    SET interest_memory_id = v_memory_id
    WHERE workspace_id = p_workspace_id
      AND provider = p_provider
      AND source_provider = p_source_provider
      AND actor_provider_id = p_actor_provider_id
      AND interest_type = p_interest_type
      AND interest_ref = p_interest_ref
      AND state = 'active'
      AND interest_memory_id IS NULL;

  UPDATE public.social_interest_evidence
    SET interest_memory_id = v_memory_id
    WHERE id = v_evidence_id
      AND workspace_id = p_workspace_id
    RETURNING id INTO v_linked_evidence_id;

  IF v_linked_evidence_id IS NULL THEN
    RAISE EXCEPTION
      'accumulate_social_interest_signal: failed to link evidence % to memory %',
      v_evidence_id, v_memory_id;
  END IF;

  SELECT COUNT(*) INTO v_evidence_count
    FROM public.social_interest_evidence
    WHERE workspace_id = p_workspace_id
      AND interest_memory_id = v_memory_id
      AND state = 'active';

  IF v_evidence_count < 1 THEN
    RAISE EXCEPTION
      'accumulate_social_interest_signal: invalid active evidence_count (%) for memory %',
      v_evidence_count, v_memory_id;
  END IF;

  UPDATE public.social_interest_memory
    SET canonical_person_id = p_canonical_person_id,
        identity_node_id = p_identity_node_id,
        actor_identity_state = p_actor_identity_state,
        evidence_count = v_evidence_count,
        strength = LEAST(1::numeric, ROUND((v_evidence_count::numeric / 5), 4)),
        first_seen_at = LEAST(first_seen_at, p_evidence_timestamp),
        last_seen_at = GREATEST(last_seen_at, p_evidence_timestamp)
    WHERE id = v_memory_id
      AND workspace_id = p_workspace_id;

  RETURN jsonb_build_object(
    'evidence_inserted', v_evidence_inserted,
    'interest_memory_id', v_memory_id,
    'evidence_count', v_evidence_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accumulate_social_interest_signal(
  uuid, uuid, text, text, text, text, text, text, timestamptz, text, text, uuid, uuid, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.accumulate_social_interest_signal(
  uuid, uuid, text, text, text, text, text, text, timestamptz, text, text, uuid, uuid, text, text
) TO service_role;
