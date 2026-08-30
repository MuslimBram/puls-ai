-- P0.6 PRE3 — Community ingress idempotency and scan verdict persistence
-- Additive only. No Production execution is performed by this migration file itself.

BEGIN;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS event_id text;

ALTER TABLE public.community_interest_messages
  ADD COLUMN IF NOT EXISTS event_id text;

ALTER TABLE public.community_violations
  ADD COLUMN IF NOT EXISTS event_id text;

ALTER TABLE public.community_ai_usage
  ADD COLUMN IF NOT EXISTS result_json jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_comments_author_event
  ON public.community_comments(author_user_id, event_id)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_interest_messages_sender_event
  ON public.community_interest_messages(sender_user_id, event_id)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_violations_user_event
  ON public.community_violations(user_id, event_id)
  WHERE event_id IS NOT NULL;

-- Comments must go through the authenticated Edge Function so deterministic
-- pre-insert moderation and idempotency cannot be bypassed with Data API writes.
REVOKE INSERT, UPDATE ON TABLE public.community_comments FROM anon, authenticated;

-- Defense in depth: chat messages already have no INSERT RLS policy, but also
-- remove table-level write grants explicitly.
REVOKE INSERT, UPDATE ON TABLE public.community_interest_messages FROM anon, authenticated;

COMMENT ON COLUMN public.community_comments.event_id IS
  'Caller-generated canonical event/idempotency key for community comment creation.';
COMMENT ON COLUMN public.community_interest_messages.event_id IS
  'Caller-generated canonical event/idempotency key for community chat message creation.';
COMMENT ON COLUMN public.community_violations.event_id IS
  'Canonical event key of the blocked write that produced this violation.';
COMMENT ON COLUMN public.community_ai_usage.result_json IS
  'Persisted domain verdict/result returned for idempotent completed AI request reuse.';

COMMIT;
