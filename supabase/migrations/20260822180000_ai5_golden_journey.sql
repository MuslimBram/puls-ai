-- ============================================================
-- CANDIDATE MIGRATION — AI-5 Golden Journey
-- DO NOT APPLY TO PRODUCTION without the normal release gate.
--
-- Minimal correlation/idempotency bridge for:
-- AI-2 reasoning -> AI-3 controlled action -> appointment -> factual outcome.
-- BOOKED is deliberately not revenue/conversion.
-- ============================================================

-- 1. Make the existing appointment executor retry-safe for an AI-3 action.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS ai3_action_id UUID REFERENCES public.ai_suggested_actions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_ai3_action_once
  ON public.appointments(ai3_action_id)
  WHERE ai3_action_id IS NOT NULL;

-- 2. Minimal durable Golden Journey correlation record.
CREATE TABLE IF NOT EXISTS public.ai_golden_journey_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_ref TEXT,
  conversation_id UUID,
  ai2_request_id TEXT NOT NULL,
  ai3_action_id UUID NOT NULL REFERENCES public.ai_suggested_actions(id) ON DELETE CASCADE,
  correlation_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL DEFAULT 'RECOMMENDED'
    CHECK (outcome IN ('RECOMMENDED','APPROVED','BOOKED','COMPLETED','FAILED')),
  failure_reason TEXT,
  booked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ai3_action_id),
  UNIQUE (correlation_id),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ai5_runs_workspace_created
  ON public.ai_golden_journey_runs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai5_runs_appointment
  ON public.ai_golden_journey_runs(appointment_id)
  WHERE appointment_id IS NOT NULL;

ALTER TABLE public.ai_golden_journey_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_golden_journey_runs FROM PUBLIC, anon;
GRANT SELECT ON public.ai_golden_journey_runs TO authenticated;
GRANT ALL ON public.ai_golden_journey_runs TO service_role;

DROP POLICY IF EXISTS ai5_runs_member_read ON public.ai_golden_journey_runs;
CREATE POLICY ai5_runs_member_read ON public.ai_golden_journey_runs
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    OR EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND w.owner_id = auth.uid()
    )
  );

COMMENT ON TABLE public.ai_golden_journey_runs IS
  'AI-5 correlation bridge. BOOKED means a durable appointment exists; it never implies payment, conversion, or revenue.';

COMMENT ON COLUMN public.appointments.ai3_action_id IS
  'AI-3 controlled action that created this appointment. Unique when present to make executor retries idempotent.';
