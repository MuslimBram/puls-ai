-- SOCIAL-1A: Canonical social engagement events table
--
-- WHY a new table (not integration_event_logs):
--   integration_event_logs was designed for generic webhook audit/dedup.
--   It lacks canonical social fields: provider, account_identifier, actor_provider_id,
--   actor_identity_state, is_anonymous_aggregate, event_timestamp, content_ref,
--   consent_classification, source_ref.  Adding these columns to the general-purpose
--   log would pollute its contract and make RLS harder to reason about.
--   This minimal table carries only the canonical social engagement contract.
--
-- Idempotency:
--   UNIQUE (idempotency_key) — INSERT … ON CONFLICT DO NOTHING prevents duplicates.
--   The idempotency_key mirrors the provider claim already recorded in
--   processed_webhook_events so the two tables stay consistent without coupling.

CREATE TABLE IF NOT EXISTS public.social_engagement_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL,
  channel_id            uuid NOT NULL,
  provider              text NOT NULL,           -- e.g. 'meta_ig', 'meta_fb'
  account_identifier    text NOT NULL,           -- page_id / ig_account_id
  event_type            text NOT NULL,           -- canonical taxonomy value
  provider_event_id     text NOT NULL,           -- provider's own stable event ID
  actor_provider_id     text,                    -- provider-scoped sender; NULL for anonymous
  actor_identity_state  text NOT NULL            -- 'known_person' | 'platform_actor' |
                                                 -- 'pseudonymous_visitor' | 'anonymous_aggregate'
    CHECK (actor_identity_state IN (
      'known_person', 'platform_actor', 'pseudonymous_visitor', 'anonymous_aggregate'
    )),
  is_anonymous_aggregate boolean NOT NULL DEFAULT false,
  content_ref           text,                    -- sanitized content snippet / placeholder
  event_timestamp       timestamptz NOT NULL,    -- provider-reported time
  normalized_metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_classification text
    CHECK (consent_classification IN (
      'platform_terms', 'explicit_consent', 'legitimate_interest'
    )),
  source_ref            text NOT NULL,           -- '<provider>:<event_id>' — no secrets
  idempotency_key       text NOT NULL,           -- 'seg:<provider>:<workspace_id>:<event_id>'
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- IDENTITY INVARIANTS enforced at DB level (mirror the TypeScript builder) ──────────────
  -- platform_actor requires a provider-scoped actor ID
  CONSTRAINT chk_platform_actor_has_actor_id
    CHECK (actor_identity_state != 'platform_actor' OR actor_provider_id IS NOT NULL),
  -- pseudonymous_visitor requires a first-party pseudonymous identifier
  CONSTRAINT chk_pseudonymous_visitor_has_actor_id
    CHECK (actor_identity_state != 'pseudonymous_visitor' OR actor_provider_id IS NOT NULL),
  -- anonymous_aggregate must NOT have an actor ID
  CONSTRAINT chk_anonymous_aggregate_no_actor_id
    CHECK (actor_identity_state != 'anonymous_aggregate' OR actor_provider_id IS NULL),
  -- is_anonymous_aggregate flag must align with identity state
  CONSTRAINT chk_anonymous_aggregate_flag_aligned
    CHECK (is_anonymous_aggregate = (actor_identity_state = 'anonymous_aggregate'))
);

-- Prevent duplicate canonical events for the same provider delivery
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_engagement_events_idempotency
  ON public.social_engagement_events (idempotency_key);

-- Fast workspace-scoped queries
CREATE INDEX IF NOT EXISTS idx_social_engagement_events_workspace
  ON public.social_engagement_events (workspace_id, created_at DESC);

-- Fast per-provider + account queries
CREATE INDEX IF NOT EXISTS idx_social_engagement_events_provider_account
  ON public.social_engagement_events (provider, account_identifier, event_timestamp DESC);

-- Row-Level Security: workspace owners see only their events
ALTER TABLE public.social_engagement_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_social_engagement_events"
  ON public.social_engagement_events
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Service-role (edge functions) may insert; authenticated users may not insert directly
CREATE POLICY "service_role_insert_social_engagement_events"
  ON public.social_engagement_events
  FOR INSERT TO service_role
  WITH CHECK (true);
