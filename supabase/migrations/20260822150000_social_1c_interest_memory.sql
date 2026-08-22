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
