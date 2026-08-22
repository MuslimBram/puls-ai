-- SOCIAL-1E: Provider Capability + Consent + Policy
--
-- This migration is ADDITIVE ONLY.
-- It adds durable policy evaluation audit rows for SOCIAL-1E decisions.
--
-- Design:
--   - workspace-scoped (all tables have workspace_id)
--   - RLS on every table
--   - no destructive changes
--   - no duplicate consent registry (reuses global_suppression_list)
--   - no production application change
--
-- New table: social_policy_evaluation_log
--   Audit trail of ALLOW/REVIEW/BLOCK decisions.
--   NOT a source of truth for consent; consent lives in global_suppression_list.
--   This table is append-only (no UPDATE, no DELETE via RLS).

CREATE TABLE IF NOT EXISTS public.social_policy_evaluation_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL,
  provider              text NOT NULL,
  channel_type          text NOT NULL,
  identity_state        text NOT NULL
    CHECK (identity_state IN (
      'known_person', 'platform_actor', 'pseudonymous_visitor', 'anonymous_aggregate'
    )),
  interaction_type      text NOT NULL
    CHECK (interaction_type IN (
      'outbound_reply', 'proactive_outbound', 'inbound_response', 'comment', 'reaction'
    )),
  decision              text NOT NULL
    CHECK (decision IN ('ALLOW', 'REVIEW', 'BLOCK')),
  reasons               text[] NOT NULL DEFAULT '{}',
  capability_verified   boolean NOT NULL DEFAULT false,
  consent_valid         boolean NOT NULL DEFAULT false,
  intent_score_presented numeric(5,4),
  evaluated_at          timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- Prevent storing contact identifiers in audit log (privacy)
  -- contact_identifier is intentionally omitted
  CONSTRAINT chk_social_policy_decision_valid
    CHECK (decision IN ('ALLOW', 'REVIEW', 'BLOCK'))
);

-- Workspace-scoped index for querying recent policy decisions
CREATE INDEX IF NOT EXISTS idx_social_policy_log_workspace
  ON public.social_policy_evaluation_log (workspace_id, evaluated_at DESC);

-- Provider+channel index for capability audit
CREATE INDEX IF NOT EXISTS idx_social_policy_log_provider_channel
  ON public.social_policy_evaluation_log (provider, channel_type, decision);

-- Row-Level Security
ALTER TABLE public.social_policy_evaluation_log ENABLE ROW LEVEL SECURITY;

-- Workspace members may SELECT their own workspace rows
CREATE POLICY "workspace_members_select_policy_log"
  ON public.social_policy_evaluation_log
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Service role may INSERT (edge functions write audit rows)
CREATE POLICY "service_role_insert_policy_log"
  ON public.social_policy_evaluation_log
  FOR INSERT TO service_role
  WITH CHECK (true);

-- No UPDATE or DELETE policies intentionally (append-only audit log)
