-- SOCIAL-1B: Canonical workspace-scoped identity graph
--
-- AUDIT SUMMARY (pre-implementation):
--   No existing identity_node, identity_link, or canonical_persons table exists.
--   Reused patterns: workspace_members (workspace scoping), social_engagement_events
--   (identity state enum, provider/actor fields), RLS pattern.
--   New tables created: canonical_persons, identity_nodes, identity_links.
--   NOT duplicating: leads, contacts, inbox_messages, enriched_contacts —
--   those carry CRM/operational data; the graph carries only identity linkage.
--
-- WHAT THIS MIGRATION DOES:
--   1. Drops the temporary SOCIAL-1A guard (chk_no_known_person_until_social_1b)
--      and replaces it with a DB-level trigger that enforces the linkage
--      evidence contract — no direct column write can bypass it.
--   2. Creates canonical_persons: workspace-scoped canonical person anchors.
--   3. Creates identity_nodes: individual identity claims (provider actor,
--      email, phone, pseudonymous token).
--   4. Creates identity_links: verified deterministic linkages between a node
--      and a canonical person, with full evidence and audit trail.
--   5. Adds a resolution helper function used by the application service layer.
--
-- ROLLBACK IMPLICATIONS:
--   Dropping these tables loses all identity linkage data.
--   Re-adding chk_no_known_person_until_social_1b will block any existing
--   social_engagement_events rows that were written as known_person.
--   Rollback is: DROP TRIGGER, DROP FUNCTION, DROP TABLE identity_links,
--   DROP TABLE identity_nodes, DROP TABLE canonical_persons, then re-add
--   the chk_no_known_person_until_social_1b constraint.
--
-- CROSS-WORKSPACE ISOLATION:
--   Every table carries workspace_id NOT NULL.
--   UNIQUE constraints include workspace_id as the leading column.
--   No global-unique constraint exists that could accidentally join tenants.
--   RLS ensures authenticated users see only their workspace rows.
--   The trigger enforcing linkage evidence is workspace_id-scoped.

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Drop the temporary SOCIAL-1A guard
-- (Replaced below by a trigger that enforces the full evidence contract.)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.social_engagement_events
  DROP CONSTRAINT IF EXISTS chk_no_known_person_until_social_1b;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: canonical_persons
