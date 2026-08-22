-- ============================================================
-- CANDIDATE MIGRATION — AI-3 Controlled Action System
-- Branch: copilot/ai-3-controlled-action-system
--
-- DO NOT APPLY TO PRODUCTION without review.
-- Extends ai_suggested_actions with a controlled AI-3 lifecycle.
-- Backward-compatible: existing rows default to lifecycle_status='SUGGESTED'.
-- ============================================================

-- 1. Lifecycle status column (separate from legacy status field)
ALTER TABLE public.ai_suggested_actions
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'SUGGESTED';

-- 2. Idempotency key — stable identifier preventing duplicate approval submissions
ALTER TABLE public.ai_suggested_actions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- 3. Approval / decision audit fields
ALTER TABLE public.ai_suggested_actions
  ADD COLUMN IF NOT EXISTS approver_id UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 4. Payload provenance — original AI recommendation vs human-modified version
ALTER TABLE public.ai_suggested_actions
  ADD COLUMN IF NOT EXISTS original_payload JSONB,
  ADD COLUMN IF NOT EXISTS modified_payload JSONB;

-- 5. Execution tracking
ALTER TABLE public.ai_suggested_actions
  ADD COLUMN IF NOT EXISTS validation_result JSONB,
  ADD COLUMN IF NOT EXISTS execution_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS executing_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- 6. Queue correlation
ALTER TABLE public.ai_suggested_actions
  ADD COLUMN IF NOT EXISTS job_queue_id UUID;

-- 7. Provenance: who/what suggested this action
ALTER TABLE public.ai_suggested_actions
  ADD COLUMN IF NOT EXISTS suggested_by TEXT DEFAULT 'ai';

-- 8. Correlation ID for distributed tracing
ALTER TABLE public.ai_suggested_actions
  ADD COLUMN IF NOT EXISTS correlation_id UUID DEFAULT gen_random_uuid();

-- Unique idempotency index: prevents two identical approval submissions for the same key
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_actions_idempotency_key
  ON public.ai_suggested_actions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Lifecycle query index
CREATE INDEX IF NOT EXISTS idx_ai_actions_lifecycle_ws
  ON public.ai_suggested_actions (workspace_id, lifecycle_status, created_at DESC);

-- Correlation index
CREATE INDEX IF NOT EXISTS idx_ai_actions_correlation
  ON public.ai_suggested_actions (correlation_id);

-- Backfill: existing rows get lifecycle_status = 'SUGGESTED' (already the DEFAULT, explicit for safety)
UPDATE public.ai_suggested_actions
  SET lifecycle_status = 'SUGGESTED'
  WHERE lifecycle_status IS NULL OR lifecycle_status = '';

-- Constraint: lifecycle_status must be a valid value
ALTER TABLE public.ai_suggested_actions
  ADD CONSTRAINT IF NOT EXISTS chk_lifecycle_status CHECK (
    lifecycle_status IN (
      'SUGGESTED', 'APPROVED', 'MODIFIED', 'REJECTED',
      'VALIDATING', 'QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED'
    )
  );

-- Comment describing the AI-3 lifecycle column
COMMENT ON COLUMN public.ai_suggested_actions.lifecycle_status IS
  'AI-3 controlled action lifecycle: SUGGESTED→(APPROVED|MODIFIED|REJECTED|CANCELLED)→...→COMPLETED/FAILED';

COMMENT ON COLUMN public.ai_suggested_actions.idempotency_key IS
  'Stable key preventing duplicate approval/execution. Format: ai3:<action_id>:<decision>:<timestamp_s>';

COMMENT ON COLUMN public.ai_suggested_actions.original_payload IS
  'Snapshot of action_payload at time of AI suggestion, preserved for audit trail.';

COMMENT ON COLUMN public.ai_suggested_actions.modified_payload IS
  'Business-approved modifications to action parameters. NULL if approved as-is.';