--
-- A canonical person anchor for a workspace.  One row is created when a
-- provider actor (or other identity node) is deterministically linked to a
-- real or pseudonymous person via a verified linkage.
--
-- canonical_persons does NOT store PII directly; PII lives in linked CRM
-- records (leads, contacts, enriched_contacts).  The graph tracks only
-- linkage topology and audit metadata.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.canonical_persons (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid        NOT NULL,
  -- display_label is an optional human-readable hint; NOT a PII store.
  -- Used only by the workspace admin UI; never used for identity matching.
  display_label     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canonical_persons_workspace
  ON public.canonical_persons (workspace_id, created_at DESC);

ALTER TABLE public.canonical_persons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_canonical_persons"
  ON public.canonical_persons FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_canonical_persons"
  ON public.canonical_persons FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: identity_nodes
--
-- One row per distinct identity claim in a workspace.  A node represents a
-- single identifier: a provider-scoped actor ID, a normalized email, a
-- normalized phone, or a first-party pseudonymous token.
--
-- CROSS-WORKSPACE ISOLATION:
--   The unique constraint includes workspace_id first, so the same email or
--   provider actor ID in two different workspaces creates two separate rows
--   and can never be accidentally merged.
--
-- PROVIDER SCOPING:
--   A provider actor is unique per (workspace_id, node_type, provider,
--   provider_scope, normalized_value).  An Instagram actor is NOT the same
--   node as a Facebook actor even if the underlying user is the same person;
--   they require separate verified linkage evidence.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.identity_nodes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid        NOT NULL,

  -- Type of identifier this node represents
  node_type        text        NOT NULL
    CHECK (node_type IN (
      'provider_actor',     -- provider-scoped actor ID (meta_ig, meta_fb, etc.)
      'email',              -- normalized email address
      'phone',              -- normalized E.164 phone number
      'pseudonymous_token', -- first-party pseudonymous token (e.g., web cookie ID)
      'crm_contact'         -- explicit CRM contact reference
    )),

  -- For provider_actor nodes only
  provider         text,       -- 'meta_ig' | 'meta_fb' | etc.
  provider_scope   text,       -- page_id / ig_account_id / account for provider actors

  -- The identifier value itself (raw as-received)
  external_id      text        NOT NULL,

  -- Normalized/lowercased value used for deduplication and lookup
  normalized_value text        NOT NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- No two nodes for the same identifier within the same workspace+provider scope.
  -- workspace_id is the leading column → guaranteed cross-workspace isolation.
  CONSTRAINT uq_identity_node_per_workspace
    UNIQUE NULLS NOT DISTINCT (workspace_id, node_type, provider, provider_scope, normalized_value),

  -- provider and provider_scope are required for provider_actor nodes
  CONSTRAINT chk_provider_actor_has_provider
    CHECK (node_type != 'provider_actor' OR (provider IS NOT NULL AND provider_scope IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_identity_nodes_workspace
  ON public.identity_nodes (workspace_id);

CREATE INDEX IF NOT EXISTS idx_identity_nodes_lookup
  ON public.identity_nodes (workspace_id, node_type, provider, normalized_value);

ALTER TABLE public.identity_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_identity_nodes"
  ON public.identity_nodes FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_identity_nodes"
  ON public.identity_nodes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: identity_links
--
-- A verified deterministic linkage between an identity_node and a
-- canonical_person.  Every row must carry machine-readable evidence.
--
-- LINKAGE CONTRACT ENFORCEMENT:
--   - linkage_type must be an allowed deterministic type (no fuzzy-match).
--   - verified_identifier and source_system are mandatory evidence fields.
--   - The DB enforces workspace_id consistency: the node and the person must
--     belong to the same workspace.
--   - Revocation is soft: is_revoked = true; data is preserved for audit.
--
-- CROSS-WORKSPACE ISOLATION:
--   workspace_id is stored on the link itself and is checked against both
--   the node and the canonical_person via FOREIGN KEY and trigger.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.identity_links (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            uuid        NOT NULL,

  canonical_person_id     uuid        NOT NULL
    REFERENCES public.canonical_persons (id) ON DELETE RESTRICT,

  identity_node_id        uuid        NOT NULL
    REFERENCES public.identity_nodes (id) ON DELETE RESTRICT,

  -- Machine-readable linkage type.  Only deterministic, explicit types allowed.
  linkage_type            text        NOT NULL
    CHECK (linkage_type IN (
      'authenticated_account',  -- user authenticated via first-party auth
      'verified_email',         -- email verified via confirmation flow
      'verified_phone',         -- phone verified via OTP / carrier check
      'crm_match',              -- explicit CRM / customer system match
      'provider_verified',      -- provider-supported verified identifier
      'explicit_confirmation'   -- explicit user or operator confirmation
    )),

  -- Evidence fields — all mandatory; callers cannot omit evidence.
  verified_identifier     text        NOT NULL,  -- what was actually verified
  source_system           text        NOT NULL,  -- which system produced the evidence
  verification_timestamp  timestamptz NOT NULL,

  -- Confidence: always 'deterministic' for a link that promotes known_person.
  -- 'probabilistic' is recorded but does NOT authorize known_person promotion.
  confidence              text        NOT NULL DEFAULT 'deterministic'
    CHECK (confidence IN ('deterministic', 'probabilistic')),

  -- Audit / revocation
  is_revoked              boolean     NOT NULL DEFAULT false,
  revoked_at              timestamptz,
  revocation_reason       text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_links_workspace
  ON public.identity_links (workspace_id);

-- Active-link uniqueness: only one non-revoked link per (workspace, person, node).
-- Using a partial index (WHERE is_revoked = false) so that soft-deleted links
-- do not block re-linkage after revocation.  This is intentional: a link may
-- be revoked and then re-created with fresh evidence.
CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_link_active
  ON public.identity_links (workspace_id, canonical_person_id, identity_node_id)
  WHERE is_revoked = false;

CREATE INDEX IF NOT EXISTS idx_identity_links_node
  ON public.identity_links (identity_node_id, is_revoked, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_identity_links_person
  ON public.identity_links (canonical_person_id, is_revoked, created_at DESC);

ALTER TABLE public.identity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_identity_links"
  ON public.identity_links FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_identity_links"
  ON public.identity_links FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Cross-workspace isolation enforcement on identity_links
--
-- The canonical_person and the identity_node must belong to the same
-- workspace as the link itself.  Enforced by a trigger rather than a
-- multi-row FK check constraint (which PostgreSQL does not support natively).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_identity_link_workspace_isolation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_workspace uuid;
  v_node_workspace   uuid;
BEGIN
  SELECT workspace_id INTO v_person_workspace
    FROM public.canonical_persons WHERE id = NEW.canonical_person_id;

  SELECT workspace_id INTO v_node_workspace
    FROM public.identity_nodes WHERE id = NEW.identity_node_id;

  IF v_person_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION
      'identity_link: canonical_person workspace_id (%) does not match link workspace_id (%)',
      v_person_workspace, NEW.workspace_id;
  END IF;

  IF v_node_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION
      'identity_link: identity_node workspace_id (%) does not match link workspace_id (%)',
      v_node_workspace, NEW.workspace_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_identity_link_workspace_isolation
  BEFORE INSERT OR UPDATE ON public.identity_links
  FOR EACH ROW EXECUTE FUNCTION public.enforce_identity_link_workspace_isolation();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: known_person linkage evidence enforcement on social_engagement_events
--
-- Replaces chk_no_known_person_until_social_1b with a production-safe trigger.
--
-- CONTRACT:
--   An event row may be written with actor_identity_state = 'known_person'
--   ONLY when the following are all true:
--     a. actor_provider_id IS NOT NULL
--     b. An identity_node exists for (workspace_id, 'provider_actor',
--        provider, account_identifier, actor_provider_id)
--     c. That node has at least one active (non-revoked), deterministic
--        identity_link to a canonical_person in the same workspace
--
--   Any other attempt to write known_person raises a constraint-like exception.
--   This is stronger than the old CHECK constraint because it validates the
--   actual identity graph state at write time, not just the column value.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_known_person_linkage_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_node_id uuid;
  v_link_count integer;
BEGIN
  -- Only enforce when the identity state is known_person
  IF NEW.actor_identity_state != 'known_person' THEN
    RETURN NEW;
  END IF;

  -- actor_provider_id is required (already enforced by existing CHECK, but belt-and-suspenders)
  IF NEW.actor_provider_id IS NULL THEN
    RAISE EXCEPTION
      'social_engagement_events: known_person requires a non-null actor_provider_id';
  END IF;

  -- Look up the identity node for this provider actor in this workspace
  SELECT id INTO v_node_id
    FROM public.identity_nodes
    WHERE workspace_id    = NEW.workspace_id
      AND node_type       = 'provider_actor'
      AND provider        = NEW.provider
      AND provider_scope  = NEW.account_identifier
      AND normalized_value = LOWER(TRIM(NEW.actor_provider_id))
    LIMIT 1;

  IF v_node_id IS NULL THEN
    RAISE EXCEPTION
      'social_engagement_events: known_person requires a verified identity_node for '
      'provider=%, account=%, actor=% in workspace=%',
      NEW.provider, NEW.account_identifier, NEW.actor_provider_id, NEW.workspace_id;
  END IF;

  -- Verify at least one active deterministic link exists
  SELECT COUNT(*) INTO v_link_count
    FROM public.identity_links
    WHERE workspace_id       = NEW.workspace_id
      AND identity_node_id   = v_node_id
      AND is_revoked         = false
      AND confidence         = 'deterministic';

  IF v_link_count = 0 THEN
    RAISE EXCEPTION
      'social_engagement_events: known_person requires an active deterministic identity_link '
      'for node %, workspace=%',
      v_node_id, NEW.workspace_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_social_engagement_known_person_evidence
  BEFORE INSERT OR UPDATE ON public.social_engagement_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_known_person_linkage_evidence();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: resolve_identity() — DB-side resolution helper
--
-- Returns the canonical identity state for a given (workspace, provider,
-- account_identifier, actor_provider_id) tuple.
--
-- Return values mirror the four canonical identity states:
--   'known_person'         — deterministic, non-revoked link exists
--   'platform_actor'       — node exists but no valid link
--   'anonymous_aggregate'  — actor_provider_id is NULL
--   'ambiguous'            — multiple canonical persons match (fail closed)
--   'unresolved'           — no node found; default to platform_actor at call site
--
-- This function is the single source of truth for identity resolution.
-- Application code MUST use this (or the TypeScript wrapper that calls it)
-- rather than building independent resolution logic.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_identity(
  p_workspace_id         uuid,
  p_provider             text,
  p_account_identifier   text,
  p_actor_provider_id    text   -- NULL → anonymous_aggregate
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_node_id        uuid;
  v_person_count   integer;
  v_norm_actor     text;
BEGIN
  -- NULL actor_provider_id → always anonymous_aggregate; never promote
  IF p_actor_provider_id IS NULL THEN
    RETURN 'anonymous_aggregate';
  END IF;

  v_norm_actor := LOWER(TRIM(p_actor_provider_id));

  -- Look up the node for this workspace+provider+account+actor tuple
  SELECT id INTO v_node_id
    FROM public.identity_nodes
    WHERE workspace_id    = p_workspace_id
      AND node_type       = 'provider_actor'
      AND provider        = p_provider
      AND provider_scope  = p_account_identifier
      AND normalized_value = v_norm_actor
    LIMIT 1;

  -- No node registered → unresolved (caller defaults to platform_actor)
  IF v_node_id IS NULL THEN
    RETURN 'unresolved';
  END IF;

  -- Count distinct canonical persons with an active deterministic link
  SELECT COUNT(DISTINCT canonical_person_id) INTO v_person_count
    FROM public.identity_links
    WHERE workspace_id     = p_workspace_id
      AND identity_node_id = v_node_id
      AND is_revoked       = false
      AND confidence       = 'deterministic';

  IF v_person_count = 0 THEN
    RETURN 'platform_actor';
  END IF;

  -- Ambiguous: multiple persons match — fail closed
  IF v_person_count > 1 THEN
    RETURN 'ambiguous';
  END IF;

  RETURN 'known_person';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: updated_at triggers for new tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_canonical_persons_updated_at
  BEFORE UPDATE ON public.canonical_persons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_identity_nodes_updated_at
  BEFORE UPDATE ON public.identity_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_identity_links_updated_at
  BEFORE UPDATE ON public.identity_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
